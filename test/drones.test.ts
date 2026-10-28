import { describe, expect, it } from 'vitest';
import { createStarterCharacterForServer } from '../server/starter.ts';
import { SimRNG } from '../shared/prng.ts';
import * as C from '../shared/rules/character.ts';
import { getMapById } from '../shared/data/maps.ts';
import { compactEntity } from '../shared/net/delta.ts';
import { dronePosition, DRONE_TYPES, MAX_MINES_PER_OWNER, stepDrones } from '../shared/sim/drones.ts';
import { spawnPlayerFromCharacter } from '../shared/sim/playerEntity.ts';
import { createWorld, dealDirectDamage, hashWorldState, spawnVehicle, stepWorld, World } from '../shared/sim/world.ts';
import type { DroneSpec, SimCommand, SimEntity } from '../shared/types.ts';

const NONE = new Map<number, SimCommand[]>();
const spec = (type: string, power = 120, slot = 0, tier = 3): DroneSpec => ({ type, tier, slot, power });

function arena(drones: DroneSpec[], opts: { safe?: boolean } = {}) {
  const w = createWorld({ map: getMapById(23) as any, seed: 5, populate: false });
  w.safeZones = opts.safe ? [{ x: 2000, y: 2000, radius: 600, name: 's' } as any] : [];
  const ch = createStarterCharacterForServer('P', 'coastal'); ch.level = 20;
  const me = spawnPlayerFromCharacter(w, ch, { x: 2000, y: 2000 });
  me.invulnerableTime = 0; me.drones = drones;
  const foe = spawnVehicle(w, 'scout_buggy', 'Foe', 20, { x: 2250, y: 2000 }, { isHostile: true, maxHull: 5000, maxArmor: 0, maxSpeed: 0 });
  foe.hull = foe.maxHull = 5000; foe.armor = foe.maxArmor = 0; foe.invulnerableTime = 0; foe.targetSpeed = 0;
  return { w, me, foe };
}
const run = (w: World, ticks: number) => { for (let i = 0; i < ticks; i++) stepWorld(w, NONE); };
const lock = (me: SimEntity, foe: SimEntity) => { me.targetId = foe.id; me.mgDamage = 0; me.mainReloadRemaining = 1e9; }; // only the drone acts

describe('drone formations', () => {
  it('positions are a pure function of owner pose, slot and time, keep a short distance and differ per slot', () => {
    const owner = { pos: { x: 100, y: 200 }, chassisAngle: 0.7, radius: 30 };
    for (const type of DRONE_TYPES) {
      const a = dronePosition(owner, { type, slot: 0 }, 12.5); const b = dronePosition(owner, { type, slot: 0 }, 12.5);
      expect(a).toEqual(b);
      const c = dronePosition(owner, { type, slot: 1 }, 12.5);
      expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeGreaterThan(10);
      expect(Math.hypot(a.x - owner.pos.x, a.y - owner.pos.y)).toBeLessThan(160);
    }
    // wing drones keep their side when the vehicle turns
    const sentinel = dronePosition({ ...owner, chassisAngle: 0 }, { type: 'sentinel', slot: 0 }, 0);
    expect(sentinel.y).toBeGreaterThan(owner.pos.y);
  });
});

describe('drone effects', () => {
  it('sentinel shoots the locked target, repeatedly, and does nothing in a safe zone', () => {
    const { w, me, foe } = arena([spec('sentinel')]); lock(me, foe);
    run(w, 200);
    expect(foe.hull).toBeLessThan(foe.maxHull);
    const hits = foe.maxHull - foe.hull;
    run(w, 200);
    expect(foe.maxHull - foe.hull).toBeGreaterThan(hits * 1.5);
    const safe = arena([spec('sentinel')], { safe: true }); lock(safe.me, safe.foe);
    run(safe.w, 150);
    expect(safe.foe.hull).toBe(safe.foe.maxHull);
  });

  it('arc drone chains to enemies near the target', () => {
    const { w, me, foe } = arena([spec('arc_drone')]); lock(me, foe);
    const other = spawnVehicle(w, 'scout_buggy', 'Other', 20, { x: 2330, y: 2000 }, { isHostile: true, maxHull: 5000, maxArmor: 0, maxSpeed: 0 });
    other.hull = other.maxHull = 5000; other.armor = 0; other.invulnerableTime = 0;
    const far = spawnVehicle(w, 'scout_buggy', 'Far', 20, { x: 2250, y: 2800 }, { isHostile: true, maxHull: 5000, maxArmor: 0, maxSpeed: 0 });
    far.hull = far.maxHull = 5000; far.armor = 0; far.invulnerableTime = 0;
    run(w, 100);
    expect(foe.hull).toBeLessThan(5000); expect(other.hull).toBeLessThan(5000);
    expect(far.hull).toBe(5000);
    expect(w.events.length >= 0).toBe(true);
  });

  it('repair bot heals only out of combat', () => {
    const { w, me } = arena([spec('repair_bot')]);
    me.hull = me.maxHull * 0.5; me.lastDamagedTick = w.tick; me.armorRegenTimer = 0;
    run(w, 100); // < 4 s since the last hit
    expect(me.hull).toBeCloseTo(me.maxHull * 0.5, 0);
    run(w, 300);
    expect(me.hull).toBeGreaterThan(me.maxHull * 0.5 + 1);
  });

  it('guardian takes a share of incoming damage until its pool is empty, and refills out of combat', () => {
    const hit = (drones: DroneSpec[]) => { const { w, me, foe } = arena(drones); me.armor = 0; me.hull = me.maxHull; stepWorld(w, NONE); dealDirectDamage(w, foe, me, 400); return { lost: me.maxHull - me.hull, w, me, foe }; };
    const plain = hit([]).lost; const g = hit([spec('guardian', 400)]);
    expect(g.lost).toBeLessThan(plain * 0.85);
    expect(g.lost).toBeGreaterThan(plain * 0.4);
    // a flood of damage drains the pool, later hits are not reduced any more
    for (let i = 0; i < 40; i++) { g.me.hull = g.me.maxHull; dealDirectDamage(g.w, g.foe, g.me, 400); }
    g.me.hull = g.me.maxHull; dealDirectDamage(g.w, g.foe, g.me, 400);
    expect(g.me.maxHull - g.me.hull).toBeGreaterThan(plain * 0.95);
    run(g.w, 30 * 20); // out of combat: refills
    g.me.hull = g.me.maxHull; dealDirectDamage(g.w, g.foe, g.me, 400);
    expect(g.me.maxHull - g.me.hull).toBeLessThan(plain * 0.85);
  });

  it('aegis raises a short shield after a hit, then needs its cooldown', () => {
    const { w, me, foe } = arena([spec('aegis', 120, 0, 3)]);
    me.armor = 0; me.hull = me.maxHull; me.lastDamagedTick = w.tick;
    run(w, 20);
    const plain = arena([]); plain.me.armor = 0; plain.me.hull = plain.me.maxHull; dealDirectDamage(plain.w, plain.foe, plain.me, 1000);
    me.hull = me.maxHull; dealDirectDamage(w, foe, me, 1000);
    const shielded = me.maxHull - me.hull;
    expect(shielded).toBeLessThan((plain.me.maxHull - plain.me.hull) * 0.5);
    expect(w.droneRt.get(me.id).aegisUntil).toBeGreaterThan(w.time);
    run(w, 30 * 6); // shield gone, cooldown running (16 s)
    me.hull = me.maxHull; me.lastDamagedTick = w.tick; dealDirectDamage(w, foe, me, 1000);
    expect(me.maxHull - me.hull).toBeGreaterThan((plain.me.maxHull - plain.me.hull) * 0.95);
  });

  it('interceptor shoots down an incoming enemy shell and weakens a telegraph aimed at the owner', () => {
    const { w, me, foe } = arena([spec('interceptor')]);
    run(w, 20);
    const shell = spawnVehicle(w, 'projectile', 'shell', 1, { x: 2200, y: 2000 }, { isHostile: true, maxSpeed: 0 });
    (shell as any).sourceEntityId = foe.id; shell.isHostile = true;
    stepDrones(w, 1 / 30);
    expect(w.entities.has(shell.id)).toBe(false);
    const tele = spawnVehicle(w, 'telegraph', 'tele', 1, { x: 2020, y: 2000 }, { isHostile: true, maxSpeed: 0 });
    tele.isHostile = true; tele.telegraphRadius = 150; tele.telegraphDamage = 1000; tele.telegraphDuration = 3;
    stepDrones(w, 1 / 30); stepDrones(w, 1 / 30);
    expect(tele.telegraphDamage).toBe(700); // once, -30 % at tier 3
    void me;
  });

  it('sapper lays at most three mines while moving near enemies; a mine slows and hurts the enemy that drives over it, and expires with its owner', () => {
    const { w, me, foe } = arena([spec('sapper', 120, 0, 3)]);
    foe.pos = { x: 2500, y: 2000 };
    me.vel = { x: 80, y: 0 };
    for (let i = 0; i < 30 * 40; i++) { me.vel = { x: 80, y: 0 }; me.pos = { x: 2000 + (i % 300) * 0.1, y: 2000 }; stepDrones(w, 1 / 30); w.time += 1 / 30; w.tick++; }
    const mines = [...w.entities.values()].filter((e) => e.kind === 'mine');
    expect(mines.length).toBeGreaterThan(0);
    expect(mines.length).toBeLessThanOrEqual(MAX_MINES_PER_OWNER);
    const m = mines[0];
    foe.pos = { ...m.pos };
    stepDrones(w, 1 / 30);
    expect(foe.statusEffects.some((s) => s.type === 'slowed')).toBe(true);
    expect(foe.hull).toBeLessThan(foe.maxHull);
    expect(w.entities.has(m.id)).toBe(false);
    me.hull = 0;
    stepDrones(w, 1 / 30);
    expect([...w.entities.values()].filter((e) => e.kind === 'mine')).toHaveLength(0);
    expect(w.droneRt.size).toBe(0);
  });

  it('drones are not entities: they cannot be targeted and add nothing to the entity count', () => {
    const { w } = arena([spec('guardian'), spec('sentinel', 120, 1)]);
    const before = w.entities.size;
    run(w, 60);
    expect(w.entities.size).toBe(before);
    expect([...w.entities.values()].some((e) => (e.kind as string) === 'drone')).toBe(false);
  });
});

describe('drone data and replay', () => {
  it('equipping a drone item creates the companion on the spawned vehicle, with radar bonus for recon', () => {
    const ch = createStarterCharacterForServer('P', 'coastal'); ch.level = 40; ch.wallet.scrap = 1e6;
    const rng = new SimRNG(3);
    const d = (C.createItem(ch, 'drn_recon_t2', 'Epic', rng) as any).item;
    expect(C.equipItem(ch, ch.activeVehicle, 'drone0', d.uid).ok).toBe(true);
    const w = createWorld({ seed: 1, populate: false });
    const e = spawnPlayerFromCharacter(w, ch, { x: 500, y: 500 });
    expect(e.drones).toHaveLength(1);
    expect(e.drones![0]).toMatchObject({ type: 'recon', tier: 2, slot: 0 });
    expect(e.radarMult).toBeGreaterThan(1.1);
    expect(e.radarMult).toBeLessThanOrEqual(1.6);
    C.unequipItem(ch, ch.activeVehicle, 'drone0');
    const { refreshPlayerStats } = require_('../shared/sim/playerEntity.ts');
    refreshPlayerStats(e, ch);
    expect(e.drones).toBeUndefined();
  });

  it('the world stays bit-identical with drones active (two runs, same seed)', () => {
    const make = () => {
      const { w, me, foe } = arena([spec('sentinel'), spec('arc_drone', 150, 1), spec('aegis', 100, 2)]);
      lock(me, foe);
      for (let t = 0; t < 400; t++) { stepWorld(w, new Map([[me.id, t % 40 === 0 ? [{ type: 'Drive', x: Math.cos(t), y: Math.sin(t) } as SimCommand] : []]])); if (t === 100) dealDirectDamage(w, foe, me, 300); }
      return hashWorldState(w);
    };
    expect(make()).toBe(make());
  });

  it('the owner entity stays small on the wire (drone list is a few dozen bytes)', () => {
    const { me } = arena([spec('sentinel'), spec('guardian', 90, 1)]);
    const withDrones = JSON.stringify(compactEntity(me)).length;
    me.drones = undefined;
    const without = JSON.stringify(compactEntity(me)).length;
    expect(withDrones - without).toBeLessThan(160);
  });
});

import * as PE from '../shared/sim/playerEntity.ts';
function require_(_p: string) { return PE; }
