import { AMMO_TYPES } from '../data/parts.ts';
import { ENEMY_ARCHETYPES, SCRIPTED_ALLY_DRIVERS, SCRIPTED_CHAT_LINES } from '../data/enemies.ts';
import { MAP_CATALOG } from '../data/maps.ts';
import { VEHICLE_TIERS } from '../data/vehicles.ts';
import { SimRNG } from './rng.ts';
import {
  AmmoType,
  angleDiff,
  ChatMessage,
  clamp,
  dist,
  distSq,
  EntityKind,
  lerp,
  MapDef,
  normalize,
  SimCommand,
  SimEntity,
  SimEvent,
  vec2,
  Vec2,
} from './types.ts';

export const SIM_TIMESTEP = 1 / 30; // 30 Hz fixed timestep

export interface World {
  id: string;
  mapId: string;
  tick: number;
  time: number;
  nextEntityId: number;
  entities: Map<number, SimEntity>;
  rng: SimRNG;
  events: SimEvent[];
  chatHistory: ChatMessage[];
  mapDef: MapDef;
  bossRespawnTimer: number;
  allyChatTimer: number;
  enemyRespawnQueue: Array<{
    type: EntityKind;
    level: number;
    homePos: Vec2;
    timer: number;
  }>;
}

export function createWorld(mapId = 'green_valley', seed = 42): World {
  const mapDef = MAP_CATALOG[mapId] || MAP_CATALOG['green_valley'];
  const rng = new SimRNG(seed);

  const world: World = {
    id: `world_${mapId}`,
    mapId,
    tick: 0,
    time: 0,
    nextEntityId: 1,
    entities: new Map(),
    rng,
    events: [],
    chatHistory: [
      {
        id: 'msg_welcome',
        sender: 'HQ Commander',
        clanTag: 'CMD',
        channel: 'S',
        text: `Welcome to ${mapDef.name}. Secure resources, watch your flanks, and upgrade in the safe zone.`,
        timestamp: 0,
      },
    ],
    mapDef,
    bossRespawnTimer: 0,
    allyChatTimer: 6.0,
    enemyRespawnQueue: [],
  };

  spawnGates(world);
  spawnInitialEnemies(world);
  spawnScriptedAllies(world);

  return world;
}

function getNextId(world: World): number {
  return world.nextEntityId++;
}

function spawnGates(world: World) {
  for (const gate of world.mapDef.gates) {
    const id = getNextId(world);
    world.entities.set(id, {
      id,
      kind: 'gate',
      name: gate.name,
      level: 1,
      pos: { x: gate.x, y: gate.y },
      vel: vec2(),
      chassisAngle: 0,
      turretAngle: 0,
      radius: gate.radius,
      hull: 999999,
      maxHull: 999999,
      armor: 999999,
      maxArmor: 999999,
      armorRegenTimer: 0,
      maxSpeed: 0,
      turnRate: 0,
      turretTurnRate: 0,
      targetSpeed: 0,
      mainReloadRemaining: 0,
      mainReloadTime: 1,
      mgReloadRemaining: 0,
      selectedAmmo: 'standard',
      smokeRemaining: 0,
      smokeCooldown: 0,
      repairRemaining: 0,
      repairCooldown: 0,
      overdriveRemaining: 0,
      overdriveCooldown: 0,
      invulnerableTime: 999999,
      isHostile: false,
      gateId: gate.id,
      targetMapId: gate.targetMapId,
    });
  }
}

function spawnInitialEnemies(world: World) {
  for (const spawn of world.mapDef.enemySpawns) {
    for (let i = 0; i < spawn.count; i++) {
      const level = world.rng.rangeInt(spawn.levelRange[0], spawn.levelRange[1]);
      const x = spawn.area.x + world.rng.next() * spawn.area.width;
      const y = spawn.area.y + world.rng.next() * spawn.area.height;
      spawnEnemy(world, spawn.type, level, { x, y });
    }
  }

  if (world.mapDef.bossSpawn) {
    spawnBoss(world);
  }
}

export function spawnDebugTargetEnemies(world: World, playerPos: Vec2) {
  // Spawn test targets just outside safe zone for instant combat validation
  spawnEnemy(world, 'scout_buggy', 2, { x: playerPos.x + 440, y: playerPos.y + 200 });
  spawnEnemy(world, 'gunner_truck', 3, { x: playerPos.x - 440, y: playerPos.y + 200 });
  spawnEnemy(world, 'loot_convoy', 4, { x: playerPos.x + 500, y: playerPos.y - 300 });
}

export function spawnBoss(world: World) {
  const bossDef = world.mapDef.bossSpawn;
  if (!bossDef) return;

  const archKey =
    bossDef.type === 'siege_crawler'
      ? 'boss_siege_crawler'
      : bossDef.type === 'storm_walker'
      ? 'boss_storm_walker'
      : 'boss_fortress_train';

  const arch = ENEMY_ARCHETYPES[archKey];
  const id = getNextId(world);

  world.entities.set(id, {
    id,
    kind: 'boss',
    name: bossDef.name,
    clanTag: 'BOSS',
    level: bossDef.level,
    pos: { ...bossDef.pos },
    vel: vec2(),
    chassisAngle: world.rng.next() * Math.PI * 2,
    turretAngle: 0,
    radius: arch.radius,
    hull: arch.baseHull,
    maxHull: arch.baseHull,
    armor: arch.baseArmor,
    maxArmor: arch.baseArmor,
    armorRegenTimer: 0,
    maxSpeed: arch.maxSpeed,
    turnRate: arch.turnRate,
    turretTurnRate: arch.turretTurnRate,
    targetSpeed: 0,
    mainReloadRemaining: 0,
    mainReloadTime: arch.reloadTime,
    mgReloadRemaining: 0,
    selectedAmmo: 'he',
    smokeRemaining: 0,
    smokeCooldown: 0,
    repairRemaining: 0,
    repairCooldown: 0,
    overdriveRemaining: 0,
    overdriveCooldown: 0,
    invulnerableTime: 0,
    aiState: 'patrol',
    homePos: { ...bossDef.pos },
    patrolAngle: world.rng.next() * Math.PI * 2,
    aiTimer: 0,
    isHostile: true,
    bossPhase: 1,
    bossSkillCooldown: 4.0,
  });

  world.chatHistory.push({
    id: `msg_boss_spawn_${world.tick}`,
    sender: 'SATELLITE WARNING',
    clanTag: 'WARN',
    channel: 'S',
    text: `CRITICAL ALERT: ${bossDef.name} detected on the battlefield!`,
    timestamp: world.time,
  });
}

export function spawnEnemy(
  world: World,
  kind: EntityKind,
  level: number,
  pos: Vec2
): SimEntity {
  const arch = ENEMY_ARCHETYPES[kind] || ENEMY_ARCHETYPES['scout_buggy'];
  const levelMult = 1 + (level - 1) * 0.12;

  const maxHull = Math.round(arch.baseHull * levelMult);
  const maxArmor = Math.round(arch.baseArmor * levelMult);

  const id = getNextId(world);
  const entity: SimEntity = {
    id,
    kind,
    name: `${arch.displayName} [Lv.${level}]`,
    level,
    pos: { ...pos },
    vel: vec2(),
    chassisAngle: world.rng.next() * Math.PI * 2,
    turretAngle: 0,
    radius: arch.radius,
    hull: maxHull,
    maxHull,
    armor: maxArmor,
    maxArmor,
    armorRegenTimer: 0,
    maxSpeed: arch.maxSpeed,
    turnRate: arch.turnRate,
    turretTurnRate: arch.turretTurnRate,
    targetSpeed: 0,
    mainReloadRemaining: world.rng.rangeFloat(0.2, arch.reloadTime),
    mainReloadTime: arch.reloadTime,
    mgReloadRemaining: 0,
    selectedAmmo: kind === 'artillery' ? 'he' : 'standard',
    smokeRemaining: 0,
    smokeCooldown: 0,
    repairRemaining: 0,
    repairCooldown: 0,
    overdriveRemaining: 0,
    overdriveCooldown: 0,
    invulnerableTime: 0,
    aiState: 'patrol',
    homePos: { ...pos },
    patrolAngle: world.rng.next() * Math.PI * 2,
    aiTimer: world.rng.rangeFloat(1, 4),
    isHostile: true,
  };

  world.entities.set(id, entity);
  return entity;
}

function spawnScriptedAllies(world: World) {
  // Spawn 6 friendly scripted drivers
  for (let i = 0; i < 6; i++) {
    const info = SCRIPTED_ALLY_DRIVERS[i % SCRIPTED_ALLY_DRIVERS.length];
    const tierData = VEHICLE_TIERS[info.tier - 1] || VEHICLE_TIERS[0];
    const id = getNextId(world);
    const angle = (i / 6) * Math.PI * 2;
    const center = world.mapDef.safeZone
      ? { x: world.mapDef.safeZone.x, y: world.mapDef.safeZone.y }
      : { x: world.mapDef.width / 2, y: world.mapDef.height / 2 };
    const distFromCenter = 300 + (i % 3) * 180;
    const pos = {
      x: center.x + Math.cos(angle) * distFromCenter,
      y: center.y + Math.sin(angle) * distFromCenter,
    };

    world.entities.set(id, {
      id,
      kind: 'npc_driver',
      name: info.name,
      clanTag: info.clanTag,
      level: info.tier * 4 + world.rng.rangeInt(0, 3),
      pos,
      vel: vec2(),
      chassisAngle: angle,
      turretAngle: angle,
      radius: 26,
      hull: tierData.baseHull,
      maxHull: tierData.baseHull,
      armor: tierData.baseArmor,
      maxArmor: tierData.baseArmor,
      armorRegenTimer: 0,
      maxSpeed: tierData.maxSpeed * 0.95,
      turnRate: tierData.turnRate,
      turretTurnRate: tierData.turretTurnRate,
      targetSpeed: 0,
      mainReloadRemaining: 0,
      mainReloadTime: tierData.reloadTime,
      mgReloadRemaining: 0,
      selectedAmmo: 'standard',
      smokeRemaining: 0,
      smokeCooldown: 0,
      repairRemaining: 0,
      repairCooldown: 0,
      overdriveRemaining: 0,
      overdriveCooldown: 0,
      invulnerableTime: 0,
      aiState: 'patrol',
      homePos: { ...pos },
      patrolAngle: angle,
      aiTimer: 2,
      isHostile: false,
    });
  }
}

/**
 * Main simulation step function.
 * Called at 30 Hz fixed timestep.
 */
export function stepWorld(
  world: World,
  commandsByEntity: Map<number, SimCommand[]>,
  dt: number = SIM_TIMESTEP
) {
  world.tick++;
  world.time += dt;
  world.events = []; // Clear previous tick events

  // 1. Process player/entity explicit commands
  for (const [entityId, commands] of commandsByEntity.entries()) {
    const ent = world.entities.get(entityId);
    if (!ent) continue;

    for (const cmd of commands) {
      applyCommand(world, ent, cmd);
    }
  }

  // 2. Update AI behaviors
  updateAI(world, dt);

  // 3. Update physics, movement, tank steering, obstacle collisions
  updatePhysicsAndMovement(world, dt);

  // 4. Update combat, targeting, weapons, and projectiles
  updateCombat(world, dt);

  // 5. Update abilities & regeneration
  updateAbilitiesAndRegen(world, dt);

  // 6. Update loot drops & magnetic pickup
  updateLoot(world, dt);

  // 7. Update gate interactions
  updateGates(world, dt);

  // 8. Update respawn queues & scripted driver chat
  updateWorldState(world, dt);
}

function applyCommand(world: World, ent: SimEntity, cmd: SimCommand) {
  if (ent.hull <= 0) return;

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
      if (cmd.targetId === undefined) {
        ent.targetId = undefined;
      } else {
        const target = world.entities.get(cmd.targetId);
        if (target && target.hull > 0 && target.isHostile !== ent.isHostile) {
          ent.targetId = cmd.targetId;
        }
      }
      break;
    }
    case 'ToggleAutoFire': {
      ent.autoFire = !ent.autoFire;
      break;
    }
    case 'FireMain': {
      tryFireMainCannon(world, ent);
      break;
    }
    case 'SelectAmmo': {
      ent.selectedAmmo = cmd.ammo;
      break;
    }
    case 'UseAbility': {
      if (cmd.abilityId === 'smoke' && ent.smokeCooldown <= 0) {
        ent.smokeRemaining = 4.0;
        ent.smokeCooldown = 18.0;
        // All enemies targeting this entity lose lock
        for (const e of world.entities.values()) {
          if (e.targetId === ent.id) {
            e.targetId = undefined;
          }
        }
        world.events.push({
          type: 'ability_used',
          payload: { entityId: ent.id, ability: 'smoke', pos: { ...ent.pos } },
        });
      } else if (cmd.abilityId === 'repair' && ent.repairCooldown <= 0) {
        ent.repairRemaining = 5.0;
        ent.repairCooldown = 25.0;
        world.events.push({
          type: 'ability_used',
          payload: { entityId: ent.id, ability: 'repair', pos: { ...ent.pos } },
        });
      } else if (cmd.abilityId === 'overdrive' && ent.overdriveCooldown <= 0) {
        ent.overdriveRemaining = 6.0;
        ent.overdriveCooldown = 30.0;
        world.events.push({
          type: 'ability_used',
          payload: { entityId: ent.id, ability: 'overdrive', pos: { ...ent.pos } },
        });
      }
      break;
    }
    case 'EnterGate': {
      // Triggered by proximity hold in updateGates
      break;
    }
  }
}

function updateAI(world: World, dt: number) {
  for (const ent of world.entities.values()) {
    if (ent.kind === 'player' || ent.kind === 'gate' || ent.kind === 'projectile' || ent.kind === 'loot_crate' || ent.kind === 'telegraph') {
      continue;
    }
    if (ent.hull <= 0) continue;

    ent.aiTimer = (ent.aiTimer || 0) - dt;

    // AI targeting: find closest enemy if current target is invalid or dead or in smoke
    let target = ent.targetId !== undefined ? world.entities.get(ent.targetId) : undefined;
    if (target && (target.hull <= 0 || target.smokeRemaining > 0 || distSq(ent.pos, target.pos) > 1200 * 1200)) {
      ent.targetId = undefined;
      target = undefined;
    }

    if (!target) {
      // Find nearest hostile
      let closestDist = 750;
      let closestId: number | undefined;
      for (const other of world.entities.values()) {
        if (other.id === ent.id || other.hull <= 0 || other.isHostile === ent.isHostile) continue;
        if (other.kind === 'gate' || other.kind === 'loot_crate' || other.kind === 'projectile') continue;
        if (other.smokeRemaining > 0) continue;
        const d = dist(ent.pos, other.pos);
        if (d < closestDist) {
          closestDist = d;
          closestId = other.id;
        }
      }
      if (closestId !== undefined) {
        ent.targetId = closestId;
        target = world.entities.get(closestId);
      }
    }

    // Boss specific AI
    if (ent.kind === 'boss') {
      updateBossAI(world, ent, target, dt);
      continue;
    }

    // Bunker Turret AI
    if (ent.kind === 'bunker_turret') {
      if (target) {
        const aimAngle = Math.atan2(target.pos.y - ent.pos.y, target.pos.x - ent.pos.x);
        const diff = angleDiff(aimAngle, ent.turretAngle);
        ent.turretAngle += clamp(diff, -ent.turretTurnRate * dt, ent.turretTurnRate * dt);
        if (Math.abs(diff) < 0.25 && dist(ent.pos, target.pos) <= 650) {
          tryFireMainCannon(world, ent);
        }
      }
      continue;
    }

    // Artillery AI
    if (ent.kind === 'artillery') {
      updateArtilleryAI(world, ent, target, dt);
      continue;
    }

    // Convoy AI
    if (ent.kind === 'loot_convoy') {
      updateConvoyAI(world, ent, dt);
      continue;
    }

    // Scout Buggy & Gunner Truck & Ally Driver AI
    if (target) {
      // Aggro / Combat movement
      const toTarget = { x: target.pos.x - ent.pos.x, y: target.pos.y - ent.pos.y };
      const d = Math.hypot(toTarget.x, toTarget.y);
      const idealRange = ent.kind === 'scout_buggy' ? 260 : 380;

      let driveAngle: number;
      if (d > idealRange + 70) {
        driveAngle = Math.atan2(toTarget.y, toTarget.x);
      } else if (d < idealRange - 70) {
        driveAngle = Math.atan2(-toTarget.y, -toTarget.x);
      } else {
        // Circle target
        driveAngle = Math.atan2(toTarget.y, toTarget.x) + Math.PI / 2;
      }

      ent.desiredDriveAngle = driveAngle;
      ent.targetSpeed = ent.maxSpeed * (ent.kind === 'scout_buggy' ? 0.9 : 0.75);

      // Aim turret at target
      const aimAngle = Math.atan2(toTarget.y, toTarget.x);
      const diff = angleDiff(aimAngle, ent.turretAngle);
      ent.turretAngle += clamp(diff, -ent.turretTurnRate * dt, ent.turretTurnRate * dt);

      if (Math.abs(diff) < 0.25 && d <= 600) {
        tryFireMainCannon(world, ent);
      }
    } else {
      // Patrol wander around homePos
      if (ent.aiTimer !== undefined && ent.aiTimer <= 0) {
        ent.aiTimer = world.rng.rangeFloat(2, 5);
        ent.patrolAngle = world.rng.next() * Math.PI * 2;
        ent.targetSpeed = world.rng.next() > 0.3 ? ent.maxSpeed * 0.45 : 0;
      }
      ent.desiredDriveAngle = ent.patrolAngle;
      // Gently face turret forward
      const diff = angleDiff(ent.chassisAngle, ent.turretAngle);
      ent.turretAngle += clamp(diff, -ent.turretTurnRate * dt, ent.turretTurnRate * dt);
    }
  }
}

function updateArtilleryAI(world: World, ent: SimEntity, target: SimEntity | undefined, dt: number) {
  if (target) {
    const toTarget = { x: target.pos.x - ent.pos.x, y: target.pos.y - ent.pos.y };
    const d = Math.hypot(toTarget.x, toTarget.y);
    const aimAngle = Math.atan2(toTarget.y, toTarget.x);
    const diff = angleDiff(aimAngle, ent.turretAngle);
    ent.turretAngle += clamp(diff, -ent.turretTurnRate * dt, ent.turretTurnRate * dt);

    // Artillery wants to maintain 750-900 distance
    if (d < 700) {
      ent.desiredDriveAngle = Math.atan2(-toTarget.y, -toTarget.x);
      ent.targetSpeed = ent.maxSpeed;
    } else if (d > 950) {
      ent.desiredDriveAngle = aimAngle;
      ent.targetSpeed = ent.maxSpeed;
    } else {
      ent.targetSpeed = 0;
    }

    if (Math.abs(diff) < 0.25 && d <= 1000 && ent.mainReloadRemaining <= 0) {
      // Spawn telegraphed mortar shot!
      ent.mainReloadRemaining = ent.mainReloadTime;
      const targetPredictPos = {
        x: target.pos.x + target.vel.x * 0.8,
        y: target.pos.y + target.vel.y * 0.8,
      };
      spawnTelegraph(world, targetPredictPos, 110, 1.0, ent.id, 650);
    }
  } else {
    ent.targetSpeed = 0;
  }
}

function updateConvoyAI(world: World, ent: SimEntity, dt: number) {
  if (ent.aiTimer !== undefined && ent.aiTimer <= 0) {
    ent.aiTimer = world.rng.rangeFloat(4, 8);
    ent.patrolAngle = world.rng.next() * Math.PI * 2;
  }
  ent.desiredDriveAngle = ent.patrolAngle || 0;
  ent.targetSpeed = ent.maxSpeed * 0.6;
}

function updateBossAI(world: World, ent: SimEntity, target: SimEntity | undefined, dt: number) {
  // Phase logic based on hull ratio
  const hpRatio = ent.hull / ent.maxHull;
  if (hpRatio < 0.33 && ent.bossPhase !== 3) {
    ent.bossPhase = 3;
    world.chatHistory.push({
      id: `msg_boss_p3_${world.tick}`,
      sender: ent.name,
      clanTag: 'BOSS',
      channel: 'S',
      text: `${ent.name} enters ENRAGE! Firepower maximized!`,
      timestamp: world.time,
    });
  } else if (hpRatio < 0.66 && ent.bossPhase === 1) {
    ent.bossPhase = 2;
    world.chatHistory.push({
      id: `msg_boss_p2_${world.tick}`,
      sender: ent.name,
      clanTag: 'BOSS',
      channel: 'S',
      text: `${ent.name} deploys scout escorts and initiates barrage protocol!`,
      timestamp: world.time,
    });
    // Summon 2 scout escorts
    spawnEnemy(world, 'scout_buggy', Math.max(1, ent.level - 4), {
      x: ent.pos.x - 80,
      y: ent.pos.y - 80,
    });
    spawnEnemy(world, 'scout_buggy', Math.max(1, ent.level - 4), {
      x: ent.pos.x + 80,
      y: ent.pos.y + 80,
    });
  }

  ent.bossSkillCooldown = (ent.bossSkillCooldown || 0) - dt;

  if (target) {
    const toTarget = { x: target.pos.x - ent.pos.x, y: target.pos.y - ent.pos.y };
    const d = Math.hypot(toTarget.x, toTarget.y);
    const aimAngle = Math.atan2(toTarget.y, toTarget.x);
    const diff = angleDiff(aimAngle, ent.turretAngle);
    ent.turretAngle += clamp(diff, -ent.turretTurnRate * dt, ent.turretTurnRate * dt);

    // Movement: slowly advance towards target
    if (d > 450) {
      ent.desiredDriveAngle = aimAngle;
      ent.targetSpeed = ent.maxSpeed * (ent.bossPhase === 3 ? 1.4 : 1.0);
    } else {
      ent.targetSpeed = ent.maxSpeed * 0.4;
    }

    // Direct cannon fire
    if (Math.abs(diff) < 0.3 && d <= 900) {
      tryFireMainCannon(world, ent);
    }

    // Boss special attack: barrage of telegraph mortars
    if (ent.bossSkillCooldown <= 0) {
      ent.bossSkillCooldown = ent.bossPhase === 3 ? 3.5 : 6.0;
      const count = ent.bossPhase === 3 ? 4 : 2;
      for (let i = 0; i < count; i++) {
        const offsetAngle = world.rng.next() * Math.PI * 2;
        const offsetDist = world.rng.rangeFloat(40, 160);
        const splashPos = {
          x: target.pos.x + Math.cos(offsetAngle) * offsetDist,
          y: target.pos.y + Math.sin(offsetAngle) * offsetDist,
        };
        spawnTelegraph(world, splashPos, 120, 1.0, ent.id, 750);
      }
    }
  } else {
    ent.targetSpeed = ent.maxSpeed * 0.3;
  }
}

function updatePhysicsAndMovement(world: World, dt: number) {
  for (const ent of world.entities.values()) {
    if (ent.kind === 'gate' || ent.kind === 'projectile' || ent.kind === 'loot_crate' || ent.kind === 'telegraph') {
      continue;
    }
    if (ent.hull <= 0) {
      ent.vel = vec2();
      continue;
    }

    // Check slow zones
    let slowFactor = 1.0;
    for (const zone of world.mapDef.slowZones) {
      if (distSq(ent.pos, { x: zone.x, y: zone.y }) < zone.radius * zone.radius) {
        slowFactor = Math.min(slowFactor, zone.speedFactor);
      }
    }

    // Overdrive speed buff
    const overdriveMult = ent.overdriveRemaining > 0 ? 1.3 : 1.0;
    const effectiveMaxSpeed = ent.maxSpeed * slowFactor * overdriveMult;

    // Tank physics: turn chassis toward desiredDriveAngle
    if (ent.desiredDriveAngle !== undefined && ent.targetSpeed > 5) {
      const diff = angleDiff(ent.desiredDriveAngle, ent.chassisAngle);
      const turnStep = ent.turnRate * dt;
      ent.chassisAngle += clamp(diff, -turnStep, turnStep);

      // Accelerate forward along chassis direction
      const forwardAngle = ent.chassisAngle;
      const forwardVec = { x: Math.cos(forwardAngle), y: Math.sin(forwardAngle) };
      // Align drive efficiency with chassis facing
      const alignFactor = Math.max(0.3, Math.cos(diff));
      const targetV = {
        x: forwardVec.x * ent.targetSpeed * alignFactor * overdriveMult * slowFactor,
        y: forwardVec.y * ent.targetSpeed * alignFactor * overdriveMult * slowFactor,
      };

      ent.vel.x = lerp(ent.vel.x, targetV.x, 6.0 * dt);
      ent.vel.y = lerp(ent.vel.y, targetV.y, 6.0 * dt);
    } else {
      // Decelerate smoothly
      ent.vel.x = lerp(ent.vel.x, 0, 7.0 * dt);
      ent.vel.y = lerp(ent.vel.y, 0, 7.0 * dt);
    }

    // Update position and distanceDriven for animated tracks
    const stepLen = Math.hypot(ent.vel.x, ent.vel.y) * dt;
    ent.pos.x += ent.vel.x * dt;
    ent.pos.y += ent.vel.y * dt;
    ent.distanceDriven = (ent.distanceDriven || 0) + stepLen;

    // Collide with map boundaries
    const margin = ent.radius + 15;
    ent.pos.x = clamp(ent.pos.x, margin, world.mapDef.width - margin);
    ent.pos.y = clamp(ent.pos.y, margin, world.mapDef.height - margin);

    // Collide with map obstacles
    for (const obs of world.mapDef.obstacles) {
      const dx = ent.pos.x - obs.x;
      const dy = ent.pos.y - obs.y;
      const d = Math.hypot(dx, dy);
      const minDist = ent.radius + obs.radius;
      if (d < minDist && d > 0.001) {
        const overlap = minDist - d;
        ent.pos.x += (dx / d) * overlap;
        ent.pos.y += (dy / d) * overlap;
        // Dampen velocity against obstacle
        ent.vel.x *= 0.5;
        ent.vel.y *= 0.5;
      }
    }
  }

  // Soft vehicle-vehicle separation
  const vehicles = Array.from(world.entities.values()).filter(
    (e) =>
      e.hull > 0 &&
      (e.kind === 'player' ||
        e.kind === 'npc_driver' ||
        e.kind === 'scout_buggy' ||
        e.kind === 'gunner_truck' ||
        e.kind === 'artillery' ||
        e.kind === 'bunker_turret' ||
        e.kind === 'loot_convoy' ||
        e.kind === 'boss')
  );

  for (let i = 0; i < vehicles.length; i++) {
    for (let j = i + 1; j < vehicles.length; j++) {
      const a = vehicles[i];
      const b = vehicles[j];
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const d = Math.hypot(dx, dy);
      const minDist = a.radius + b.radius;
      if (d < minDist && d > 0.001) {
        const overlap = (minDist - d) * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        if (a.kind !== 'bunker_turret') {
          a.pos.x -= nx * overlap;
          a.pos.y -= ny * overlap;
        }
        if (b.kind !== 'bunker_turret') {
          b.pos.x += nx * overlap;
          b.pos.y += ny * overlap;
        }
      }
    }
  }
}

function updateCombat(world: World, dt: number) {
  // 1. Update cooldowns and auto-turret alignment
  for (const ent of world.entities.values()) {
    if (ent.hull <= 0) continue;

    if (ent.mainReloadRemaining > 0) {
      const reloadSpeedBuff = ent.overdriveRemaining > 0 ? 1.33 : 1.0;
      ent.mainReloadRemaining -= dt * reloadSpeedBuff;
    }
    if (ent.mgReloadRemaining > 0) {
      ent.mgReloadRemaining -= dt;
    }

    // Player or vehicle turret alignment towards target
    if (ent.targetId !== undefined) {
      const target = world.entities.get(ent.targetId);
      if (target && target.hull > 0 && target.smokeRemaining <= 0) {
        const aimAngle = Math.atan2(target.pos.y - ent.pos.y, target.pos.x - ent.pos.x);
        const diff = angleDiff(aimAngle, ent.turretAngle);
        ent.turretAngle += clamp(diff, -ent.turretTurnRate * dt, ent.turretTurnRate * dt);

        // Auto-fire main cannon if aligned and in range
        if (ent.autoFire && Math.abs(diff) < 0.22 && dist(ent.pos, target.pos) <= 700) {
          tryFireMainCannon(world, ent);
        }
      } else {
        ent.targetId = undefined;
      }
    }

    // Secondary machine gun: automatic fire at closest enemy within 300
    if (ent.kind === 'player' || ent.kind === 'npc_driver' || ent.kind === 'boss') {
      if (ent.mgReloadRemaining <= 0) {
        let nearestHostile: SimEntity | undefined;
        let nearestDist = 300;
        for (const other of world.entities.values()) {
          if (other.id === ent.id || other.hull <= 0 || other.isHostile === ent.isHostile) continue;
          if (other.kind === 'gate' || other.kind === 'loot_crate' || other.kind === 'projectile') continue;
          const d = dist(ent.pos, other.pos);
          if (d < nearestDist) {
            nearestDist = d;
            nearestHostile = other;
          }
        }
        if (nearestHostile) {
          ent.mgReloadRemaining = 0.16; // Rapid MG tick
          fireMachineGunBullet(world, ent, nearestHostile);
        }
      }
    }
  }

  // 2. Update telegraphs (Artillery and Boss ground circles)
  for (const ent of Array.from(world.entities.values())) {
    if (ent.kind !== 'telegraph') continue;
    ent.telegraphTimer = (ent.telegraphTimer || 0) - dt;
    if (ent.telegraphTimer <= 0) {
      // Detonate telegraph splash!
      detonateTelegraph(world, ent);
      world.entities.delete(ent.id);
    }
  }

  // 3. Update projectiles
  for (const proj of Array.from(world.entities.values())) {
    if (proj.kind !== 'projectile') continue;

    proj.pos.x += proj.vel.x * dt;
    proj.pos.y += proj.vel.y * dt;
    proj.distanceTraveled = (proj.distanceTraveled || 0) + Math.hypot(proj.vel.x, proj.vel.y) * dt;

    if (proj.distanceTraveled >= (proj.maxDistance || 700)) {
      world.entities.delete(proj.id);
      continue;
    }

    // Check hit against vehicles
    for (const target of world.entities.values()) {
      if (target.id === proj.sourceEntityId || target.hull <= 0) continue;
      if (target.kind === 'gate' || target.kind === 'loot_crate' || target.kind === 'projectile' || target.kind === 'telegraph') continue;
      if (target.isHostile === proj.isHostile) continue; // No friendly fire

      if (distSq(proj.pos, target.pos) <= (target.radius + 6) * (target.radius + 6)) {
        // Impact!
        applyProjectileDamage(world, proj, target);
        world.entities.delete(proj.id);
        break;
      }
    }
  }
}

function spawnTelegraph(
  world: World,
  pos: Vec2,
  radius: number,
  duration: number,
  sourceId: number,
  damage: number
) {
  const id = getNextId(world);
  world.entities.set(id, {
    id,
    kind: 'telegraph',
    name: 'Artillery Telegraph',
    level: 1,
    pos: { ...pos },
    vel: vec2(),
    chassisAngle: 0,
    turretAngle: 0,
    radius,
    hull: 1,
    maxHull: 1,
    armor: 0,
    maxArmor: 0,
    armorRegenTimer: 0,
    maxSpeed: 0,
    turnRate: 0,
    turretTurnRate: 0,
    targetSpeed: 0,
    mainReloadRemaining: 0,
    mainReloadTime: 1,
    mgReloadRemaining: 0,
    selectedAmmo: 'he',
    smokeRemaining: 0,
    smokeCooldown: 0,
    repairRemaining: 0,
    repairCooldown: 0,
    overdriveRemaining: 0,
    overdriveCooldown: 0,
    invulnerableTime: 0,
    isHostile: true,
    sourceEntityId: sourceId,
    damage,
    telegraphRadius: radius,
    telegraphTimer: duration,
    telegraphTotal: duration,
  });
}

function detonateTelegraph(world: World, telegraph: SimEntity) {
  const radius = telegraph.telegraphRadius || 100;
  const damage = telegraph.damage || 500;

  world.events.push({
    type: 'damage',
    payload: {
      type: 'explosion',
      pos: { ...telegraph.pos },
      radius,
    },
  });

  for (const victim of world.entities.values()) {
    if (victim.hull <= 0 || victim.isHostile === telegraph.isHostile) continue;
    if (victim.kind === 'gate' || victim.kind === 'loot_crate' || victim.kind === 'projectile') continue;

    const d = dist(telegraph.pos, victim.pos);
    if (d <= radius) {
      const falloff = 1 - d / (radius * 1.2);
      const finalDamage = Math.round(damage * Math.max(0.4, falloff));
      inflictDamage(world, victim, finalDamage, telegraph.sourceEntityId, 'he', telegraph.pos);
    }
  }
}

export function tryFireMainCannon(world: World, ent: SimEntity) {
  if (ent.mainReloadRemaining > 0) return;
  if (ent.hull <= 0) return;

  // Safe zone check: cannot fire or deal damage inside safe zone
  if (isInSafeZone(world, ent.pos)) return;

  const ammoDef = AMMO_TYPES[ent.selectedAmmo] || AMMO_TYPES['standard'];
  ent.mainReloadRemaining = ent.mainReloadTime;

  // Spawn projectile
  const muzzleOffset = ent.radius + 14;
  const spawnPos = {
    x: ent.pos.x + Math.cos(ent.turretAngle) * muzzleOffset,
    y: ent.pos.y + Math.sin(ent.turretAngle) * muzzleOffset,
  };

  const id = getNextId(world);
  const proj: SimEntity = {
    id,
    kind: 'projectile',
    name: 'Main Shell',
    level: ent.level,
    pos: spawnPos,
    vel: {
      x: Math.cos(ent.turretAngle) * ammoDef.speed,
      y: Math.sin(ent.turretAngle) * ammoDef.speed,
    },
    chassisAngle: ent.turretAngle,
    turretAngle: ent.turretAngle,
    radius: 4,
    hull: 1,
    maxHull: 1,
    armor: 0,
    maxArmor: 0,
    armorRegenTimer: 0,
    maxSpeed: ammoDef.speed,
    turnRate: 0,
    turretTurnRate: 0,
    targetSpeed: ammoDef.speed,
    mainReloadRemaining: 0,
    mainReloadTime: 1,
    mgReloadRemaining: 0,
    selectedAmmo: ent.selectedAmmo,
    smokeRemaining: 0,
    smokeCooldown: 0,
    repairRemaining: 0,
    repairCooldown: 0,
    overdriveRemaining: 0,
    overdriveCooldown: 0,
    invulnerableTime: 0,
    isHostile: ent.isHostile,
    sourceEntityId: ent.id,
    damage: ammoDef.damage,
    ammoType: ent.selectedAmmo,
    distanceTraveled: 0,
    maxDistance: ammoDef.range,
    splashRadius: ammoDef.splashRadius,
  };

  world.entities.set(id, proj);

  world.events.push({
    type: 'damage',
    payload: {
      type: 'muzzle_flash',
      pos: spawnPos,
      angle: ent.turretAngle,
      isPlayer: ent.kind === 'player',
    },
  });
}

function fireMachineGunBullet(world: World, shooter: SimEntity, target: SimEntity) {
  if (isInSafeZone(world, shooter.pos)) return;

  const aimAngle = Math.atan2(target.pos.y - shooter.pos.y, target.pos.x - shooter.pos.x);
  const spread = (world.rng.next() - 0.5) * 0.12;
  const finalAngle = aimAngle + spread;

  const id = getNextId(world);
  world.entities.set(id, {
    id,
    kind: 'projectile',
    name: 'MG Tracer',
    level: shooter.level,
    pos: {
      x: shooter.pos.x + Math.cos(finalAngle) * (shooter.radius + 5),
      y: shooter.pos.y + Math.sin(finalAngle) * (shooter.radius + 5),
    },
    vel: {
      x: Math.cos(finalAngle) * 1150,
      y: Math.sin(finalAngle) * 1150,
    },
    chassisAngle: finalAngle,
    turretAngle: finalAngle,
    radius: 2,
    hull: 1,
    maxHull: 1,
    armor: 0,
    maxArmor: 0,
    armorRegenTimer: 0,
    maxSpeed: 1150,
    turnRate: 0,
    turretTurnRate: 0,
    targetSpeed: 1150,
    mainReloadRemaining: 0,
    mainReloadTime: 1,
    mgReloadRemaining: 0,
    selectedAmmo: 'standard',
    smokeRemaining: 0,
    smokeCooldown: 0,
    repairRemaining: 0,
    repairCooldown: 0,
    overdriveRemaining: 0,
    overdriveCooldown: 0,
    invulnerableTime: 0,
    isHostile: shooter.isHostile,
    sourceEntityId: shooter.id,
    damage: 42,
    ammoType: 'standard',
    distanceTraveled: 0,
    maxDistance: 320,
    splashRadius: 0,
  });
}

function applyProjectileDamage(world: World, proj: SimEntity, target: SimEntity) {
  const baseDamage = proj.damage || 350;
  const splash = proj.splashRadius || 0;

  if (splash > 0) {
    // Area of effect damage (HE)
    for (const victim of world.entities.values()) {
      if (victim.hull <= 0 || victim.isHostile === proj.isHostile) continue;
      if (victim.kind === 'gate' || victim.kind === 'loot_crate' || victim.kind === 'projectile') continue;
      const d = dist(proj.pos, victim.pos);
      if (d <= splash) {
        const factor = 1 - d / (splash * 1.2);
        inflictDamage(
          world,
          victim,
          Math.round(baseDamage * Math.max(0.35, factor)),
          proj.sourceEntityId,
          proj.ammoType,
          proj.pos
        );
      }
    }
  } else {
    // Direct kinetic hit
    inflictDamage(world, target, baseDamage, proj.sourceEntityId, proj.ammoType, proj.pos);
  }
}

export function inflictDamage(
  world: World,
  victim: SimEntity,
  rawDamage: number,
  attackerId?: number,
  ammoType: AmmoType = 'standard',
  impactPos?: Vec2
) {
  if (victim.hull <= 0 || victim.invulnerableTime > 0) return;
  if (isInSafeZone(world, victim.pos)) return;

  // 1. Angle of Impact multiplier:
  // Front: 0.7x, Side: 1.0x, Rear: 1.4x
  let angleMult = 1.0;
  if (impactPos) {
    const toImpact = { x: impactPos.x - victim.pos.x, y: impactPos.y - victim.pos.y };
    const impactDir = Math.atan2(toImpact.y, toImpact.x);
    const diff = Math.abs(angleDiff(impactDir, victim.chassisAngle));
    if (diff < Math.PI * 0.25) {
      angleMult = 0.7; // Front armor deflection
    } else if (diff > Math.PI * 0.75) {
      angleMult = 1.4; // Rear engine critical hit
    } else {
      angleMult = 1.0; // Side skirt impact
    }
  }

  const modifiedDamage = Math.round(rawDamage * angleMult);

  // 2. Armor absorption:
  // Standard: armor absorbs 65% of damage.
  // AP: ignores 35% of armor absorption.
  const apRatio = ammoType === 'ap' ? 0.35 : 0;
  const armorAbsorptionRatio = 0.65 * (1 - apRatio);

  let armorDamage = Math.round(modifiedDamage * armorAbsorptionRatio);
  let hullDamage = modifiedDamage - armorDamage;

  if (victim.armor >= armorDamage) {
    victim.armor -= armorDamage;
  } else {
    // Excess spills into hull
    const spill = armorDamage - victim.armor;
    victim.armor = 0;
    hullDamage += spill;
  }

  victim.hull = Math.max(0, victim.hull - hullDamage);
  victim.armorRegenTimer = 0; // Reset 8s out-of-combat timer
  victim.repairRemaining = 0; // Interrupt active repair kit!
  victim.hitFlashTimer = 0.12; // Trigger crisp white damage flash

  const isCrit = angleMult > 1.2; // Rear engine critical hit

  world.events.push({
    type: 'damage',
    payload: {
      victimId: victim.id,
      attackerId,
      damage: modifiedDamage,
      hullDamage,
      armorDamage,
      angleMult,
      isCrit,
      pos: { ...victim.pos },
    },
  });

  // Check death
  if (victim.hull <= 0) {
    handleEntityDeath(world, victim, attackerId);
  }
}

function handleEntityDeath(world: World, victim: SimEntity, killerId?: number) {
  victim.isWreck = true;
  victim.wreckTimer = 8.0; // Wreck lingers and fades over 8 seconds
  victim.vel = vec2();

  world.events.push({
    type: 'kill',
    payload: {
      victimId: victim.id,
      victimKind: victim.kind,
      killerId,
      pos: { ...victim.pos },
    },
  });

  const killer = killerId !== undefined ? world.entities.get(killerId) : undefined;

  // Drop loot crate if enemy
  if (victim.isHostile && victim.kind !== 'gate') {
    dropLootCrate(world, victim);
  }

  // Player death
  if (victim.kind === 'player') {
    world.events.push({
      type: 'player_respawn',
      payload: { victimId: victim.id },
    });
  } else if (victim.kind === 'boss') {
    world.bossRespawnTimer = 300.0; // 5 minute respawn timer
    world.chatHistory.push({
      id: `msg_boss_down_${world.tick}`,
      sender: 'SATELLITE HQ',
      clanTag: 'CMD',
      channel: 'S',
      text: `VICTORY: ${victim.name} has been neutralized! Great work team!`,
      timestamp: world.time,
    });
  } else if (victim.isHostile) {
    // Schedule enemy respawn
    world.enemyRespawnQueue.push({
      type: victim.kind,
      level: victim.level,
      homePos: victim.homePos || { ...victim.pos },
      timer: world.rng.rangeFloat(20, 35),
    });
  }
}

function dropLootCrate(world: World, victim: SimEntity) {
  const arch = ENEMY_ARCHETYPES[victim.kind] || ENEMY_ARCHETYPES['scout_buggy'];
  const scrap = world.rng.rangeInt(arch.scrapDrop[0], arch.scrapDrop[1]);
  const parts = world.rng.rangeInt(arch.partsDrop[0], arch.partsDrop[1]);
  const hasAmmo = world.rng.next() > 0.4;
  const ammoType: AmmoType = world.rng.next() > 0.5 ? 'ap' : 'he';

  const id = getNextId(world);
  world.entities.set(id, {
    id,
    kind: 'loot_crate',
    name: 'Supply Crate',
    level: victim.level,
    pos: { ...victim.pos },
    vel: vec2(),
    chassisAngle: 0,
    turretAngle: 0,
    radius: 14,
    hull: 1,
    maxHull: 1,
    armor: 0,
    maxArmor: 0,
    armorRegenTimer: 0,
    maxSpeed: 380,
    turnRate: 0,
    turretTurnRate: 0,
    targetSpeed: 0,
    mainReloadRemaining: 0,
    mainReloadTime: 1,
    mgReloadRemaining: 0,
    selectedAmmo: 'standard',
    smokeRemaining: 0,
    smokeCooldown: 0,
    repairRemaining: 0,
    repairCooldown: 0,
    overdriveRemaining: 0,
    overdriveCooldown: 0,
    invulnerableTime: 0,
    isHostile: false,
    lootScrap: scrap,
    lootParts: parts,
    lootAmmo: hasAmmo ? { type: ammoType, count: 5 } : undefined,
  });
}

function updateAbilitiesAndRegen(world: World, dt: number) {
  for (const ent of world.entities.values()) {
    if (ent.hull <= 0) continue;

    // Tick ability active & cooldown timers
    if (ent.smokeRemaining > 0) ent.smokeRemaining -= dt;
    if (ent.smokeCooldown > 0) ent.smokeCooldown -= dt;
    if (ent.repairRemaining > 0) {
      ent.repairRemaining -= dt;
      // Heals 8% maxHull per second
      ent.hull = Math.min(ent.maxHull, ent.hull + ent.maxHull * 0.08 * dt);
    }
    if (ent.repairCooldown > 0) ent.repairCooldown -= dt;
    if (ent.overdriveRemaining > 0) ent.overdriveRemaining -= dt;
    if (ent.overdriveCooldown > 0) ent.overdriveCooldown -= dt;
    if (ent.invulnerableTime > 0) ent.invulnerableTime -= dt;

    // Hit flash timer
    if (ent.hitFlashTimer && ent.hitFlashTimer > 0) {
      ent.hitFlashTimer -= dt;
    }

    // Safe zone fast repair: +25% hull and armor per sec
    if (isInSafeZone(world, ent.pos)) {
      ent.hull = Math.min(ent.maxHull, ent.hull + ent.maxHull * 0.25 * dt);
      ent.armor = Math.min(ent.maxArmor, ent.armor + ent.maxArmor * 0.25 * dt);
    } else {
      // Out of combat armor regen: after 8 seconds without taking damage
      ent.armorRegenTimer += dt;
      if (ent.armorRegenTimer >= 8.0 && ent.armor < ent.maxArmor) {
        ent.armor = Math.min(ent.maxArmor, ent.armor + ent.maxArmor * 0.08 * dt);
      }
    }
  }
}

function updateLoot(world: World, dt: number) {
  const players = Array.from(world.entities.values()).filter(
    (e) => (e.kind === 'player' || e.kind === 'npc_driver') && e.hull > 0
  );

  for (const crate of Array.from(world.entities.values())) {
    if (crate.kind !== 'loot_crate') continue;

    let closestPlayer: SimEntity | undefined;
    let closestDist = 130; // 120-130 unit pickup magnet radius

    for (const p of players) {
      const d = dist(crate.pos, p.pos);
      if (d < closestDist) {
        closestDist = d;
        closestPlayer = p;
      }
    }

    if (closestPlayer) {
      // Magnetic pull towards player
      const dir = normalize({
        x: closestPlayer.pos.x - crate.pos.x,
        y: closestPlayer.pos.y - crate.pos.y,
      });
      crate.vel.x = dir.x * 420;
      crate.vel.y = dir.y * 420;
      crate.pos.x += crate.vel.x * dt;
      crate.pos.y += crate.vel.y * dt;

      // When close enough, collect
      if (closestDist < closestPlayer.radius + 12) {
        world.events.push({
          type: 'loot_collected',
          payload: {
            collectorId: closestPlayer.id,
            isPlayer: closestPlayer.kind === 'player',
            scrap: crate.lootScrap || 0,
            parts: crate.lootParts || 0,
            ammo: crate.lootAmmo,
            pos: { ...crate.pos },
          },
        });
        world.entities.delete(crate.id);
      }
    }
  }
}

function updateGates(world: World, dt: number) {
  const player = Array.from(world.entities.values()).find((e) => e.kind === 'player' && e.hull > 0);
  if (!player) return;

  let inGate: SimEntity | undefined;
  for (const gate of world.entities.values()) {
    if (gate.kind !== 'gate') continue;
    if (dist(player.pos, gate.pos) <= gate.radius) {
      inGate = gate;
      break;
    }
  }

  if (inGate && inGate.targetMapId) {
    player.gateHoldTimer = (player.gateHoldTimer || 0) + dt;
    if (player.gateHoldTimer >= 3.0) {
      // Travel through gate!
      player.gateHoldTimer = 0;
      world.events.push({
        type: 'gate_travel',
        payload: {
          gateId: inGate.gateId,
          targetMapId: inGate.targetMapId,
        },
      });
    }
  } else {
    player.gateHoldTimer = 0;
  }
}

function updateWorldState(world: World, dt: number) {
  // Update and clean up lingering wrecks
  for (const ent of Array.from(world.entities.values())) {
    if (ent.isWreck && ent.wreckTimer !== undefined) {
      ent.wreckTimer -= dt;
      if (ent.wreckTimer <= 0) {
        world.entities.delete(ent.id);
      }
    }
  }

  // Update enemy respawns
  for (let i = world.enemyRespawnQueue.length - 1; i >= 0; i--) {
    const item = world.enemyRespawnQueue[i];
    item.timer -= dt;
    if (item.timer <= 0) {
      spawnEnemy(world, item.type, item.level, item.homePos);
      world.enemyRespawnQueue.splice(i, 1);
    }
  }

  // Update boss respawn
  if (world.bossRespawnTimer > 0) {
    world.bossRespawnTimer -= dt;
    if (world.bossRespawnTimer <= 0) {
      spawnBoss(world);
    }
  }

  // Ally simulated chat messages
  world.allyChatTimer -= dt;
  if (world.allyChatTimer <= 0) {
    world.allyChatTimer = world.rng.rangeFloat(18, 35);
    const ally = world.rng.pick(SCRIPTED_ALLY_DRIVERS);
    const text = world.rng.pick(SCRIPTED_CHAT_LINES);
    world.chatHistory.push({
      id: `chat_${world.tick}`,
      sender: ally.name,
      clanTag: ally.clanTag,
      channel: 'G',
      text,
      timestamp: world.time,
    });
    // Keep last 40 lines
    if (world.chatHistory.length > 40) {
      world.chatHistory.shift();
    }
  }
}

export function isInSafeZone(world: World, pos: Vec2): boolean {
  if (!world.mapDef.safeZone) return false;
  const sz = world.mapDef.safeZone;
  return distSq(pos, { x: sz.x, y: sz.y }) <= sz.radius * sz.radius;
}
