/**
 * Faction war (design doc section 8): control points on maps 21-24. Capture by standing in the zone; contested when two
 * factions are present. Owned points produce score per second; the weekly winner gets cosmetics and a market discount.
 */
import type { World } from './world.ts';

export interface WarPoint {
  id: string;
  x: number;
  y: number;
  radius: number;
  owner?: string;
  progress: Record<string, number>; // 0..100 per faction
  contested: boolean;
}

export const WAR_MAPS = [21, 22, 23, 24];
export const CAPTURE_PER_SECOND = 8; // ~12.5 s to take an empty point
export const DECAY_PER_SECOND = 4;
export const SCORE_PER_POINT_SECOND = 1;
export const FACTIONS = ['coastal', 'highland', 'steppe'] as const;

export function createWarPoints(mapId: number, width: number, height: number): WarPoint[] {
  if (!WAR_MAPS.includes(mapId)) return [];
  const spots: Array<[number, number]> = [[0.5, 0.5], [0.25, 0.3], [0.75, 0.7]];
  return spots.map(([fx, fy], i) => ({ id: `cp_${mapId}_${i + 1}`, x: Math.round(width * fx), y: Math.round(height * fy), radius: 180, progress: { coastal: 0, highland: 0, steppe: 0 }, contested: false }));
}

export function stepWar(world: World, dt: number): void {
  if (!world.war) return;
  for (const p of world.war) {
    const present = new Set<string>();
    for (const e of world.entities.values()) {
      if (e.kind !== 'player' || e.hull <= 0 || !e.faction) continue;
      if ((e.pos.x - p.x) ** 2 + (e.pos.y - p.y) ** 2 <= p.radius ** 2) present.add(e.faction);
    }
    p.contested = present.size > 1;
    if (present.size === 1) {
      const f = [...present][0];
      p.progress[f] = Math.min(100, p.progress[f] + CAPTURE_PER_SECOND * dt);
      for (const o of FACTIONS) if (o !== f) p.progress[o] = Math.max(0, p.progress[o] - CAPTURE_PER_SECOND * dt);
      if (p.progress[f] >= 100) p.owner = f;
    } else if (present.size === 0) {
      for (const o of FACTIONS) if (o !== p.owner) p.progress[o] = Math.max(0, p.progress[o] - DECAY_PER_SECOND * dt);
    }
    if (p.owner && p.progress[p.owner] < 100) { if (FACTIONS.some((f) => f !== p.owner && p.progress[f] >= 100)) p.owner = FACTIONS.find((f) => p.progress[f] >= 100); else if (p.progress[p.owner] <= 0) p.owner = undefined; }
    if (p.owner) world.warScore[p.owner] = (world.warScore[p.owner] ?? 0) + SCORE_PER_POINT_SECOND * dt;
  }
}

/** Weekly cycle: the faction with the most score wins; ties or no score -> no winner. */
export function weeklyWinner(scores: Record<string, number>): string | undefined {
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted.length && sorted[0][1] > 0 && (sorted.length < 2 || sorted[0][1] > sorted[1][1]) ? sorted[0][0] : undefined;
}

export const WAR_WINNER_MARKET_DISCOUNT = 0.02; // cosmetic + convenience only, never combat stats

// ---------------------------------------------------------------------------
// Weekly result and rewards (cloud run 3)
// ---------------------------------------------------------------------------

/** Seconds spent contributing to a control point of the own faction that a player needs for the weekly reward. */
export const WAR_CLAIM_MIN_SECONDS = 120;
/** What the winning faction's contributors can claim once for the week that just ended (the 2 % market discount applies automatically). */
export const WAR_REWARD = { scrap: 1000, seasonMarks: 40, title: 'War Victor' } as const;

/** Seconds a full capture takes with one faction on an empty point (derived from the rates, used by the war screen). */
export const CAPTURE_SECONDS = Math.ceil(100 / CAPTURE_PER_SECOND);

/** Is a player at `pos` of `faction` fighting for this point (standing on it while it is theirs or they are taking it)? */
export function contributesTo(point: WarPoint, pos: { x: number; y: number }, faction: string): boolean {
  if ((pos.x - point.x) ** 2 + (pos.y - point.y) ** 2 > point.radius ** 2) return false;
  return point.owner === faction || point.progress[faction] > 0;
}
