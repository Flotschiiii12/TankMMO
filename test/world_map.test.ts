import { describe, expect, it } from 'vitest';
import { MAP_CONNECTIONS, MAP_METADATA_TABLE } from '../shared/data/maps.ts';
import { EVENT_RULES } from '../shared/sim/events.ts';
import { levelFit, mapHops, neighborsOf, NODE_POSITIONS, territoryOf, travelInfo, zoneMarkers } from '../src/ui/world/worldLogic.ts';

describe('world map logic', () => {
  it('has a position for each of the 30 zones and the graph is connected and symmetric', () => {
    const ids = Object.keys(MAP_METADATA_TABLE).map(Number); expect(ids).toHaveLength(30);
    for (const id of ids) expect(NODE_POSITIONS[id], `position of ${id}`).toBeTruthy();
    for (const id of ids) expect(mapHops(1, id), `1 -> ${id}`).not.toBeUndefined();
    for (const e of MAP_CONNECTIONS as ReadonlyArray<readonly [number, number]>) { expect(mapHops(e[0], e[1])).toBe(1); expect(neighborsOf(e[0])).toContain(e[1]); expect(mapHops(e[1], e[0])).toBe(1); }
    expect(mapHops(5, 5)).toBe(0);
    for (const [a, b] of [[1, 20], [9, 29], [30, 4]]) expect(mapHops(a, b)).toBe(mapHops(b, a));
  });
  it('fast travel blocks in the same order and for the same reasons as the server', () => {
    const base = { from: 1, to: 3, visited: [1, 2, 3], level: 10, scrap: 10_000, inSafeZone: true };
    expect(travelInfo(base)).toMatchObject({ allowed: true, hops: mapHops(1, 3), cost: 150 * mapHops(1, 3)! });
    expect(travelInfo({ ...base, inSafeZone: false }).reason).toBe('not_in_safe_zone');
    expect(travelInfo({ ...base, visited: [1] }).reason).toBe('not_visited');
    expect(travelInfo({ ...base, to: 1 }).reason).toBe('same_zone');
    expect(travelInfo({ ...base, scrap: 10 }).reason).toBe('not_enough_scrap');
    const far = 25; expect(travelInfo({ ...base, to: far, visited: [1, far], level: 1 }).reason).toBe('level_too_low');
    expect(travelInfo({ ...base, to: far, visited: [1, far], level: MAP_METADATA_TABLE[far].levelRange[0] - 5, scrap: 1e6 }).allowed).toBe(true);
  });
  it('level fit bands', () => {
    expect(levelFit(10, [8, 12])).toBe('fit'); expect(levelFit(5, [8, 12])).toBe('tough'); expect(levelFit(1, [10, 14])).toBe('too_high'); expect(levelFit(40, [8, 12])).toBe('low');
  });
  it('territories and markers: PvP and war zones, safe hubs, events only where the schedule says', () => {
    expect(territoryOf(MAP_METADATA_TABLE[21])).toBe('pvp'); expect(territoryOf(MAP_METADATA_TABLE[30])).toBe('arena');
    const inv = EVENT_RULES.find((r) => r.kind === 'invasion')!; const t = inv.offsetSeconds + 3 * 3600 + 5; // inside a window
    const m = zoneMarkers(t);
    for (const id of inv.mapIds!) expect(m.get(id)!.events).toContain('invasion');
    expect(m.get(13)!.events).not.toContain('invasion');
    expect(m.get(21)!.war).toBe(true); expect(m.get(21)!.pvp).toBe(true); expect(m.get(1)!.war).toBe(false);
    expect([...m.values()].some((z) => z.safe)).toBe(true);
  });
});
