import { describe, expect, it } from 'vitest';
import { getAllMaps } from '../shared/data/maps.ts';
import { createWorld, spawnVehicle, stepWorld } from '../shared/sim/world.ts';
import { SimCommand } from '../shared/types.ts';

const NONE = new Map<number, SimCommand[]>();
const maps = getAllMaps() as any[];

describe('enemies do not camp a player who stands in a safe zone', () => {
  it('an enemy in aggro range ignores a player inside the zone and drops a target that retreats into it', () => {
    const w: any = createWorld({ map: maps[0], seed: 2, populate: false });
    const z = w.safeZones[0];
    const e = spawnVehicle(w, 'scout_buggy', 'E', 5, { x: z.x + z.radius + 250, y: z.y }, { maxHull: 5000, isHostile: true });
    e.aiState = 'patrol'; e.aggroRange = 900; e.homePos = { ...e.pos }; e.leashRange = 2000;
    const p = spawnVehicle(w, 'player', 'P', 3, { x: z.x + z.radius - 30, y: z.y }, { maxHull: 1e9, maxArmor: 1e9 }); // inside, 280 units from the enemy
    for (let i = 0; i < 90; i++) stepWorld(w, NONE);
    expect(e.targetId).toBeUndefined();
    // outside the zone it is hunted, and the target is dropped again on retreat
    p.pos = { x: z.x + z.radius + 120, y: z.y };
    for (let i = 0; i < 30; i++) stepWorld(w, NONE);
    expect(e.targetId).toBe(p.id);
    p.pos = { x: z.x, y: z.y };
    for (let i = 0; i < 30; i++) stepWorld(w, NONE);
    expect(e.targetId).toBeUndefined();
  });
});
