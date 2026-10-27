/**
 * Treadfront - Pure Deterministic Simulation World
 * Runs at fixed 30 Hz timestep.
 * No DOM, no window, no Date.now(), no Math.random().
 * Uses deterministic SimRNG and rules modules.
 */

import { SimRNG } from '../prng.ts';
import { generateProceduralMap } from './mapGenerator.ts';
import type { DungeonState } from './dungeon.ts';
import { createWarPoints, stepWar, WarPoint } from './war.ts';
import { canEngage, isPvpMap, PvpContext } from './pvp.ts';
import { createPveState, isInertKind, populateWorld, PveState, stepPve } from './pve.ts';
import {
  AMMO_CONFIGS,
  consumeAmmo,
  getAmmoDamageMultiplier,
} from '../rules/ammo.ts';
import {
  calculateImpactAngle,
  resolveDamage,
  tickArmorRegen,
} from '../rules/combat.ts';
import {
  clampToBounds,
  resolveObstacleCollision,
  resolveVehicleSoftPush,
} from '../rules/collision.ts';
import {
  applyStatusEffect,
  calculateStunDuration,
  tickStatusEffects,
} from '../rules/status.ts';
import {
  AbilityId,
  AmmoType,
  angleDiff,
  ChatMessage,
  clamp,
  dist,
  distSq,
  EntityKind,
  lerp,
  MapDef,
  MapObstacle,
  SafeZone,
  SIM_TIMESTEP,
  SimCommand,
  SimEntity,
  SimEvent,
  Vec2,
  vec2,
  VehicleClass,
} from '../types.ts';

export interface World {
  id: string;
  mapId: string;
  tick: number;
  time: number;
  nextEntityId: number;
  entities: Map<number, SimEntity>;
  rng: SimRNG;
  events: SimEvent[];
  width: number;
  height: number;
  safeZones: SafeZone[];
  obstacles: MapObstacle[];
  map?: MapDef;
  slowZones: NonNullable<MapDef['slowZones']>;
  chat: ChatMessage[];
  pve: PveState;
  dungeon?: DungeonState;
  pvp?: PvpContext;
  /** kill cap bookkeeping: 'killerEntity>victimEntity' -> kill times / immunity-until (world seconds) */
  pvpKills: Map<string, number[]>;
  pvpImmunity: Map<string, number>;
  war?: WarPoint[];
  warScore: Record<string, number>;
  /** Server clock (epoch seconds) at world time 0: drives the event/world-boss schedule. */
  clockOffset: number;
}

export interface WorldInitOptions {
  mapId?: string;
  seed?: number;
  width?: number;
  height?: number;
  safeZones?: SafeZone[];
  obstacles?: MapObstacle[];
  /** Full map definition: enables portals, resource nodes, enemy spawns and the boss. */
  map?: MapDef;
  /** Spawn enemies/boss/nodes/portals from `map` (default true when a map is given). */
  populate?: boolean;
  clockOffset?: number;
  pvp?: PvpContext;
}

export function createWorld(options: WorldInitOptions = {}): World {
  const map = options.map;
  const mapId = options.mapId || (map ? String(map.id) : 'green_valley');
  const seed = options.seed ?? 1337;
  const rng = new SimRNG(seed);

  const width = options.width ?? map?.width ?? 4000;
  const height = options.height ?? map?.height ?? 4000;
  const safeZones = options.safeZones ?? map?.safeZones ?? [
    { x: width / 2, y: height / 2, radius: 450, name: 'Safe Camp' },
  ];
  const obstacles = options.obstacles ?? (map ? generateProceduralMap(map).obstacles : [
    { x: width / 2 + 300, y: height / 2 + 200, radius: 40, type: 'rock' },
    { x: width / 2 - 350, y: height / 2 - 250, radius: 55, type: 'tree' },
    { x: width / 2 + 500, y: height / 2 - 400, radius: 80, type: 'building' },
  ]);

  const world: World = {
    id: `world_${mapId}`,
    mapId,
    tick: 0,
    time: 0,
    nextEntityId: 1,
    entities: new Map(),
    rng,
    events: [],
    width,
    height,
    safeZones,
    obstacles,
    map,
    slowZones: map?.slowZones ?? [],
    chat: map
      ? [{ id: 'msg_welcome', sender: 'HQ Commander', clanTag: 'CMD', channel: 'S', text: `Welcome to ${map.name}. Secure resources, watch your flanks, and upgrade in the safe zone.`, timestamp: 0 }]
      : [],
    pve: createPveState(),
    clockOffset: options.clockOffset ?? 0,
    pvp: options.pvp ?? (map && isPvpMap(Number(map.numericId ?? map.id)) ? { pvpEnabled: true, arena: false } : undefined),
    pvpKills: new Map(),
    pvpImmunity: new Map(),
    war: map && options.populate !== false ? (createWarPoints(Number(map.numericId ?? map.id), width, height) || undefined) : undefined,
    warScore: {},
  };

  if (map && options.populate !== false) populateWorld(world, map);
  return world;
}

export function getNextEntityId(world: World): number {
  return world.nextEntityId++;
}

export function isPosInSafeZone(world: World, pos: Vec2): boolean {
  for (const sz of world.safeZones) {
    if (distSq(pos, sz) <= sz.radius * sz.radius) {
      return true;
    }
  }
  return false;
}

/**
 * Spawns a vehicle entity with full combat and driving properties.
 */
export function spawnVehicle(
  world: World,
  kind: EntityKind,
  name: string,
  level: number,
  pos: Vec2,
  options: {
    vehicleClass?: VehicleClass;
    tier?: number;
    clanTag?: string;
    isHostile?: boolean;
    maxHull?: number;
    maxArmor?: number;
    maxSpeed?: number;
    turnRate?: number;
    turretTurnRate?: number;
    mainDamage?: number;
    mainReloadTime?: number;
    radius?: number;
  } = {}
): SimEntity {
  const id = getNextEntityId(world);
  const tier = options.tier || 1;
  const baseScale = Math.pow(1.45, tier - 1);
  const speedScale = Math.pow(1.04, tier - 1);

  const maxHull = options.maxHull || Math.round(1200 * baseScale);
  const maxArmor = options.maxArmor || Math.round(800 * baseScale);
  const maxSpeed = options.maxSpeed || Math.round(180 * speedScale);
  const turnRate = options.turnRate || 2.4;
  const turretTurnRate = options.turretTurnRate || 3.2;

  const entity: SimEntity = {
    id,
    kind,
    name,
    clanTag: options.clanTag,
    level,
    vehicleClass: options.vehicleClass || 'medium',
    tier,
    pos: { ...pos },
    vel: vec2(),
    chassisAngle: 0,
    turretAngle: 0,
    radius: options.radius || 24,

    hull: maxHull,
    maxHull,
    armor: maxArmor,
    maxArmor,
    armorRegenTimer: 0,
    flatArmorReduction: Math.round(5 * (tier - 1)),
    critChance: 0.05,

    maxSpeed,
    turnRate,
    turretTurnRate,
    targetSpeed: 0,

    mainReloadRemaining: 0,
    mainReloadTime: options.mainReloadTime || 1.8,
    mainDamage: options.mainDamage || Math.round(150 * baseScale),
    mainRange: 700,
    mainProjectileSpeed: 620,
    selectedAmmo: 'STANDARD',
    ammoInventory: {
      STANDARD: -1,
      REINFORCED: 50,
      ARMOR_PIERCING: 25,
      SHAPED_CHARGE: 10,
      EXPLOSIVE: 15,
    },

    mgReloadRemaining: 0,
    mgReloadTime: 0.2,
    mgDamage: 18,
    mgRange: 300,

    abilityCooldowns: {},
    statusEffects: [],
    stunDiminishingTimer: 0,
    stunCount: 0,
    invulnerableTime: 0,
    isHostile: !!options.isHostile,
  };

  world.entities.set(id, entity);
  return entity;
}

/**
 * Main deterministic simulation step.
 */
export function stepWorld(
  world: World,
  commandsByEntity: Map<number, SimCommand[]>,
  dt: number = SIM_TIMESTEP
): void {
  world.tick++;
  world.time += dt;
  world.events = [];

  // 1. Process entity input commands
  for (const [entityId, commands] of commandsByEntity.entries()) {
    const ent = world.entities.get(entityId);
    if (!ent || ent.hull <= 0) continue;

    for (const cmd of commands) {
      applyCommand(world, ent, cmd);
    }
  }

  // 2. Update AI and Targeting
  updateAIAndTargeting(world, dt);

  // 3. Update Physics & Soft Collisions
  updatePhysicsAndCollisions(world, dt);

  // 4. Update Combat & Projectiles
  updateCombat(world, dt);
  updateSecondaryWeapons(world);

  // 5. Update Status Effects, Abilities, & Regen
  updateStatusAndRegen(world, dt);

  // 6. PvE layer: deaths/wrecks, enemy AI, telegraphs, loot, portals, mining, respawns
  stepPve(world, dt);
  stepWar(world, dt);
}

function applyCommand(world: World, ent: SimEntity, cmd: SimCommand): void {
  switch (cmd.type) {
    case 'Drive': {
      const len = Math.hypot(cmd.x, cmd.y);
      if (len > 0.05) {
        ent.desiredDriveAngle = Math.atan2(cmd.y, cmd.x);
        ent.targetSpeed = Math.min(1, len) * ent.maxSpeed;
      } else {
        ent.desiredDriveAngle = undefined;
        ent.targetSpeed = 0;
      }
      break;
    }
    case 'SetTarget': {
      if (cmd.targetId === null || cmd.targetId === undefined) {
        ent.targetId = undefined;
      } else {
        const target = world.entities.get(cmd.targetId);
        if (target && target.hull > 0 && canEngage(world, ent, target)) {
          ent.targetId = cmd.targetId;
        }
      }
      break;
    }
    case 'ToggleAutoFire': {
      ent.autoFire = cmd.enabled !== undefined ? cmd.enabled : !ent.autoFire;
      break;
    }
    case 'FireMain': {
      fireMainCannon(world, ent);
      break;
    }
    case 'SelectAmmo': {
      ent.selectedAmmo = cmd.ammo;
      break;
    }
    case 'UseAbility': {
      activateAbility(world, ent, cmd.abilityId);
      break;
    }
  }
}

export function activateAbility(world: World, ent: SimEntity, abilityId: AbilityId): boolean {
  const cd = ent.abilityCooldowns[abilityId] || 0;
  if (cd > 0) return false;

  switch (abilityId) {
    case 'smoke': {
      ent.abilityCooldowns['smoke'] = 18.0;
      ent.statusEffects = applyStatusEffect(ent.statusEffects, 'smoked', 4.0);
      // All entities lose lock on this smoked vehicle
      for (const other of world.entities.values()) {
        if (other.targetId === ent.id) {
          other.targetId = undefined;
        }
      }
      world.events.push({
        type: 'ability_used',
        entityId: ent.id,
        abilityId: 'smoke',
        pos: { ...ent.pos },
      });
      return true;
    }
    case 'repair_kit': {
      ent.abilityCooldowns['repair_kit'] = 25.0;
      ent.statusEffects = applyStatusEffect(ent.statusEffects, 'repairing', 5.0);
      world.events.push({
        type: 'ability_used',
        entityId: ent.id,
        abilityId: 'repair_kit',
        pos: { ...ent.pos },
      });
      return true;
    }
    case 'boost': {
      ent.abilityCooldowns['boost'] = 20.0;
      ent.statusEffects = applyStatusEffect(ent.statusEffects, 'boosted', 6.0);
      world.events.push({
        type: 'ability_used',
        entityId: ent.id,
        abilityId: 'boost',
        pos: { ...ent.pos },
      });
      return true;
    }
    case 'emergency_shield': {
      ent.abilityCooldowns['emergency_shield'] = 45.0;
      ent.statusEffects = applyStatusEffect(ent.statusEffects, 'invulnerable', 2.0);
      world.events.push({
        type: 'ability_used',
        entityId: ent.id,
        abilityId: 'emergency_shield',
        pos: { ...ent.pos },
      });
      return true;
    }
    case 'fortify': {
      ent.abilityCooldowns['fortify'] = 24.0;
      ent.statusEffects = applyStatusEffect(ent.statusEffects, 'fortified', 6.0);
      world.events.push({
        type: 'ability_used',
        entityId: ent.id,
        abilityId: 'fortify',
        pos: { ...ent.pos },
      });
      return true;
    }
  }

  return false;
}

function updateAIAndTargeting(world: World, dt: number): void {
  for (const ent of world.entities.values()) {
    if (ent.hull <= 0) continue;

    // Diminishing returns window tick
    if (ent.stunDiminishingTimer > 0) {
      ent.stunDiminishingTimer -= dt;
      if (ent.stunDiminishingTimer <= 0) {
        ent.stunCount = 0;
      }
    }

    // Auto-targeting / lock retention check
    if (ent.targetId !== undefined) {
      const target = world.entities.get(ent.targetId);
      if (!target || target.hull <= 0 || target.statusEffects.some(s => s.type === 'smoked')) {
        ent.targetId = undefined;
      } else {
        const d = dist(ent.pos, target.pos);
        if (d > ent.mainRange * 1.10) {
          // Exceeded lock range + 10%
          ent.targetId = undefined;
        } else {
          // Turret rotates towards locked target
          const toTarget = { x: target.pos.x - ent.pos.x, y: target.pos.y - ent.pos.y };
          const aimAngle = Math.atan2(toTarget.y, toTarget.x);
          const diff = angleDiff(aimAngle, ent.turretAngle);
          ent.turretAngle += clamp(diff, -ent.turretTurnRate * dt, ent.turretTurnRate * dt);

          if (ent.autoFire && Math.abs(diff) < 0.25 && d <= ent.mainRange) {
            fireMainCannon(world, ent);
          }
        }
      }
    }
  }
}

function updatePhysicsAndCollisions(world: World, dt: number): void {
  const entities = Array.from(world.entities.values());

  for (const ent of entities) {
    if (isInertKind(ent.kind) || ent.hull <= 0) continue;

    // Check status effects that affect mobility
    const isStunned = ent.statusEffects.some(s => s.type === 'stunned');
    if (isStunned) {
      ent.vel = vec2();
      continue;
    }

    // Steering chassis
    if (ent.desiredDriveAngle !== undefined) {
      const diff = angleDiff(ent.desiredDriveAngle, ent.chassisAngle);
      ent.chassisAngle += clamp(diff, -ent.turnRate * dt, ent.turnRate * dt);
    }

    // Calculate effective speed
    let speedMod = 1.0;
    for (const z of world.slowZones) {
      if (distSq(ent.pos, { x: z.x, y: z.y }) < z.radius * z.radius) speedMod = Math.min(speedMod, z.speedFactor);
    }
    for (const st of ent.statusEffects) {
      if (st.type === 'slowed') speedMod = Math.min(speedMod, st.value ?? 0.6);
      if (st.type === 'boosted') speedMod *= 1.30;
      if (st.type === 'fortified') speedMod *= 0.60;
    }

    const currentSpeed = Math.hypot(ent.vel.x, ent.vel.y);
    const targetSpeed = (ent.targetSpeed || 0) * speedMod;
    const accel = 350 * dt;
    const newSpeed = lerp(currentSpeed, targetSpeed, Math.min(1, accel));

    ent.vel.x = Math.cos(ent.chassisAngle) * newSpeed;
    ent.vel.y = Math.sin(ent.chassisAngle) * newSpeed;

    ent.pos.x += ent.vel.x * dt;
    ent.pos.y += ent.vel.y * dt;

    // Obstacle collisions
    const obsRes = resolveObstacleCollision(ent.pos, ent.radius, world.obstacles);
    ent.pos = obsRes.pos;

    // Clamp to map bounds
    ent.pos = clampToBounds(ent.pos, ent.radius, world.width, world.height);
  }

  // Vehicle-vs-vehicle soft push
  for (let i = 0; i < entities.length; i++) {
    const a = entities[i];
    if (isInertKind(a.kind) || a.hull <= 0) continue;

    for (let j = i + 1; j < entities.length; j++) {
      const b = entities[j];
      if (isInertKind(b.kind) || b.hull <= 0) continue;

      const push = resolveVehicleSoftPush(a.pos, a.radius, b.pos, b.radius, 0.4);
      if (push.overlapping) {
        a.pos.x += push.offsetA.x;
        a.pos.y += push.offsetA.y;
        b.pos.x += push.offsetB.x;
        b.pos.y += push.offsetB.y;
      }
    }
  }
}

export function fireMainCannon(world: World, ent: SimEntity): boolean {
  if (ent.mainReloadRemaining > 0 || ent.hull <= 0) return false;
  if (isPosInSafeZone(world, ent.pos)) return false;

  // Consume ammo or fallback to STANDARD
  const ammoRes = consumeAmmo(ent.ammoInventory, ent.selectedAmmo);
  ent.selectedAmmo = ammoRes.effectiveAmmo;
  ent.ammoInventory = ammoRes.newInventory;

  const ammoConfig = AMMO_CONFIGS[ent.selectedAmmo];
  ent.mainReloadRemaining = ent.mainReloadTime;

  // Spawn projectile
  const muzzleOffset = ent.radius + 12;
  const spawnPos = {
    x: ent.pos.x + Math.cos(ent.turretAngle) * muzzleOffset,
    y: ent.pos.y + Math.sin(ent.turretAngle) * muzzleOffset,
  };

  const id = getNextEntityId(world);
  const proj: SimEntity = {
    id,
    kind: 'projectile',
    name: 'Shell',
    level: ent.level,
    pos: spawnPos,
    vel: {
      x: Math.cos(ent.turretAngle) * ammoConfig.speed,
      y: Math.sin(ent.turretAngle) * ammoConfig.speed,
    },
    chassisAngle: ent.turretAngle,
    turretAngle: ent.turretAngle,
    radius: 4,
    hull: 1,
    maxHull: 1,
    armor: 0,
    maxArmor: 0,
    armorRegenTimer: 0,
    flatArmorReduction: 0,
    critChance: ent.critChance,
    maxSpeed: ammoConfig.speed,
    turnRate: 0,
    turretTurnRate: 0,
    targetSpeed: ammoConfig.speed,
    mainReloadRemaining: 0,
    mainReloadTime: 1,
    mainDamage: ent.mainDamage,
    mainRange: ent.mainRange * ammoConfig.rangeMultiplier,
    mainProjectileSpeed: ammoConfig.speed,
    selectedAmmo: ent.selectedAmmo,
    ammoInventory: { STANDARD: -1, REINFORCED: 0, ARMOR_PIERCING: 0, SHAPED_CHARGE: 0, EXPLOSIVE: 0 },
    mgReloadRemaining: 0,
    mgReloadTime: 1,
    mgDamage: 0,
    mgRange: 0,
    abilityCooldowns: {},
    statusEffects: [],
    stunDiminishingTimer: 0,
    stunCount: 0,
    invulnerableTime: 0,
    isHostile: ent.isHostile,
  };

  // Attach projectile custom metadata (distance traveled, source)
  (proj as any).sourceEntityId = ent.id;
  proj.fromPlayer = ent.kind === 'player';
  proj.faction = ent.faction;
  proj.team = ent.team;
  (proj as any).distanceTraveled = 0;
  (proj as any).maxDistance = ent.mainRange * ammoConfig.rangeMultiplier;
  (proj as any).splashRadius = ammoConfig.splashRadius;

  world.entities.set(id, proj);

  world.events.push({
    type: 'projectile_fired',
    shooterId: ent.id,
    pos: { ...spawnPos },
    angle: ent.turretAngle,
    speed: ammoConfig.speed,
    range: ent.mainRange * ammoConfig.rangeMultiplier,
    ammoType: ent.selectedAmmo,
    isSecondary: false,
  });

  return true;
}

function updateCombat(world: World, dt: number): void {
  const projectiles: SimEntity[] = [];
  const targets: SimEntity[] = [];

  for (const ent of world.entities.values()) {
    if (ent.kind === 'projectile') {
      projectiles.push(ent);
    } else if (ent.hull > 0 && !isInertKind(ent.kind)) {
      targets.push(ent);
    }
  }

  for (const proj of projectiles) {
    proj.pos.x += proj.vel.x * dt;
    proj.pos.y += proj.vel.y * dt;
    (proj as any).distanceTraveled += Math.hypot(proj.vel.x, proj.vel.y) * dt;

    if ((proj as any).distanceTraveled >= ((proj as any).maxDistance || 700)) {
      world.entities.delete(proj.id);
      continue;
    }

    const sourceId = (proj as any).sourceEntityId;
    const splash = (proj as any).splashRadius || 0;

    let hit = false;
    for (const target of targets) {
      if (target.id === sourceId || !canEngage(world, proj, target)) continue;

      if (distSq(proj.pos, target.pos) <= (target.radius + 6) * (target.radius + 6)) {
        hit = true;
        applyHit(world, proj, target, splash);
        world.entities.delete(proj.id);
        break;
      }
    }
  }
}

/** Secondary machine gun: unlimited ammo, auto-fires at the nearest enemy within mgRange (hitscan). */
function updateSecondaryWeapons(world: World): void {
  for (const ent of world.entities.values()) {
    if (ent.hull <= 0 || ent.mgReloadRemaining > 0 || ent.mgDamage <= 0) continue;
    if (!(ent.kind === 'player' || ent.kind === 'npc_driver' || ent.kind === 'boss')) continue;
    if (isPosInSafeZone(world, ent.pos) || ent.statusEffects.some((s) => s.type === 'stunned')) continue;
    let target: SimEntity | undefined;
    let best = ent.mgRange;
    for (const o of world.entities.values()) {
      if (o.id === ent.id || o.hull <= 0 || !canEngage(world, ent, o) || isInertKind(o.kind)) continue;
      const d = dist(ent.pos, o.pos);
      if (d < best) { best = d; target = o; }
    }
    if (!target || isPosInSafeZone(world, target.pos) || target.invulnerableTime > 0) continue;
    ent.mgReloadRemaining = ent.mgReloadTime;
    const res = resolveDamage({
      rawDamage: ent.mgDamage,
      attackerPos: ent.pos,
      targetPos: target.pos,
      targetChassisAngle: target.chassisAngle,
      targetArmor: target.armor,
      targetMaxArmor: target.maxArmor,
      targetFlatReduction: target.flatArmorReduction,
      isCrit: false,
      isMarked: target.statusEffects.some((s) => s.type === 'marked'),
      isInvulnerable: false,
    });
    target.armor = res.newArmor;
    target.hull = Math.max(0, target.hull - res.hullDamage);
    recordBossDamage(target, ent.id, res.totalDamageDealt);
    target.armorRegenTimer = 0;
    target.lastDamagedTick = world.tick;
    target.hitFlashTimer = 0.12;
    world.events.push({
      type: 'projectile_fired', shooterId: ent.id, pos: { ...ent.pos },
      angle: Math.atan2(target.pos.y - ent.pos.y, target.pos.x - ent.pos.x), speed: 900, range: ent.mgRange, ammoType: 'STANDARD', isSecondary: true,
    });
    world.events.push({
      type: 'damage_dealt', attackerId: ent.id, targetId: target.id, rawDamage: res.rawDamage, finalDamage: res.totalDamageDealt,
      armorDamage: res.armorDamage, hullDamage: res.hullDamage, isCrit: res.isCrit, isRearHit: res.isRearHit, isFrontHit: res.isFrontHit,
      ammoType: 'STANDARD', pos: { ...target.pos },
    });
    if (target.hull <= 0) {
      world.events.push({ type: 'entity_killed', victimId: target.id, killerId: ent.id, pos: { ...target.pos }, level: target.level, scrapReward: 25 * target.level, xpReward: 80 * target.level });
    }
  }
}

export function recordBossDamage(victim: SimEntity, attackerId: number | undefined, amount: number): void {
  if (victim.damageBy && attackerId !== undefined) victim.damageBy[attackerId] = (victim.damageBy[attackerId] ?? 0) + amount;
}

function applyHit(world: World, proj: SimEntity, primaryTarget: SimEntity, splashRadius: number): void {
  const sourceId = (proj as any).sourceEntityId;
  const attacker = world.entities.get(sourceId);

  const targetsToHit = splashRadius > 0
    ? Array.from(world.entities.values()).filter(e =>
        e.hull > 0 &&
        e.id !== sourceId &&
        canEngage(world, proj, e) &&
        dist(proj.pos, e.pos) <= splashRadius
      )
    : [primaryTarget];

  for (const victim of targetsToHit) {
    if (isPosInSafeZone(world, victim.pos)) continue;

    // Ammo multiplier
    const ammoMult = getAmmoDamageMultiplier(proj.selectedAmmo, victim.kind, victim.vehicleClass);
    let rawDamage = proj.mainDamage * ammoMult;

    // Splash distance falloff
    if (splashRadius > 0 && victim.id !== primaryTarget.id) {
      const d = dist(proj.pos, victim.pos);
      rawDamage *= Math.max(0.35, 1 - d / splashRadius);
    }

    const isCrit = world.rng.chance(proj.critChance || 0.05);
    const isMarked = victim.statusEffects.some(s => s.type === 'marked');
    const isInvuln = victim.invulnerableTime > 0 || victim.statusEffects.some(s => s.type === 'invulnerable');

    const result = resolveDamage({
      rawDamage,
      attackerPos: proj.pos,
      targetPos: victim.pos,
      targetChassisAngle: victim.chassisAngle,
      targetArmor: victim.armor,
      targetMaxArmor: victim.maxArmor,
      targetFlatReduction: victim.flatArmorReduction,
      isCrit,
      isMarked,
      isInvulnerable: isInvuln,
    });

    victim.armor = result.newArmor;
    victim.hull = Math.max(0, victim.hull - result.hullDamage);
    recordBossDamage(victim, sourceId, result.totalDamageDealt);
    victim.armorRegenTimer = 0; // Reset out of combat regen timer
    victim.lastDamagedTick = world.tick;
    victim.hitFlashTimer = 0.12;

    // Interrupt repair kit if hit
    victim.statusEffects = victim.statusEffects.filter(s => s.type !== 'repairing');

    world.events.push({
      type: 'damage_dealt',
      attackerId: sourceId,
      targetId: victim.id,
      rawDamage: result.rawDamage,
      finalDamage: result.totalDamageDealt,
      armorDamage: result.armorDamage,
      hullDamage: result.hullDamage,
      isCrit: result.isCrit,
      isRearHit: result.isRearHit,
      isFrontHit: result.isFrontHit,
      ammoType: proj.selectedAmmo,
      pos: { ...victim.pos },
    });

    if (victim.hull <= 0) {
      world.events.push({
        type: 'entity_killed',
        victimId: victim.id,
        killerId: sourceId,
        pos: { ...victim.pos },
        level: victim.level,
        scrapReward: 25 * victim.level,
        xpReward: 80 * victim.level,
      });
    }
  }
}

function updateStatusAndRegen(world: World, dt: number): void {
  for (const ent of world.entities.values()) {
    if (ent.hull <= 0) continue;

    // Reload timers
    if (ent.mainReloadRemaining > 0) {
      ent.mainReloadRemaining = Math.max(0, ent.mainReloadRemaining - dt);
    }
    if (ent.mgReloadRemaining > 0) {
      ent.mgReloadRemaining = Math.max(0, ent.mgReloadRemaining - dt);
    }

    // Ability cooldowns
    const cdKeys = Object.keys(ent.abilityCooldowns) as AbilityId[];
    for (const k of cdKeys) {
      const cd = ent.abilityCooldowns[k];
      if (cd !== undefined && cd > 0) {
        ent.abilityCooldowns[k] = Math.max(0, cd - dt);
      }
    }

    // Status effects tick
    const statusTick = tickStatusEffects(ent.statusEffects, dt);
    ent.statusEffects = statusTick.remainingEffects;

    if (statusTick.burningDamage > 0) {
      ent.hull = Math.max(0, ent.hull - statusTick.burningDamage);
    }

    // Repair kit healing: 25% hull over 5s (5% per second)
    const isRepairing = ent.statusEffects.some(s => s.type === 'repairing');
    if (isRepairing) {
      ent.hull = Math.min(ent.maxHull, ent.hull + ent.maxHull * 0.05 * dt);
    }

    // Passive Armor Regeneration (8s delay, 4%/s)
    const regen = tickArmorRegen(ent.armor, ent.maxArmor, ent.armorRegenTimer, dt);
    ent.armor = regen.armor;
    ent.armorRegenTimer = regen.armorRegenTimer;
  }
}

/**
 * Computes deterministic snapshot hash of world entities state.
 */
export function hashWorldState(world: World): string {
  const parts: string[] = [`t:${world.tick}`, `next:${world.nextEntityId}`];
  const sortedIds = Array.from(world.entities.keys()).sort((a, b) => a - b);

  for (const id of sortedIds) {
    const e = world.entities.get(id)!;
    parts.push(
      `id:${id}:${e.kind}:x:${Math.round(e.pos.x * 100)}:y:${Math.round(e.pos.y * 100)}:h:${Math.round(e.hull)}:a:${Math.round(e.armor)}`
    );
  }

  return parts.join('|');
}
