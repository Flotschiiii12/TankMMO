/**
 * PvE layer of the deterministic world: enemy AI, bosses, telegraphed artillery,
 * wrecks, loot crates, resource nodes, portals and respawns.
 * Pure and deterministic: only world.rng and the tick delta are used.
 */
import { ENEMY_ARCHETYPES, BOSS_CATALOG, EnemyArchetype } from '../data/enemies.ts';
import {
  angleDiff,
  AmmoType,
  ChatMessage,
  clamp,
  dist,
  distSq,
  EntityKind,
  MapDef,
  normalize,
  SimEntity,
  Vec2,
  vec2,
} from '../types.ts';
import { getNextEntityId, isPosInSafeZone, spawnVehicle, World, fireMainCannon } from './world.ts';

export const PORTAL_HOLD_SECONDS = 3;
export const WRECK_SECONDS = 8;
export const MINING_SECONDS = 3;
const LOOT_MAGNET_RADIUS = 130;
const MAX_CHAT = 40;

export interface PveState {
  respawnQueue: Array<{ type: string; level: number; homePos: Vec2; timer: number }>;
  bossTimer: number;
  bossId?: number;
}

export function createPveState(): PveState {
  return { respawnQueue: [], bossTimer: 0 };
}

/** Entities that are scenery/interactables, not vehicles: no AI, no physics, no targeting. */
export function isInertKind(kind: EntityKind): boolean {
  return kind === 'gate' || kind === 'loot_crate' || kind === 'telegraph' || kind === 'resource_node' || kind === 'projectile';
}

function pushChat(world: World, sender: string, clanTag: string, channel: ChatMessage['channel'], text: string): void {
  world.chat.push({ id: `msg_${world.tick}_${world.chat.length}`, sender, clanTag, channel, text, timestamp: world.time });
  if (world.chat.length > MAX_CHAT) world.chat.shift();
}

function archetypeFor(type: string): EnemyArchetype {
  return (
    ENEMY_ARCHETYPES[type] ||
    Object.values(ENEMY_ARCHETYPES).find((a) => a.kind === type) ||
    ENEMY_ARCHETYPES['scout_buggy']
  );
}

function makeInert(world: World, kind: EntityKind, name: string, pos: Vec2, radius: number, hull = 1): SimEntity {
  const e = spawnVehicle(world, kind, name, 1, pos, { radius, maxHull: hull, maxArmor: 0, maxSpeed: 0 });
  e.hull = e.maxHull = hull;
  e.armor = e.maxArmor = 0;
  e.flatArmorReduction = 0;
  e.invulnerableTime = 1e9;
  e.isHostile = false;
  return e;
}

// ---------------------------------------------------------------------------
// Population
// ---------------------------------------------------------------------------

export function populateWorld(world: World, map: MapDef): void {
  for (const gate of map.gates) {
    const g = makeInert(world, 'gate', gate.name, { x: gate.x, y: gate.y }, gate.radius, 999999);
    g.gateId = gate.id;
    g.targetMapId = String(gate.targetMapId);
  }
  for (const node of map.resourceNodes ?? []) {
    const n = makeInert(world, 'resource_node', `${String(node.type).toUpperCase()} Deposit`, { x: node.x, y: node.y }, node.radius || 28, 999999);
    n.nodeType = node.type;
    n.nodeOreRemaining = node.currentOre || 50;
  }
  for (const spawn of map.enemySpawns) {
    for (let i = 0; i < spawn.count; i++) {
      const level = world.rng.rangeInt(spawn.levelRange[0], spawn.levelRange[1]);
      const x = spawn.area.x + world.rng.next() * spawn.area.width;
      const y = spawn.area.y + world.rng.next() * spawn.area.height;
      spawnEnemy(world, spawn.type, level, { x, y });
    }
  }
  if (map.bossSpawn) spawnBoss(world);
}

export function spawnEnemy(world: World, type: string, level: number, pos: Vec2): SimEntity {
  const arch = archetypeFor(type);
  const mult = 1 + (level - 1) * 0.12;
  const e = spawnVehicle(world, arch.kind, `${arch.displayName} [Lv.${level}]`, level, pos, {
    maxHull: Math.round(arch.baseHull * mult),
    maxArmor: Math.round(arch.baseArmor * mult),
    maxSpeed: arch.maxSpeed,
    turnRate: arch.turnRate,
    turretTurnRate: arch.turretTurnRate,
    mainDamage: Math.round(arch.baseDamage * mult),
    mainReloadTime: arch.reloadTime,
    radius: arch.radius,
    isHostile: true,
  });
  e.chassisAngle = world.rng.next() * Math.PI * 2;
  e.mainRange = arch.attackRange;
  e.mainReloadRemaining = world.rng.range(0.2, arch.reloadTime);
  e.selectedAmmo = arch.kind === 'artillery' ? 'EXPLOSIVE' : 'STANDARD';
  e.aiState = 'patrol';
  e.homePos = { ...pos };
  e.aggroRange = arch.aggroRange;
  e.leashRange = arch.leashRange;
  e.patrolAngle = world.rng.next() * Math.PI * 2;
  e.aiTimer = world.rng.range(1, 4);
  e.archetypeId = arch.id;
  return e;
}

export function spawnBoss(world: World): SimEntity | undefined {
  const def = world.map?.bossSpawn;
  if (!def) return undefined;
  const bd = BOSS_CATALOG.find((b) => b.id === def.type) || BOSS_CATALOG.find((b) => b.name === def.name) || BOSS_CATALOG[0];
  const boss = spawnVehicle(world, 'boss', def.name, def.level, def.pos, {
    maxHull: bd.baseHull,
    maxArmor: bd.baseArmor,
    maxSpeed: bd.maxSpeed,
    turnRate: 1.2,
    turretTurnRate: 2.0,
    mainDamage: bd.damage,
    mainReloadTime: bd.reloadTime,
    radius: bd.radius,
    clanTag: 'BOSS',
    isHostile: true,
  });
  boss.selectedAmmo = 'EXPLOSIVE';
  boss.aiState = 'patrol';
  boss.homePos = { ...def.pos };
  boss.bossPhase = 1;
  boss.bossSkillCooldown = 4;
  boss.aggroRange = 900;
  boss.leashRange = 1600;
  boss.archetypeId = bd.id;
  world.pve.bossId = boss.id;
  pushChat(world, 'SATELLITE WARNING', 'WARN', 'S', `CRITICAL ALERT: ${def.name} detected on the battlefield!`);
  return boss;
}

// ---------------------------------------------------------------------------
// Per-tick PvE step (called by stepWorld after combat)
// ---------------------------------------------------------------------------

export function stepPve(world: World, dt: number): void {
  handleDeaths(world);
  updateAI(world, dt);
  updateTelegraphs(world, dt);
  updateLoot(world, dt);
  updatePortals(world, dt);
  updateMining(world, dt);
  updateWrecksAndRespawns(world, dt);
}

function handleDeaths(world: World): void {
  const killers = new Map<number, number | undefined>();
  for (const ev of world.events) if (ev.type === 'entity_killed') killers.set(ev.victimId, ev.killerId);

  for (const v of Array.from(world.entities.values())) {
    if (v.hull > 0 || v.isWreck || isInertKind(v.kind)) continue;
    v.isWreck = true;
    v.wreckTimer = WRECK_SECONDS;
    v.vel = vec2();
    v.targetSpeed = 0;
    if (!killers.has(v.id)) {
      world.events.push({ type: 'entity_killed', victimId: v.id, killerId: undefined, pos: { ...v.pos }, level: v.level, scrapReward: 25 * v.level, xpReward: 80 * v.level });
    }
    if (v.kind === 'player') {
      world.events.push({ type: 'player_died', entityId: v.id });
      continue;
    }
    if (!v.isHostile) continue;
    dropLoot(world, v);
    if (v.kind === 'boss') {
      world.pve.bossTimer = world.map?.bossSpawn?.respawnSeconds ?? 300;
      world.pve.bossId = undefined;
      pushChat(world, 'SATELLITE HQ', 'CMD', 'S', `VICTORY: ${v.name} has been neutralized!`);
    } else {
      world.pve.respawnQueue.push({ type: v.archetypeId || v.kind, level: v.level, homePos: v.homePos ? { ...v.homePos } : { ...v.pos }, timer: world.rng.range(20, 35) });
    }
  }
}

function dropLoot(world: World, victim: SimEntity): void {
  const arch = archetypeFor(victim.archetypeId || victim.kind);
  const scrap = Math.round((12 + victim.level * 6) * arch.dropsScrapMultiplier * world.rng.range(0.8, 1.25));
  const parts = world.rng.rangeInt(1, 4);
  const hasAmmo = world.rng.chance(0.6);
  const ammoType: AmmoType = world.rng.chance(0.5) ? 'ARMOR_PIERCING' : 'EXPLOSIVE';
  const crate = makeInert(world, 'loot_crate', 'Supply Crate', victim.pos, 14);
  crate.level = victim.level;
  crate.maxSpeed = 380;
  crate.lootScrap = scrap;
  crate.lootParts = parts;
  crate.lootAmmo = hasAmmo ? { type: ammoType, count: 5 } : undefined;
  crate.lootKind = hasAmmo ? 'ammo' : world.rng.chance(0.2) ? 'repair' : 'scrap';
  if (world.rng.chance(arch.dropsOreChance)) crate.lootOre = world.rng.rangeInt(2, 8);
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

function isSmoked(e: SimEntity): boolean {
  return e.statusEffects.some((s) => s.type === 'smoked');
}

function aimTurret(ent: SimEntity, target: SimEntity, dt: number): number {
  const aim = Math.atan2(target.pos.y - ent.pos.y, target.pos.x - ent.pos.x);
  const diff = angleDiff(aim, ent.turretAngle);
  ent.turretAngle += clamp(diff, -ent.turretTurnRate * dt, ent.turretTurnRate * dt);
  return diff;
}

function updateAI(world: World, dt: number): void {
  for (const ent of world.entities.values()) {
    if (ent.kind === 'player' || ent.hull <= 0 || isInertKind(ent.kind)) continue;
    if (!ent.aiState) continue; // only scripted/NPC entities carry an AI state
    ent.aiTimer = (ent.aiTimer ?? 0) - dt;

    let target = ent.targetId !== undefined ? world.entities.get(ent.targetId) : undefined;
    const aggro = ent.aggroRange ?? 750;
    if (target && (target.hull <= 0 || isSmoked(target) || distSq(ent.pos, target.pos) > (aggro * 1.6) ** 2)) {
      ent.targetId = undefined;
      target = undefined;
    }
    if (!target) {
      let best = aggro;
      for (const o of world.entities.values()) {
        if (o.id === ent.id || o.hull <= 0 || o.isHostile === ent.isHostile || isInertKind(o.kind) || isSmoked(o)) continue;
        if (o.isInSafeZone) continue;
        const d = dist(ent.pos, o.pos);
        if (d < best) { best = d; target = o; }
      }
      ent.targetId = target?.id;
    }

    // Leash: give up and walk home if dragged too far away
    if (ent.isHostile && ent.homePos && ent.leashRange && dist(ent.pos, ent.homePos) > ent.leashRange) {
      ent.targetId = undefined;
      target = undefined;
      ent.desiredDriveAngle = Math.atan2(ent.homePos.y - ent.pos.y, ent.homePos.x - ent.pos.x);
      ent.targetSpeed = ent.maxSpeed * 0.8;
      continue;
    }

    switch (ent.kind) {
      case 'boss': bossAI(world, ent, target, dt); break;
      case 'bunker_turret': bunkerAI(world, ent, target, dt); break;
      case 'artillery': artilleryAI(world, ent, target, dt); break;
      case 'loot_convoy': convoyAI(world, ent); break;
      default: skirmisherAI(world, ent, target, dt);
    }
  }
}

function skirmisherAI(world: World, ent: SimEntity, target: SimEntity | undefined, dt: number): void {
  if (target) {
    const dx = target.pos.x - ent.pos.x;
    const dy = target.pos.y - ent.pos.y;
    const d = Math.hypot(dx, dy);
    const ideal = ent.kind === 'scout_buggy' ? 260 : 380;
    ent.aiState = 'attack';
    ent.desiredDriveAngle = d > ideal + 70 ? Math.atan2(dy, dx) : d < ideal - 70 ? Math.atan2(-dy, -dx) : Math.atan2(dy, dx) + Math.PI / 2;
    ent.targetSpeed = ent.maxSpeed * (ent.kind === 'scout_buggy' ? 0.9 : 0.75);
    const diff = aimTurret(ent, target, dt);
    if (Math.abs(diff) < 0.25 && d <= ent.mainRange) fireMainCannon(world, ent);
  } else {
    ent.aiState = 'patrol';
    if ((ent.aiTimer ?? 0) <= 0) {
      ent.aiTimer = world.rng.range(2, 5);
      ent.patrolAngle = world.rng.next() * Math.PI * 2;
      ent.targetSpeed = world.rng.chance(0.7) ? ent.maxSpeed * 0.45 : 0;
    }
    ent.desiredDriveAngle = ent.patrolAngle;
    const diff = angleDiff(ent.chassisAngle, ent.turretAngle);
    ent.turretAngle += clamp(diff, -ent.turretTurnRate * dt, ent.turretTurnRate * dt);
  }
}

function bunkerAI(world: World, ent: SimEntity, target: SimEntity | undefined, dt: number): void {
  ent.targetSpeed = 0;
  if (!target) return;
  const diff = aimTurret(ent, target, dt);
  if (Math.abs(diff) < 0.25 && dist(ent.pos, target.pos) <= Math.min(ent.mainRange, 650)) fireMainCannon(world, ent);
}

function artilleryAI(world: World, ent: SimEntity, target: SimEntity | undefined, dt: number): void {
  if (!target) { ent.targetSpeed = 0; return; }
  const dx = target.pos.x - ent.pos.x;
  const dy = target.pos.y - ent.pos.y;
  const d = Math.hypot(dx, dy);
  const diff = aimTurret(ent, target, dt);
  if (d < 700) { ent.desiredDriveAngle = Math.atan2(-dy, -dx); ent.targetSpeed = ent.maxSpeed; }
  else if (d > 950) { ent.desiredDriveAngle = Math.atan2(dy, dx); ent.targetSpeed = ent.maxSpeed; }
  else ent.targetSpeed = 0;
  if (Math.abs(diff) < 0.25 && d <= 1000 && ent.mainReloadRemaining <= 0) {
    ent.mainReloadRemaining = ent.mainReloadTime;
    spawnTelegraph(world, { x: target.pos.x + target.vel.x * 0.8, y: target.pos.y + target.vel.y * 0.8 }, 110, 1.0, ent, Math.round(ent.mainDamage * 4));
  }
}

function convoyAI(world: World, ent: SimEntity): void {
  if ((ent.aiTimer ?? 0) <= 0) {
    ent.aiTimer = world.rng.range(4, 8);
    ent.patrolAngle = world.rng.next() * Math.PI * 2;
  }
  ent.desiredDriveAngle = ent.patrolAngle ?? 0;
  ent.targetSpeed = ent.maxSpeed * 0.6;
}

function bossAI(world: World, ent: SimEntity, target: SimEntity | undefined, dt: number): void {
  const ratio = ent.hull / ent.maxHull;
  if (ratio < 0.33 && ent.bossPhase !== 3) {
    ent.bossPhase = 3;
    pushChat(world, ent.name, 'BOSS', 'S', `${ent.name} enters ENRAGE! Firepower maximized!`);
  } else if (ratio < 0.66 && ent.bossPhase === 1) {
    ent.bossPhase = 2;
    pushChat(world, ent.name, 'BOSS', 'S', `${ent.name} deploys scout escorts and initiates barrage protocol!`);
    spawnEnemy(world, 'scout_buggy', Math.max(1, ent.level - 4), { x: ent.pos.x - 80, y: ent.pos.y - 80 });
    spawnEnemy(world, 'scout_buggy', Math.max(1, ent.level - 4), { x: ent.pos.x + 80, y: ent.pos.y + 80 });
  }
  ent.bossSkillCooldown = (ent.bossSkillCooldown ?? 0) - dt;
  if (!target) { ent.targetSpeed = ent.maxSpeed * 0.3; return; }

  const dx = target.pos.x - ent.pos.x;
  const dy = target.pos.y - ent.pos.y;
  const d = Math.hypot(dx, dy);
  const diff = aimTurret(ent, target, dt);
  if (d > 450) { ent.desiredDriveAngle = Math.atan2(dy, dx); ent.targetSpeed = ent.maxSpeed * (ent.bossPhase === 3 ? 1.4 : 1.0); }
  else ent.targetSpeed = ent.maxSpeed * 0.4;
  if (Math.abs(diff) < 0.3 && d <= 900) fireMainCannon(world, ent);

  if (ent.bossSkillCooldown <= 0) {
    ent.bossSkillCooldown = ent.bossPhase === 3 ? 3.5 : 6.0;
    const count = ent.bossPhase === 3 ? 4 : 2;
    for (let i = 0; i < count; i++) {
      const a = world.rng.next() * Math.PI * 2;
      const r = world.rng.range(40, 160);
      spawnTelegraph(world, { x: target.pos.x + Math.cos(a) * r, y: target.pos.y + Math.sin(a) * r }, 120, 1.0, ent, Math.round(ent.mainDamage * 1.6));
    }
  }
}

// ---------------------------------------------------------------------------
// Telegraphed ground attacks
// ---------------------------------------------------------------------------

function spawnTelegraph(world: World, pos: Vec2, radius: number, duration: number, source: SimEntity, damage: number): void {
  const t = makeInert(world, 'telegraph', 'Telegraph', pos, radius);
  t.isHostile = source.isHostile;
  t.sourceEntityId = source.id;
  t.telegraphRadius = radius;
  t.telegraphDuration = duration;
  t.telegraphMaxDuration = duration;
  t.telegraphDamage = damage;
}

function updateTelegraphs(world: World, dt: number): void {
  for (const t of Array.from(world.entities.values())) {
    if (t.kind !== 'telegraph') continue;
    t.telegraphDuration = (t.telegraphDuration ?? 0) - dt;
    if ((t.telegraphDuration ?? 0) > 0) continue;
    const radius = t.telegraphRadius ?? 100;
    const damage = t.telegraphDamage ?? 500;
    for (const v of world.entities.values()) {
      if (v.hull <= 0 || v.isHostile === t.isHostile || isInertKind(v.kind) || isPosInSafeZone(world, v.pos)) continue;
      const d = dist(t.pos, v.pos);
      if (d > radius) continue;
      applySplashDamage(world, v, Math.round(damage * Math.max(0.4, 1 - d / (radius * 1.2))), t);
    }
    world.entities.delete(t.id);
  }
}

function applySplashDamage(world: World, victim: SimEntity, damage: number, source: SimEntity): void {
  if (victim.invulnerableTime > 0) return;
  // Ground splash has no direction: treat as a side hit (x1.0), armor absorbs 80 % first.
  const toArmor = Math.min(victim.armor, damage * 0.8);
  const toHull = damage - toArmor;
  victim.armor -= toArmor;
  victim.hull = Math.max(0, victim.hull - toHull);
  victim.armorRegenTimer = 0;
  victim.statusEffects = victim.statusEffects.filter((s) => s.type !== 'repairing');
  world.events.push({ type: 'damage_dealt', attackerId: source.sourceEntityId, targetId: victim.id, rawDamage: damage, finalDamage: damage, armorDamage: toArmor, hullDamage: toHull, isCrit: false, isRearHit: false, isFrontHit: false, ammoType: 'EXPLOSIVE', pos: { ...victim.pos } });
  if (victim.hull <= 0) {
    world.events.push({ type: 'entity_killed', victimId: victim.id, killerId: source.sourceEntityId, pos: { ...victim.pos }, level: victim.level, scrapReward: 25 * victim.level, xpReward: 80 * victim.level });
  }
}

// ---------------------------------------------------------------------------
// Loot, portals, mining, wrecks, respawns
// ---------------------------------------------------------------------------

function collectors(world: World): SimEntity[] {
  return Array.from(world.entities.values()).filter((e) => (e.kind === 'player' || e.kind === 'npc_driver') && e.hull > 0);
}

function updateLoot(world: World, dt: number): void {
  const who = collectors(world);
  for (const crate of Array.from(world.entities.values())) {
    if (crate.kind !== 'loot_crate') continue;
    let best: SimEntity | undefined;
    let bestD = LOOT_MAGNET_RADIUS;
    for (const p of who) {
      const d = dist(crate.pos, p.pos);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (!best) continue;
    const dir = normalize({ x: best.pos.x - crate.pos.x, y: best.pos.y - crate.pos.y });
    crate.pos.x += dir.x * 420 * dt;
    crate.pos.y += dir.y * 420 * dt;
    if (bestD < best.radius + 12) {
      const base = { type: 'loot_collected' as const, collectorId: best.id, pos: { ...crate.pos } };
      if (crate.lootScrap) world.events.push({ ...base, crateType: 'scrap', amount: crate.lootScrap });
      if (crate.lootParts) world.events.push({ ...base, crateType: 'parts', amount: crate.lootParts });
      if (crate.lootOre) world.events.push({ ...base, crateType: 'ore', amount: crate.lootOre });
      if (crate.lootAmmo) {
        world.events.push({ ...base, crateType: `ammo:${crate.lootAmmo.type}`, amount: crate.lootAmmo.count });
        if (best.ammoInventory[crate.lootAmmo.type] >= 0) best.ammoInventory[crate.lootAmmo.type] += crate.lootAmmo.count;
      }
      world.entities.delete(crate.id);
    }
  }
}

function updatePortals(world: World, dt: number): void {
  const gates = Array.from(world.entities.values()).filter((e) => e.kind === 'gate');
  for (const p of collectors(world)) {
    if (p.kind !== 'player') continue;
    const gate = gates.find((g) => dist(p.pos, g.pos) <= g.radius);
    if (!gate) { p.gateHoldTimer = 0; continue; }
    if (p.lastDamagedTick !== undefined && world.tick - p.lastDamagedTick < 3) { p.gateHoldTimer = 0; continue; }
    p.gateHoldTimer = (p.gateHoldTimer ?? 0) + dt;
    if (p.gateHoldTimer >= PORTAL_HOLD_SECONDS) {
      p.gateHoldTimer = 0;
      world.events.push({ type: 'gate_used', entityId: p.id, gateId: gate.gateId || '', targetMapId: gate.targetMapId || '' });
    }
  }
}

function updateMining(world: World, dt: number): void {
  const nodes = Array.from(world.entities.values()).filter((e) => e.kind === 'resource_node' && (e.nodeOreRemaining ?? 0) > 0);
  for (const p of collectors(world)) {
    if (p.kind !== 'player') continue;
    const node = nodes.find((n) => (n.nodeOreRemaining ?? 0) > 0 && dist(p.pos, n.pos) <= n.radius + 40);
    if (!node || Math.hypot(p.vel.x, p.vel.y) > 20) { p.miningTimer = 0; continue; }
    p.miningTimer = (p.miningTimer ?? 0) + dt;
    if (p.miningTimer >= MINING_SECONDS) {
      p.miningTimer = 0;
      const mined = Math.min(25, node.nodeOreRemaining ?? 0);
      node.nodeOreRemaining = (node.nodeOreRemaining ?? 0) - mined;
      world.events.push({ type: 'loot_collected', collectorId: p.id, crateType: `ore:${node.nodeType}`, amount: mined, pos: { ...node.pos } });
    }
  }
}

function updateWrecksAndRespawns(world: World, dt: number): void {
  for (const e of Array.from(world.entities.values())) {
    if (e.isWreck && e.kind !== 'player' && e.wreckTimer !== undefined) {
      e.wreckTimer -= dt;
      if (e.wreckTimer <= 0) world.entities.delete(e.id);
    }
    if (e.hitFlashTimer && e.hitFlashTimer > 0) e.hitFlashTimer -= dt;
  }
  for (let i = world.pve.respawnQueue.length - 1; i >= 0; i--) {
    const q = world.pve.respawnQueue[i];
    q.timer -= dt;
    if (q.timer <= 0) {
      spawnEnemy(world, q.type, q.level, q.homePos);
      world.pve.respawnQueue.splice(i, 1);
    }
  }
  if (world.pve.bossTimer > 0) {
    world.pve.bossTimer -= dt;
    if (world.pve.bossTimer <= 0) spawnBoss(world);
  }
}

export { getNextEntityId };
