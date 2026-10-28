import { describe, expect, it } from 'vitest';
import { getAllMaps } from '../shared/data/maps.ts';
import { createWorld, hashWorldState, spawnVehicle, stepWorld } from '../shared/sim/world.ts';
import { SimCommand } from '../shared/types.ts';

const maps = getAllMaps() as any[];
const NONE = new Map<number, SimCommand[]>();

describe('PvE layer on the deterministic world', () => {
  it('populates every map (gates, nodes, enemies) and survives 300 ticks', () => {
    for (const m of maps) {
      const w = createWorld({ map: m, seed: 7 });
      const kinds = new Map<string, number>();
      for (const e of w.entities.values()) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
      expect(kinds.get('gate') ?? 0, `map ${m.id} gates`).toBe(m.gates.length);
      if (m.type !== 'ARENA' && m.enemySpawns.length) expect(w.entities.size).toBeGreaterThan(m.gates.length);
      for (let i = 0; i < 300; i++) stepWorld(w, NONE);
      for (const e of w.entities.values()) expect(Number.isFinite(e.pos.x + e.pos.y), `map ${m.id} NaN`).toBe(true);
    }
  });

  it('is deterministic with PvE active', () => {
    const run = () => {
      const w = createWorld({ map: maps[1], seed: 99 });
      const p = spawnVehicle(w, 'player', 'P', 5, { x: 1500, y: 1500 });
      for (let i = 0; i < 600; i++) stepWorld(w, new Map([[p.id, [{ type: 'Drive', x: Math.cos(i / 40), y: Math.sin(i / 40) } as SimCommand]]]));
      return hashWorldState(w);
    };
    expect(run()).toBe(run());
  });

  it('enemies attack a player in range, die, drop loot and respawn', () => {
    const w = createWorld({ map: maps[1], seed: 3, populate: false });
    const player = spawnVehicle(w, 'player', 'P', 10, { x: 2000, y: 2000 }, { maxHull: 100000, maxArmor: 100000, mainDamage: 1000 });
    w.safeZones = [];
    const { spawnEnemy } = require_pve();
    const foe = spawnEnemy(w, 'scout_buggy', 1, { x: 2250, y: 2000 });
    foe.maxHull = foe.hull = 1200;
    player.targetId = foe.id;
    player.autoFire = true;
    let hurt = false, killed = false, looted = false;
    for (let i = 0; i < 2400; i++) {
      stepWorld(w, NONE);
      for (const ev of w.events) {
        if (ev.type === 'damage_dealt' && ev.targetId === player.id) hurt = true;
        if (ev.type === 'entity_killed' && ev.victimId === foe.id) { killed = true; player.pos = { x: foe.pos.x + 40, y: foe.pos.y }; }
        if (ev.type === 'loot_collected') looted = true;
      }
    }
    expect(hurt).toBe(true);
    expect(killed).toBe(true);
    expect(looted).toBe(true);
    expect(w.pve.respawnQueue.length + [...w.entities.values()].filter((e) => e.isHostile && e.hull > 0).length).toBeGreaterThan(0);
  });

  it('holding still in a portal for 3 s emits gate_used; moving out resets', () => {
    const m = maps.find((x) => x.id === 14);
    const w = createWorld({ map: m, seed: 5, populate: false });
    const { populateWorld } = require_pve();
    populateWorld(w, { ...m, enemySpawns: [], bossSpawn: undefined, resourceNodes: [] });
    const gate = m.gates[0];
    const p = spawnVehicle(w, 'player', 'P', 20, { x: gate.x, y: gate.y });
    let used: any;
    for (let i = 0; i < 100 && !used; i++) { stepWorld(w, NONE); used = w.events.find((e) => e.type === 'gate_used'); }
    expect(used).toBeDefined();
    expect(String(used.targetMapId)).toBe(String(gate.targetMapId));
    p.pos = { x: 10, y: 10 };
    stepWorld(w, NONE);
    expect(p.gateHoldTimer).toBe(0);
  });

  it('the boss changes phase at low health and summons escorts', () => {
    const m = maps.find((x) => x.bossSpawn);
    const w = createWorld({ map: m, seed: 11, populate: false });
    const { spawnBoss } = require_pve();
    const boss = spawnBoss(w)!;
    const p = spawnVehicle(w, 'player', 'P', 30, { x: boss.pos.x + 300, y: boss.pos.y }, { maxHull: 1e7, maxArmor: 1e7 });
    w.safeZones = [];
    const before = w.entities.size;
    boss.hull = boss.maxHull * 0.5;
    for (let i = 0; i < 20; i++) stepWorld(w, NONE);
    expect(boss.bossPhase).toBe(2);
    expect(w.entities.size).toBeGreaterThan(before);
    boss.hull = boss.maxHull * 0.2;
    stepWorld(w, NONE);
    expect(boss.bossPhase).toBe(3);
    expect(p.hull).toBeGreaterThan(0);
  });
});

import * as PVE from '../shared/sim/pve.ts';
function require_pve() { return PVE; }
