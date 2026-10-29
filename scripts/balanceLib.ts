/**
 * Headless combat harness on top of the real simulation (shared/sim): builds characters, runs duels and group fights with
 * a simple player controller and the real enemy AI, and measures time-to-kill / win rates. Used by scripts/balance-sim.ts
 * and by the guard tests in test/balance.test.ts.
 */
import { BOSS_CATALOG, ENEMY_ARCHETYPES } from '../shared/data/enemies.ts';
import { ITEM_CATALOG } from '../shared/data/items.ts';
import { DUNGEONS } from '../shared/data/dungeons.ts';
import { MG_MAIN_DAMAGE_RATIO } from '../shared/data/balance.ts';
import { SimRNG } from '../shared/prng.ts';
import * as C from '../shared/rules/character.ts';
import type { ItemRarity } from '../shared/data/items.ts';
import { spawnPlayerFromCharacter } from '../shared/sim/playerEntity.ts';
import { spawnEnemy } from '../shared/sim/pve.ts';
import { createDungeonWorld } from '../shared/sim/dungeon.ts';
import { createWorld, spawnVehicle, stepWorld, World } from '../shared/sim/world.ts';
import { PACE } from '../shared/rules/movement.ts';
import { SIM_TIMESTEP, SimCommand, SimEntity, VehicleClass } from '../shared/types.ts';

export const CLASSES: VehicleClass[] = ['scout', 'medium', 'heavy', 'artillery', 'support'];
export const FAMILIES = ['cannon', 'rapid_fire', 'rocket', 'mortar', 'railgun', 'flamethrower'] as const;
export const TIER_LEVELS = [1, 8, 16, 24, 34, 44, 56, 68, 80, 92]; // minLevel per vehicle tier (shared/data/vehicles.ts TIER_CONFIGS)
export const NORMAL_ENEMIES = ['scout_buggy', 'gunner_truck', 'artillery', 'flak_wagon', 'engineer', 'ice_tank', 'swamp_crawler', 'lava_truck', 'sandstorm_raider'] as const;

export interface Build { cls: VehicleClass; tier: number; family?: (typeof FAMILIES)[number]; level?: number; rarity?: ItemRarity; upgrade?: number; drones?: readonly ('guardian' | 'sentinel')[] }

/** What a typical player at a given level wears: better rarity and upgrades as the game goes on; the machine gun comes with the first drops. */
export function gearPolicy(level: number): { rarity: ItemRarity; upgrade: number; secondary: boolean } {
  const steps: Array<[number, ItemRarity, number, boolean]> = [
    [10, 'Common', 0, false], [20, 'Uncommon', 1, true], [35, 'Uncommon', 3, true], [50, 'Rare', 4, true], [65, 'Rare', 6, true], [80, 'Epic', 6, true], [95, 'Epic', 8, true], [Infinity, 'Legendary', 8, true],
  ];
  const [, rarity, upgrade, secondary] = steps.find(([max]) => level < max)!;
  return { rarity, upgrade, secondary };
}

/** Highest item tier whose minLevel the character meets. */
function bestItem(family: string, level: number): string | undefined {
  const c = ITEM_CATALOG.filter((i) => i.family === family && i.minLevel <= level).sort((a, b) => b.tier - a.tier)[0];
  return c?.id;
}

/** A "standard" character: tier-matched vehicle at its minimum level, every slot filled with the best item it may use. */
export function buildCharacter(b: Build): C.CharacterState {
  const level = b.level ?? TIER_LEVELS[b.tier - 1];
  const ch = C.createCharacter('Sim');
  ch.level = level; ch.inventory = []; ch.nextUid = 1;
  const vehicleId = `veh_${b.cls}_t${b.tier}`;
  ch.garage = [{ vehicleId, masteryXp: 0, loadout: {} }];
  ch.activeVehicle = vehicleId;
  const rng = new SimRNG(1234);
  const gear = gearPolicy(level);
  const rarity = b.rarity ?? gear.rarity;
  const upgrade = b.upgrade ?? gear.upgrade;
  const fill = (slotType: string, defId: string | undefined) => {
    if (!defId) return;
    for (const s of C.slotKeysFor(vehicleId).filter((x) => x.type === slotType)) {
      const made = C.createItem(ch, defId, rarity, rng);
      if (made.ok) { made.item.upgrade = upgrade; ch.garage[0].loadout[s.key] = made.item.uid; }
    }
  };
  fill('main', bestItem(b.family ?? 'cannon', level));
  if (gear.secondary) fill('secondary', bestItem('machine_gun', level));
  fill('armor', bestItem('composite_armor', level));
  fill('engine', bestItem('speed_engine', level));
  const droneSlots = C.slotKeysFor(vehicleId).filter((s) => s.type === 'drone');
  const droneTier = Math.min(5, Math.floor((level + 14) / 18));
  for (const [i, type] of (b.drones ?? []).slice(0, droneSlots.length).entries()) {
    if (droneTier < 1) continue;
    const made = C.createItem(ch, `drn_${type}_t${droneTier}`, rarity, rng);
    if (made.ok) { made.item.upgrade = upgrade; ch.garage[0].loadout[droneSlots[i].key] = made.item.uid; }
  }
  return ch;
}

export function arena(seed = 1): World {
  return createWorld({ mapId: 'balance', seed, width: 8000, height: 8000, safeZones: [], obstacles: [], populate: false });
}

export interface Fighter { ent: SimEntity; ch: C.CharacterState }

export function addPlayer(world: World, ch: C.CharacterState, pos: { x: number; y: number }, team?: number): SimEntity {
  const ent = spawnPlayerFromCharacter(world, ch, pos);
  ent.invulnerableTime = 0;
  ent.autoFire = true;
  ent.mainReloadRemaining = world.rng.next() * ent.mainReloadTime; // who shoots first is luck, not entity order
  ent.chassisAngle = world.rng.next() * Math.PI * 2;
  if (team !== undefined) { ent.team = team; ent.isHostile = false; }
  return ent;
}

const ang = (a: SimEntity, b: SimEntity) => Math.atan2(b.pos.y - a.pos.y, b.pos.x - a.pos.x);

/** Simple but competent player: lock the nearest enemy, close in, keep auto-fire on. `kite`: artillery holds its distance (PvP). */
export function controller(world: World, me: SimEntity, isEnemy: (o: SimEntity) => boolean, kite = false): SimCommand[] {
  const cmds: SimCommand[] = [];
  let best: SimEntity | undefined; let bd = Infinity;
  for (const o of world.entities.values()) {
    if (o.hull <= 0 || !isEnemy(o)) continue;
    const d = Math.hypot(o.pos.x - me.pos.x, o.pos.y - me.pos.y);
    // adds first: a boss only counts as the nearest target when nothing smaller is within reach
    const eff = o.kind === 'boss' ? d + 700 : d;
    if (eff < bd) { bd = eff; best = o; }
  }
  if (best) bd = Math.hypot(best.pos.x - me.pos.x, best.pos.y - me.pos.y);
  if (!best) return cmds;
  if (me.targetId !== best.id) cmds.push({ type: 'SetTarget', targetId: best.id });
  if (!me.autoFire) cmds.push({ type: 'ToggleAutoFire', enabled: true });
  if (kite && me.vehicleClass === 'artillery' && me.mainRange >= 600) {
    // artillery uses its range: hold ~55 % of it (300-480 units) and back off when pressed by something slower
    const hold = Math.min(480, Math.max(300, me.mainRange * 0.55));
    const a = ang(me, best);
    if (bd > hold) cmds.push({ type: 'Drive', x: Math.cos(a), y: Math.sin(a) });
    else if (bd < hold * 0.7 && best.maxSpeed < me.maxSpeed * 0.95) cmds.push({ type: 'Drive', x: -Math.cos(a), y: -Math.sin(a) }); // only kite what it can outrun
    else cmds.push({ type: 'Drive', x: 0, y: 0 });
    return cmds;
  }
  const want = Math.min(me.mainRange * 0.8, ENGAGE_DISTANCE);
  if (bd > want) { const a = ang(me, best); cmds.push({ type: 'Drive', x: Math.cos(a), y: Math.sin(a) }); }
  else cmds.push({ type: 'Drive', x: 0, y: 0 });
  return cmds;
}

/** Players close in to this distance (or 80 % of range, whichever is smaller): shells are slow and miss at long range, and the machine gun (range ~300) needs it. */
export const ENGAGE_DISTANCE = 120;
export const startGap = (range: number): number => Math.min(range * 0.85, ENGAGE_DISTANCE + 70);

export interface FightResult { win: boolean; seconds: number; hullLeft: number; timedOut: boolean }

/** Runs until one side is dead or `limit` seconds passed. `sideA` are the controlled players, `sideB` the targets. */
export function runFight(world: World, sideA: SimEntity[], sideB: (o: SimEntity) => boolean, limit: number, controlB?: SimEntity[], kite = false): FightResult {
  const maxTicks = Math.round(limit / SIM_TIMESTEP);
  const aIds = new Set(sideA.map((e) => e.id));
  const isB = (o: SimEntity) => sideB(o) && !aIds.has(o.id);
  for (let t = 0; t < maxTicks; t++) {
    const cmds = new Map<number, SimCommand[]>();
    for (const p of sideA) if (p.hull > 0) cmds.set(p.id, controller(world, p, isB, kite));
    if (controlB) for (const p of controlB) if (p.hull > 0) cmds.set(p.id, controller(world, p, (o) => aIds.has(o.id), kite));
    stepWorld(world, cmds);
    const aAlive = sideA.some((e) => e.hull > 0);
    const bAlive = [...world.entities.values()].some((o) => o.hull > 0 && isB(o) && o.kind !== 'projectile');
    if (!bAlive || !aAlive) {
      const total = sideA.reduce((s, e) => s + e.maxHull + e.maxArmor, 0);
      const left = sideA.reduce((s, e) => s + Math.max(0, e.hull) + Math.max(0, e.armor), 0);
      return { win: aAlive && !bAlive, seconds: world.time, hullLeft: left / total, timedOut: false };
    }
  }
  const total = sideA.reduce((s, e) => s + e.maxHull + e.maxArmor, 0);
  const left = sideA.reduce((s, e) => s + Math.max(0, e.hull) + Math.max(0, e.armor), 0);
  return { win: false, seconds: limit, hullLeft: left / total, timedOut: true };
}

/** One player vs one regular or elite enemy of the same level, starting at 85 % of the player's range. */
export function duelPve(b: Build, enemyType: string, opts: { elite?: boolean; seed?: number } = {}): FightResult {
  const world = arena(opts.seed ?? 1);
  const ch = buildCharacter(b);
  const me = addPlayer(world, ch, { x: 3000, y: 4000 });
  const foe = spawnEnemy(world, enemyType, ch.level, { x: 3000 + startGap(me.mainRange), y: 4000 }, { elite: opts.elite });
  foe.chassisAngle = Math.PI;
  return runFight(world, [me], (o) => o.id === foe.id, 240);
}

/** PvP duels start 450 units apart (inside every weapon's range): the melee classes close in, artillery tries to hold its distance. */
export const PVP_START_GAP = 450;

/** Mirror / cross-class PvP: both sides use the same controller, arena rules (teams). Returns result from A's side. */
export function duelPvp(a: Build, b: Build, seed = 1): FightResult {
  const world = arena(seed);
  world.pvp = { pvpEnabled: true, arena: true };
  const ca = buildCharacter(a); const cb = buildCharacter(b);
  const ea = addPlayer(world, ca, { x: 3000, y: 4000 }, 0);
  const eb = addPlayer(world, cb, { x: 3000 + PVP_START_GAP, y: 4000 }, 1);
  return runFight(world, [ea], (o) => o.id === eb.id, 180, [eb], true);
}

/** Group of players against a boss (mini / world). */
export function groupVsBoss(bossId: string, party: Build[], seed = 1, mult: { hull: number; dmg: number } = { hull: 1, dmg: 1 }): FightResult & { bossName: string } {
  const bd = BOSS_CATALOG.find((x) => x.id === bossId)!;
  const world = arena(seed);
  const boss = spawnVehicle(world, 'boss', bd.name, bd.level, { x: 4000, y: 3200 }, {
    maxHull: Math.round(bd.baseHull * mult.hull), maxArmor: Math.round(bd.baseArmor * mult.hull), maxSpeed: Math.round(bd.maxSpeed * PACE.enemySpeed), turnRate: 1.2, turretTurnRate: 2.0,
    mainDamage: Math.max(1, Math.round(bd.damage * mult.dmg)), /* 0 would fall back to the default damage */ mainReloadTime: bd.reloadTime, radius: bd.radius, clanTag: 'BOSS', isHostile: true,
  });
  boss.mgDamage = Math.max(1, Math.round(boss.mainDamage * MG_MAIN_DAMAGE_RATIO));
  boss.selectedAmmo = 'EXPLOSIVE'; boss.aiState = 'attack'; boss.homePos = { ...boss.pos }; boss.bossPhase = 1; boss.bossSkillCooldown = 4;
  boss.aggroRange = 2500; boss.leashRange = 4000; boss.archetypeId = bd.id; boss.isWorldBoss = bd.type === 'world_boss'; boss.damageBy = {};
  world.pve.bossId = boss.id;
  const players = party.map((p, i) => {
    const ch = buildCharacter({ ...p, level: p.level ?? bd.level });
    return addPlayer(world, ch, { x: 3600 + i * 120, y: 4700 });
  });
  const r = runFight(world, players, (o) => o.kind === 'boss' || (o.isHostile === true && o.kind !== 'projectile' && o.kind !== 'telegraph'), 1200);
  return { ...r, bossName: bd.name };
}

/** Full gate: waves + boss with a party; returns clear time. */
export function groupVsGate(gateId: string, party: Build[], seed = 1): FightResult {
  const def = DUNGEONS.find((d) => d.id === gateId)!;
  const world = createDungeonWorld(def, party.length, seed);
  const players = party.map((p, i) => addPlayer(world, buildCharacter({ ...p, level: p.level ?? def.recommendedLevel }), { x: 1400 + i * 120, y: 2700 }));
  const ids = new Set(players.map((p) => p.id));
  const maxTicks = Math.round(def.timeLimitSeconds / SIM_TIMESTEP);
  for (let t = 0; t < maxTicks; t++) {
    const cmds = new Map<number, SimCommand[]>();
    for (const p of players) if (p.hull > 0) cmds.set(p.id, controller(world, p, (o) => o.isHostile === true && !ids.has(o.id) && o.kind !== 'projectile' && o.kind !== 'telegraph'));
    stepWorld(world, cmds);
    const st = world.dungeon!;
    if (st.status !== 'running') {
      const total = players.reduce((s, e) => s + e.maxHull + e.maxArmor, 0);
      const left = players.reduce((s, e) => s + Math.max(0, e.hull) + Math.max(0, e.armor), 0);
      return { win: st.status === 'cleared', seconds: world.time, hullLeft: left / total, timedOut: false };
    }
  }
  return { win: false, seconds: def.timeLimitSeconds, hullLeft: 0, timedOut: true };
}

export function tierForLevel(level: number): number { let t = 1; TIER_LEVELS.forEach((l, i) => { if (level >= l) t = i + 1; }); return t; }

/** Long fight against a (nearly) unkillable or harmless enemy to measure damage rates without the granularity of few-shot kills. */
export function measureRates(level: number, seed: number, dmgScale = 1, enemyType = 'gunner_truck', hullScale = 1e6) {
  const tier = tierForLevel(level);
  // 1) player damage rate: huge enemy hull, harmless enemy
  const w1 = arena(seed);
  const me1 = addPlayer(w1, buildCharacter({ cls: 'medium', tier, level }), { x: 3000, y: 4000 });
  const foe1 = spawnEnemy(w1, enemyType, level, { x: 3000 + startGap(me1.mainRange), y: 4000 }, { scale: { hull: hullScale, dmg: 0 } });
  foe1.chassisAngle = Math.PI;
  const hp1 = foe1.hull + foe1.armor;
  const f1 = runFight(w1, [me1], (o) => o.id === foe1.id, 60);
  const dealt = (hp1 - (foe1.hull + foe1.armor)) / f1.seconds;
  // 2) enemy damage rate against a player with huge hull, enemy damage multiplier 1
  const w2 = arena(seed);
  const ch2 = buildCharacter({ cls: 'medium', tier, level });
  const me2 = addPlayer(w2, ch2, { x: 3000, y: 4000 });
  me2.maxHull = me2.hull = 1e9;
  const foe2 = spawnEnemy(w2, enemyType, level, { x: 3000 + startGap(me2.mainRange), y: 4000 }, { scale: { hull: hullScale, dmg: dmgScale } });
  foe2.chassisAngle = Math.PI;
  const before = me2.hull + me2.armor;
  const f2 = runFight(w2, [me2], (o) => o.id === foe2.id, 60);
  const taken = (before - (me2.hull + me2.armor)) / f2.seconds;
  const playerHp = buildCharacter({ cls: 'medium', tier, level }) && (() => { const w = arena(seed); const e = addPlayer(w, buildCharacter({ cls: 'medium', tier, level }), { x: 0, y: 0 }); return e.maxHull + e.maxArmor; })();
  return { dealt, taken, playerHp };
}


export { BOSS_CATALOG, ENEMY_ARCHETYPES, DUNGEONS };
