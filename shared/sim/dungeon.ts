/**
 * Gate dungeons: a private world per party with a wave director, a boss and a 15 minute timer.
 */
import { DUNGEON_HULL_BY_PARTY, DUNGEON_PARTY_MAX, DUNGEON_PARTY_MIN, DungeonDef } from '../data/dungeons.ts';
import { SimEntity } from '../types.ts';
import { spawnEnemy } from './pve.ts';
import { createWorld, spawnVehicle, World } from './world.ts';

export interface DungeonState {
  def: DungeonDef;
  partySize: number;
  wave: number; // index of the wave currently running, -1 before start
  bossSpawned: boolean;
  timeLeft: number;
  status: 'running' | 'cleared' | 'failed';
  bossId?: number;
}

export const DUNGEON_SIZE = 3000;
const SPAWN_RING = 1100;

export function createDungeonWorld(def: DungeonDef, partySize: number, seed: number): World {
  const size = Math.min(DUNGEON_PARTY_MAX, Math.max(DUNGEON_PARTY_MIN, Math.round(partySize)));
  const world = createWorld({ mapId: def.id, seed, width: DUNGEON_SIZE, height: DUNGEON_SIZE, safeZones: [], obstacles: [], populate: false });
  world.dungeon = { def, partySize: size, wave: -1, bossSpawned: false, timeLeft: def.timeLimitSeconds, status: 'running' };
  return world;
}

/** Players enter at the south edge of the arena. */
export function dungeonEntryPoint(): { x: number; y: number } {
  return { x: DUNGEON_SIZE / 2, y: DUNGEON_SIZE - 300 };
}

function ringPos(world: World, i: number, n: number): { x: number; y: number } {
  const a = (i / Math.max(1, n)) * Math.PI * 2 + world.rng.range(-0.2, 0.2);
  const r = world.rng.range(SPAWN_RING * 0.7, SPAWN_RING);
  return { x: DUNGEON_SIZE / 2 + Math.cos(a) * r, y: DUNGEON_SIZE / 2 - 300 + Math.sin(a) * r * 0.6 };
}

function hostilesAlive(world: World): number {
  let n = 0;
  for (const e of world.entities.values()) if (e.isHostile && e.hull > 0 && (e.kind !== 'telegraph' && e.kind !== 'projectile')) n++;
  return n;
}

function playersAlive(world: World): number {
  let n = 0;
  for (const e of world.entities.values()) if (e.kind === 'player' && e.hull > 0) n++;
  return n;
}

function spawnWave(world: World, st: DungeonState): void {
  const wave = st.def.waves[st.wave];
  const total = wave.enemies.reduce((a, e) => a + e.count, 0);
  const hullMult = DUNGEON_HULL_BY_PARTY[st.partySize];
  let i = 0;
  for (const group of wave.enemies) {
    for (let k = 0; k < group.count; k++) {
      spawnEnemy(world, group.type, st.def.recommendedLevel, ringPos(world, i++, total), { hullMult });
    }
  }
  world.events.push({ type: 'dungeon_wave', wave: st.wave + 1, total: st.def.waves.length, timeLeft: Math.round(st.timeLeft) });
}

function spawnDungeonBoss(world: World, st: DungeonState): SimEntity {
  const b = st.def.boss;
  const mult = DUNGEON_HULL_BY_PARTY[st.partySize];
  const boss = spawnVehicle(world, 'boss', b.name, st.def.recommendedLevel + 2, { x: DUNGEON_SIZE / 2, y: DUNGEON_SIZE / 2 - 500 }, {
    maxHull: Math.round(b.baseHull * mult),
    maxArmor: Math.round(b.baseArmor * mult),
    maxSpeed: b.maxSpeed,
    turnRate: 1.2,
    turretTurnRate: 2,
    mainDamage: b.damage,
    mainReloadTime: b.reloadTime,
    radius: b.radius,
    clanTag: 'BOSS',
    isHostile: true,
  });
  boss.selectedAmmo = 'EXPLOSIVE';
  boss.aiState = 'attack';
  boss.homePos = { ...boss.pos };
  boss.bossPhase = 1;
  boss.bossSkillCooldown = 4;
  boss.aggroRange = 2500;
  boss.leashRange = 4000;
  boss.damageBy = {};
  st.bossId = boss.id;
  return boss;
}

export function stepDungeon(world: World, dt: number): void {
  const st = world.dungeon;
  if (!st || st.status !== 'running') return;

  st.timeLeft -= dt;
  if (st.timeLeft <= 0) {
    st.status = 'failed';
    world.events.push({ type: 'dungeon_failed', dungeonId: st.def.id, reason: 'timeout' });
    return;
  }
  if (world.tick > 30 && playersAlive(world) === 0) {
    st.status = 'failed';
    world.events.push({ type: 'dungeon_failed', dungeonId: st.def.id, reason: 'wipe' });
    return;
  }

  if (st.bossSpawned) {
    const boss = st.bossId !== undefined ? world.entities.get(st.bossId) : undefined;
    if (!boss || boss.hull <= 0) {
      st.status = 'cleared';
      world.events.push({ type: 'dungeon_cleared', dungeonId: st.def.id, timeLeft: Math.max(0, st.timeLeft) });
    }
    return;
  }

  if (hostilesAlive(world) > 0) return;
  if (st.wave + 1 < st.def.waves.length) {
    st.wave++;
    spawnWave(world, st);
  } else {
    st.bossSpawned = true;
    spawnDungeonBoss(world, st);
  }
}
