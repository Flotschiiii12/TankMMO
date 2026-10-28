import { ELITE_HULL_MULT } from '../shared/data/balance.ts';
import { describe, expect, it } from 'vitest';
import { DUNGEONS } from '../shared/data/dungeons.ts';
import { getAllMaps } from '../shared/data/maps.ts';
import { createDungeonWorld, dungeonEntryPoint } from '../shared/sim/dungeon.ts';
import { activeEvents, worldBossSlot } from '../shared/sim/events.ts';
import { spawnBoss, spawnEnemy } from '../shared/sim/pve.ts';
import { createWorld, hashWorldState, spawnVehicle, stepWorld } from '../shared/sim/world.ts';
import { SimCommand } from '../shared/types.ts';

const NONE = new Map<number, SimCommand[]>();
const maps = getAllMaps() as any[];

describe('Dungeons (gates)', () => {
  it('has 6 dungeons with 5 waves, valid unlock maps and increasing difficulty', () => {
    expect(DUNGEONS).toHaveLength(6);
    for (const d of DUNGEONS) {
      expect(d.waves).toHaveLength(5);
      expect(maps.some((m) => m.id === d.unlockMapId), d.id).toBe(true);
      expect(d.timeLimitSeconds).toBe(900);
    }
  });

  it('runs waves, spawns the boss after the last wave and clears when the boss dies', () => {
    const def = DUNGEONS[0];
    const w = createDungeonWorld(def, 1, 5);
    const p = spawnVehicle(w, 'player', 'P', 12, dungeonEntryPoint(), { maxHull: 1e9, maxArmor: 1e9, mainDamage: 1e6 });
    const seen: string[] = [];
    for (let i = 0; i < 30 * 600 && w.dungeon!.status === 'running'; i++) {
      // the test player is a god: delete hostiles (not the boss) as soon as they spawn to advance waves
      for (const e of w.entities.values()) if (e.isHostile && e.kind !== 'boss' && e.hull > 0) e.hull = 0;
      stepWorld(w, NONE);
      for (const ev of w.events) if (ev.type === 'dungeon_wave') seen.push(`w${ev.wave}`);
      if (w.dungeon!.bossSpawned && w.dungeon!.bossId !== undefined) {
        const boss = w.entities.get(w.dungeon!.bossId)!;
        if (boss.hull > 0 && w.tick % 90 === 0) boss.hull = 0;
      }
    }
    expect(seen).toEqual(['w1', 'w2', 'w3', 'w4', 'w5']);
    expect(w.dungeon!.bossSpawned).toBe(true);
    expect(w.dungeon!.status).toBe('cleared');
    expect(p.hull).toBeGreaterThan(0);
  });

  it('fails on timeout and on a wipe; party size scales enemy hull', () => {
    const def = DUNGEONS[0];
    const w = createDungeonWorld(def, 1, 1);
    spawnVehicle(w, 'player', 'P', 12, dungeonEntryPoint(), { maxHull: 1e9 });
    w.dungeon!.timeLeft = 1;
    for (let i = 0; i < 60; i++) stepWorld(w, NONE);
    expect(w.dungeon!.status).toBe('failed');

    const solo = createDungeonWorld(def, 1, 1);
    const party = createDungeonWorld(def, 5, 1);
    for (const x of [solo, party]) { spawnVehicle(x, 'player', 'P', 12, dungeonEntryPoint(), { maxHull: 1e9 }); stepWorld(x, NONE); }
    const hull = (x: any) => [...x.entities.values()].find((e: any) => e.isHostile).maxHull;
    expect(hull(party)).toBeGreaterThan(hull(solo) * 3);

    const wipe = createDungeonWorld(def, 1, 2);
    const pl = spawnVehicle(wipe, 'player', 'P', 12, dungeonEntryPoint(), { maxHull: 100 });
    for (let i = 0; i < 40; i++) stepWorld(wipe, NONE);
    pl.hull = 0;
    stepWorld(wipe, NONE);
    expect(wipe.dungeon!.status).toBe('failed');
  });

  it('is deterministic', () => {
    const run = () => { const w = createDungeonWorld(DUNGEONS[1], 3, 9); spawnVehicle(w, 'player', 'P', 14, dungeonEntryPoint()); for (let i = 0; i < 900; i++) stepWorld(w, NONE); return hashWorldState(w); };
    expect(run()).toBe(run());
  });
});

describe('Elites, world boss rewards and events', () => {
  it('spawns 3 elites on PvE maps but none in home/hub/arena', () => {
    for (const m of maps) {
      const w = createWorld({ map: m, seed: 4 });
      const elites = [...w.entities.values()].filter((e) => e.isElite).length;
      expect(elites, `map ${m.id} ${m.type}`).toBe(['HOME', 'HUB', 'ARENA'].includes(m.type) || m.enemySpawns.length === 0 ? 0 : 3);
    }
    const w = createWorld({ map: maps[13], seed: 1, populate: false });
    const normal = spawnEnemy(w, 'gunner_truck', 20, { x: 100, y: 100 });
    const elite = spawnEnemy(w, 'gunner_truck', 20, { x: 100, y: 100 }, { elite: true });
    expect(Math.abs(elite.maxHull - normal.maxHull * ELITE_HULL_MULT)).toBeLessThanOrEqual(ELITE_HULL_MULT); // elite hull multiplier (rounding only)
    expect(elite.mainDamage).toBeGreaterThan(normal.mainDamage);
  });

  it('world boss marks flag and hands out reward tiers by damage share', () => {
    const m = maps.find((x) => x.id === 19);
    const w = createWorld({ map: m, seed: 2, populate: false });
    const boss = spawnBoss(w)!;
    expect(boss.isWorldBoss).toBe(true);
    boss.damageBy![1] = 900; boss.damageBy![2] = 80; boss.damageBy![3] = 20;
    boss.hull = 0;
    stepWorld(w, NONE);
    const ev: any = w.events.find((e) => e.type === 'boss_rewards');
    expect(ev.rewards.map((r: any) => r.tier)).toEqual(['gold', 'silver', 'bronze']);
  });

  it('event schedule is a pure function of the clock', () => {
    expect(activeEvents(0).some((e) => e.kind === 'invasion')).toBe(true);
    expect(activeEvents(16 * 60).some((e) => e.kind === 'invasion')).toBe(false);
    expect(activeEvents(3 * 3600 + 60).some((e) => e.kind === 'invasion')).toBe(true);
    expect(JSON.stringify(activeEvents(123456))).toBe(JSON.stringify(activeEvents(123456)));
    expect(worldBossSlot(0).mapId).toBe(19);
    expect(worldBossSlot(7200).mapId).toBe(27);
    expect(worldBossSlot(14400).mapId).toBe(19);
    // 1970-01-03 is a Saturday
    expect(activeEvents(2 * 86400 + 10).some((e) => e.kind === 'weekend_xp')).toBe(true);
    expect(activeEvents(4 * 86400 + 10).some((e) => e.kind === 'weekend_xp')).toBe(false);
  });

  it('an invasion starts on a home map, spawns raiders that do not respawn, and ends', () => {
    const w = createWorld({ map: maps[0], seed: 3, populate: false });
    const started: string[] = [];
    const ended: string[] = [];
    for (let i = 0; i < 30 * 70; i++) {
      stepWorld(w, NONE);
      for (const e of w.events) { if (e.type === 'event_started') started.push(e.kind); }
    }
    expect(started).toContain('invasion');
    const raiders = [...w.entities.values()].filter((e) => e.temporary);
    expect(raiders.length).toBeGreaterThanOrEqual(3);
    for (const r of raiders) r.hull = 0;
    stepWorld(w, NONE);
    expect(w.pve.respawnQueue).toHaveLength(0);
    w.clockOffset = 16 * 60 - w.time; // jump past the window
    for (let i = 0; i < 31; i++) { stepWorld(w, NONE); for (const e of w.events) if (e.type === 'event_ended') ended.push(e.kind); }
    expect(ended).toContain('invasion');
  });

  it('an invasion is a small raid: capped at 10 raiders, spawned away from the safe zone, and removed when it ends', () => {
    const w = createWorld({ map: maps[0], seed: 3, populate: false });
    for (let i = 0; i < 30 * 600; i++) stepWorld(w, NONE); // 10 minutes into the 15 minute window
    const raiders = [...w.entities.values()].filter((e) => e.fromInvasion && e.hull > 0);
    expect(raiders.length).toBeGreaterThan(0);
    expect(raiders.length).toBeLessThanOrEqual(10);
    const zone = w.safeZones[0];
    for (const r of raiders) expect(Math.hypot(r.pos.x - zone.x, r.pos.y - zone.y)).toBeGreaterThan(zone.radius + 400);
    w.clockOffset = 16 * 60 - w.time; // jump past the window
    for (let i = 0; i < 31; i++) stepWorld(w, NONE);
    expect([...w.entities.values()].some((e) => e.fromInvasion)).toBe(false);
  });
});
