import { describe, expect, it } from 'vitest';
import { createStarterCharacterForServer } from '../server/starter.ts';
import { getMapById } from '../shared/data/maps.ts';
import { spawnPlayerFromCharacter } from '../shared/sim/playerEntity.ts';
import { acquireTarget, createWorld, fireMainCannon, hashWorldState, spawnVehicle, stepWorld, World } from '../shared/sim/world.ts';
import type { SimCommand, SimEntity } from '../shared/types.ts';

const NONE = new Map<number, SimCommand[]>();
const cmd = (id: number, ...c: SimCommand[]) => new Map<number, SimCommand[]>([[id, c]]);

function duel(dist = 600, opts: { safe?: { x: number; y: number; radius: number } } = {}) {
  const w = createWorld({ map: getMapById(23) as any, seed: 11, populate: false });
  w.safeZones = opts.safe ? [{ ...opts.safe, name: 's' } as any] : [];
  const ch = createStarterCharacterForServer('P', 'coastal'); ch.level = 20;
  const me = spawnPlayerFromCharacter(w, ch, { x: 1500, y: 2000 });
  me.invulnerableTime = 0; me.mgDamage = 0; me.mainRange = 900; me.critChance = 0;
  const foe = spawnVehicle(w, 'gunner_truck', 'Foe', 20, { x: 1500 + dist, y: 2000 }, { isHostile: true, maxHull: 1e6, maxArmor: 0, maxSpeed: 300, radius: 30 });
  foe.hull = foe.maxHull = 1e6; foe.armor = 0; foe.invulnerableTime = 0; foe.aiState = undefined; // inert target we move by hand
  return { w, me, foe };
}
/** the target drives at full speed in direction `a` (turning is instant so the test controls the path exactly) */
const drive = (e: SimEntity, a: number) => { e.chassisAngle = a; e.desiredDriveAngle = a; e.targetSpeed = e.maxSpeed; };
const shells = (w: World) => [...w.entities.values()].filter((e) => e.kind === 'projectile');
function fireAndWait(w: World, me: SimEntity, foe: SimEntity, strafe: (t: number) => void, maxTicks = 150) {
  const before = foe.hull;
  me.mainReloadRemaining = 0;
  stepWorld(w, cmd(me.id, { type: 'SetTarget', targetId: foe.id }));
  me.turretAngle = Math.atan2(foe.pos.y - me.pos.y, foe.pos.x - me.pos.x);
  stepWorld(w, cmd(me.id, { type: 'FireMain' }));
  for (let t = 0; t < maxTicks && shells(w).length; t++) { strafe(t); stepWorld(w, NONE); }
  return before - foe.hull;
}

describe('shots always hit', () => {
  it('a shell fired at a target strafing at full speed in various directions always lands', () => {
    for (let k = 0; k < 24; k++) {
      const { w, me, foe } = duel(300 + (k % 6) * 100);
      const a = (k / 24) * Math.PI * 2;
      const dealt = fireAndWait(w, me, foe, () => drive(foe, a));
      expect(dealt, `direction ${k}`).toBeGreaterThan(0);
    }
  });

  it('keeps hitting a target that zig-zags', () => {
    const { w, me, foe } = duel(700);
    let n = 0;
    const dealt = fireAndWait(w, me, foe, (t) => { drive(foe, Math.floor(t / 8) % 2 ? Math.PI / 2 : -Math.PI / 2); n++; });
    expect(dealt).toBeGreaterThan(0); expect(n).toBeGreaterThan(5);
  });

  it('misses when the target enters a safe zone, becomes invulnerable or dies; the shell does not hit anything else', () => {
    const safe = duel(600, { safe: { x: 2100, y: 2800, radius: 150 } });
    const dealt1 = fireAndWait(safe.w, safe.me, safe.foe, () => { safe.foe.pos = { x: 2100, y: 2800 }; safe.foe.vel = { x: 0, y: 0 }; });
    expect(dealt1).toBe(0);
    const inv = duel(600);
    const dealt2 = fireAndWait(inv.w, inv.me, inv.foe, () => { inv.foe.invulnerableTime = 5; });
    expect(dealt2).toBe(0);
    const dead = duel(600);
    dead.me.mainReloadRemaining = 0;
    stepWorld(dead.w, cmd(dead.me.id, { type: 'SetTarget', targetId: dead.foe.id }));
    stepWorld(dead.w, cmd(dead.me.id, { type: 'FireMain' }));
    dead.foe.hull = 0;
    for (let t = 0; t < 100; t++) stepWorld(dead.w, NONE);
    expect(dead.foe.hull).toBe(0);
  });

  it('a target that runs away out of range plus the grace margin is not chased forever', () => {
    const { w, me, foe } = duel(800);
    const dealt = fireAndWait(w, me, foe, () => { foe.pos.x += 400 / 30 * 3; foe.vel = { x: 1200, y: 0 }; }, 400); // three times a tank's top speed
    expect(dealt).toBe(0);
    expect(shells(w)).toHaveLength(0);
  });

  it('without any target the shell flies straight and carries no guidance', () => {
    const { w, me } = duel(2500); // far outside weapon range
    me.mainReloadRemaining = 0; me.turretAngle = 0.3;
    stepWorld(w, cmd(me.id, { type: 'FireMain' }));
    const s = shells(w)[0];
    expect(s.targetId).toBeUndefined();
    const a0 = Math.atan2(s.vel.y, s.vel.x);
    for (let t = 0; t < 20; t++) stepWorld(w, NONE);
    expect(Math.atan2(s.vel.y, s.vel.x)).toBeCloseTo(a0, 6);
  });

  it('a locked shot fired past a solid obstacle still lands (shells fly over obstacles)', () => {
    const { w, me, foe } = duel(600);
    w.obstacles = [{ x: 1800, y: 2000, radius: 40, type: 'rock' }];
    expect(fireAndWait(w, me, foe, () => {})).toBeGreaterThan(0);
  });

  it('the fire button and auto-fire pick the nearest valid enemy and keep it', () => {
    const { w, me, foe } = duel(500);
    const far = spawnVehicle(w, 'gunner_truck', 'Far', 20, { x: 1500, y: 2700 }, { isHostile: true, maxHull: 1e6, maxArmor: 0, maxSpeed: 0, radius: 30 });
    far.hull = far.maxHull = 1e6; far.invulnerableTime = 0; far.aiState = undefined;
    me.mainReloadRemaining = 0;
    stepWorld(w, cmd(me.id, { type: 'FireMain' }));
    expect(me.targetId).toBe(foe.id);
    expect(shells(w)[0].targetId).toBe(foe.id);
    // auto-fire on with no lock: picks one by itself and sticks to it
    me.targetId = undefined; me.autoFire = true;
    for (let t = 0; t < 10; t++) stepWorld(w, NONE);
    expect(me.targetId).toBe(foe.id);
    const locked = me.targetId;
    for (let t = 0; t < 60; t++) stepWorld(w, NONE);
    expect(me.targetId).toBe(locked);
    // nothing valid in a safe zone / out of range
    foe.hull = 0; far.hull = 0;
    expect(acquireTarget(w, me)).toBeUndefined();
  });

  it('enemies hit a strafing player too', () => {
    const w = createWorld({ map: getMapById(23) as any, seed: 3, populate: false }); w.safeZones = [];
    const ch = createStarterCharacterForServer('P', 'coastal'); ch.level = 20;
    const me = spawnPlayerFromCharacter(w, ch, { x: 1500, y: 2000 }); me.invulnerableTime = 0; me.maxSpeed = 300;
    const hull0 = me.hull + me.armor;
    const foe = spawnVehicle(w, 'gunner_truck', 'Foe', 20, { x: 1900, y: 2000 }, { isHostile: true, maxHull: 1e6, maxArmor: 0, maxSpeed: 0, radius: 30 });
    foe.mainDamage = 80; foe.aiState = undefined; foe.hull = foe.maxHull = 1e6; foe.invulnerableTime = 0; foe.mainRange = 900;
    foe.targetId = me.id; foe.mainReloadRemaining = 0;
    foe.turretAngle = Math.PI;
    let dir = 1;
    for (let t = 0; t < 150; t++) { if (t % 10 === 0) dir = -dir; me.pos.y += 8 * dir; me.vel = { x: 0, y: 240 * dir }; if (t === 0) stepWorld(w, new Map([[foe.id, [{ type: 'FireMain' } as SimCommand]]])); else stepWorld(w, NONE); }
    expect(me.hull + me.armor).toBeLessThan(hull0);
  });

  it('is deterministic: two identical runs end in the same state', () => {
    const run = () => {
      const { w, me, foe } = duel(550);
      me.autoFire = true; me.targetId = foe.id;
      for (let t = 0; t < 300; t++) { foe.pos.y += Math.sin(t / 7) * 6; stepWorld(w, NONE); }
      return hashWorldState(w);
    };
    expect(run()).toBe(run());
  });
});
