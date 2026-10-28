import { describe, expect, it } from 'vitest';
import { getAllMaps } from '../shared/data/maps.ts';
import { createWorld, provokeEnemy, spawnVehicle, stepWorld } from '../shared/sim/world.ts';
import { SimCommand } from '../shared/types.ts';

const NONE = new Map<number, SimCommand[]>();
const maps = getAllMaps() as any[];
const byId = (id: number) => maps.find((m) => (m.numericId ?? m.id) === id);

function arena(mapId: number) {
  const w: any = createWorld({ map: byId(mapId), seed: 4, populate: false });
  const z = w.safeZones[0];
  const home = { x: z.x + z.radius + 900, y: z.y };
  const mk = (kind: string, dx: number, dy = 0) => {
    const e = spawnVehicle(w, kind as any, 'E', 5, { x: home.x + dx, y: home.y + dy }, { maxHull: 5000, isHostile: true });
    e.aiState = 'patrol'; e.aggroRange = 600; e.homePos = { ...e.pos }; e.leashRange = 900; e.targetSpeed = 0;
    return e;
  };
  const p = spawnVehicle(w, 'player', 'P', 3, { x: home.x - 250, y: home.y }, { maxHull: 1e9, maxArmor: 1e9 });
  return { w, p, mk };
}

describe('enemies are not all aggressive at once', () => {
  it('on a starter map scouts ignore a player 250 units away, trucks only react at close range', () => {
    const { w, p, mk } = arena(1);
    const scout = mk('scout_buggy', 0);
    const truck = mk('gunner_truck', 0, 700);
    for (let i = 0; i < 60; i++) stepWorld(w, NONE);
    expect(scout.targetId).toBeUndefined();
    expect(truck.targetId).toBeUndefined();
    p.pos = { x: truck.pos.x - 200, y: truck.pos.y }; // inside the truck's 320 range
    for (let i = 0; i < 30; i++) stepWorld(w, NONE);
    expect(truck.targetId).toBe(p.id);
  });

  it('a hurt scout fights back and nearby scouts of its kind help', () => {
    const { w, p, mk } = arena(1);
    const a = mk('scout_buggy', 0);
    const b = mk('scout_buggy', 120);
    const far = mk('scout_buggy', 900);
    provokeEnemy(w, a, p.id);
    for (let i = 0; i < 10; i++) stepWorld(w, NONE);
    expect(a.targetId).toBe(p.id);
    expect(b.targetId).toBe(p.id);
    expect(far.targetId).toBeUndefined();
  });

  it('on a higher map and for invasion raiders the full aggro range applies', () => {
    const hi = arena(10);
    const s = hi.mk('scout_buggy', 0);
    for (let i = 0; i < 30; i++) stepWorld(hi.w, NONE);
    expect(s.targetId).toBe(hi.p.id);
    const inv = arena(1);
    const r = inv.mk('scout_buggy', 0); r.fromInvasion = true;
    for (let i = 0; i < 30; i++) stepWorld(inv.w, NONE);
    expect(r.targetId).toBe(inv.p.id);
  });
});
