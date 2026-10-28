/** Pure logic of the world map screen: layout, hops and fast-travel rules (same as the server), fog, markers. */
import { MAP_CONNECTIONS, MAP_METADATA_TABLE, type MapMetadata } from '../../../shared/data/maps.ts';
import { EVENT_RULES, activeEvents, type WorldEventKind } from '../../../shared/sim/events.ts';
import { WAR_MAPS } from '../../../shared/sim/war.ts';
import { fastTravelCost } from '../../../shared/rules/character.ts';

/** Node positions on the 1200 x 520 world map canvas. */
export const NODE_POSITIONS: Record<number, { x: number; y: number }> = {
  1: { x: 80, y: 110 }, 2: { x: 170, y: 150 }, 3: { x: 260, y: 190 }, 4: { x: 350, y: 240 },
  5: { x: 320, y: 60 }, 6: { x: 380, y: 110 }, 7: { x: 440, y: 160 }, 8: { x: 470, y: 220 },
  9: { x: 90, y: 390 }, 10: { x: 190, y: 370 }, 11: { x: 290, y: 340 }, 12: { x: 380, y: 310 },
  13: { x: 500, y: 340 }, 14: { x: 480, y: 270 }, 15: { x: 580, y: 250 }, 16: { x: 670, y: 240 }, 17: { x: 750, y: 220 }, 18: { x: 820, y: 190 }, 19: { x: 850, y: 280 }, 20: { x: 890, y: 360 },
  21: { x: 610, y: 360 }, 22: { x: 720, y: 350 }, 23: { x: 810, y: 380 }, 24: { x: 740, y: 440 },
  25: { x: 950, y: 440 }, 26: { x: 1040, y: 410 }, 27: { x: 1080, y: 320 }, 28: { x: 1060, y: 210 }, 29: { x: 1120, y: 130 },
  30: { x: 500, y: 440 },
};
export const MAP_SIZE = { w: 1200, h: 520 };

const adjacency = (() => { const adj = new Map<number, number[]>(); for (const e of MAP_CONNECTIONS as ReadonlyArray<readonly [number, number]>) { adj.set(e[0], [...(adj.get(e[0]) ?? []), e[1]]); adj.set(e[1], [...(adj.get(e[1]) ?? []), e[0]]); } return adj; })();
/** Portal hops between two zones (breadth first, like the server's fast travel). undefined when not connected. */
export function mapHops(from: number, to: number): number | undefined {
  const dist = new Map<number, number>([[from, 0]]); const q = [from];
  while (q.length) { const x = q.shift()!; for (const y of adjacency.get(x) ?? []) if (!dist.has(y)) { dist.set(y, dist.get(x)! + 1); q.push(y); } }
  return dist.get(to);
}
export const neighborsOf = (id: number): number[] => adjacency.get(id) ?? [];

export type TravelBlock = 'same_zone' | 'not_visited' | 'unreachable' | 'level_too_low' | 'not_enough_scrap' | 'not_in_safe_zone';
export interface TravelInfo { allowed: boolean; cost: number; hops: number; reason?: TravelBlock }
/** Mirrors the server's `fast_travel` checks in the same order, so the button says no for the same reason the server would. */
export function travelInfo(args: { from: number; to: number; visited: readonly number[]; level: number; scrap: number; inSafeZone: boolean }): TravelInfo {
  const { from, to } = args; const meta = MAP_METADATA_TABLE[to];
  const hops = mapHops(from, to);
  const cost = hops === undefined ? 0 : fastTravelCost(hops);
  const block = (reason: TravelBlock): TravelInfo => ({ allowed: false, cost, hops: hops ?? 0, reason });
  if (!args.inSafeZone) return block('not_in_safe_zone');
  if (!args.visited.includes(to)) return block('not_visited');
  if (to === from) return block('same_zone');
  if (hops === undefined) return block('unreachable');
  if (args.scrap < cost) return block('not_enough_scrap');
  if (meta && args.level < (meta.levelRange?.[0] ?? 1) - 5) return block('level_too_low');
  return { allowed: true, cost, hops };
}

/** How a zone's level range relates to the player: comfortable, tough (up to 5 above) or too high (cannot travel, > 5 above). */
export function levelFit(level: number, range: readonly [number, number]): 'low' | 'fit' | 'tough' | 'too_high' {
  if (level > range[1] + 8) return 'low';
  if (level >= range[0]) return 'fit';
  return level >= range[0] - 5 ? 'tough' : 'too_high';
}

export type Territory = 'coastal' | 'highland' | 'steppe' | 'neutral' | 'pvp' | 'endgame' | 'arena';
export function territoryOf(meta: MapMetadata): Territory {
  if (meta.type === 'PVP') return 'pvp'; if (meta.type === 'ENDGAME') return 'endgame'; if (meta.type === 'ARENA') return 'arena';
  return meta.faction === 'coastal_union' ? 'coastal' : meta.faction === 'highland_union' ? 'highland' : meta.faction === 'steppe_caravan' ? 'steppe' : 'neutral';
}
export const TERRITORY_COLOR: Record<Territory, string> = { coastal: '#38bdf8', highland: '#4ade80', steppe: '#fbbf24', neutral: '#94a3b8', pvp: '#f87171', endgame: '#c084fc', arena: '#f472b6' };

export interface ZoneMarkers { events: WorldEventKind[]; war: boolean; pvp: boolean; safe: boolean; gate: boolean }
/** What is happening on every zone right now (events from the shared schedule), plus the static markers. */
export function zoneMarkers(nowSeconds: number): Map<number, ZoneMarkers> {
  const running = activeEvents(nowSeconds); const out = new Map<number, ZoneMarkers>();
  for (const meta of Object.values(MAP_METADATA_TABLE)) {
    const events = running.filter((e) => { const r = EVENT_RULES.find((x) => x.kind === e.kind); return e.kind === 'weekend_xp' ? false : !r?.mapIds || r.mapIds.includes(meta.id); }).map((e) => e.kind);
    out.set(meta.id, { events, war: WAR_MAPS.includes(meta.id), pvp: meta.type === 'PVP', safe: meta.type === 'HUB' || meta.type === 'HOME', gate: !!meta.hubGateId });
  }
  return out;
}
export const isVisited = (visited: readonly number[], id: number): boolean => visited.includes(id);
