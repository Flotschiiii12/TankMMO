export interface Vec2 {
  x: number;
  y: number;
}

export function vec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function distSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.sqrt(distSq(a, b));
}

export function normalize(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function angleDiff(target: number, current: number): number {
  let diff = target - current;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return diff;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export type AmmoType = 'standard' | 'ap' | 'he';

export type EntityKind =
  | 'player'
  | 'npc_driver'
  | 'scout_buggy'
  | 'gunner_truck'
  | 'artillery'
  | 'bunker_turret'
  | 'loot_convoy'
  | 'boss'
  | 'projectile'
  | 'loot_crate'
  | 'gate'
  | 'telegraph'
  | 'resource_node';

export interface VehicleStats {
  id: string;
  name: string;
  tier: number;
  baseHull: number;
  baseArmor: number;
  maxSpeed: number;
  turnRate: number; // rad/s
  turretTurnRate: number; // rad/s
  reloadTime: number; // seconds
  costScrap: number;
  costParts: number;
  minLevel: number;
  description: string;
}

export interface PartDefinition {
  id: string;
  name: string;
  type: 'cannon' | 'armor' | 'engine';
  tier: number;
  costScrap: number;
  costParts: number;
  minLevel: number;
  dpsBonus: number;
  hullBonus: number;
  armorBonus: number;
  speedBonus: number;
  description: string;
}

export interface AmmoDefinition {
  id: AmmoType;
  name: string;
  damage: number;
  armorPiercingRatio: number; // 0 = standard, 0.35 = ignores 35% armor
  splashRadius: number; // 0 = single target, >0 = HE
  speed: number;
  range: number;
  costScrapPerPack: number;
  packSize: number;
  description: string;
}

export interface SimEntity {
  id: number;
  kind: EntityKind;
  name: string;
  clanTag?: string;
  level: number;
  pos: Vec2;
  vel: Vec2;
  chassisAngle: number;
  turretAngle: number;
  radius: number;
  
  hull: number;
  maxHull: number;
  armor: number;
  maxArmor: number;
  armorRegenTimer: number; // seconds since last damage
  
  // Driving
  maxSpeed: number;
  turnRate: number;
  turretTurnRate: number;
  targetSpeed: number;
  desiredDriveAngle?: number;
  
  // Combat
  targetId?: number;
  autoFire?: boolean;
  mainReloadRemaining: number;
  mainReloadTime: number;
  mgReloadRemaining: number;
  selectedAmmo: AmmoType;
  
  // Abilities
  smokeRemaining: number;
  smokeCooldown: number;
  repairRemaining: number;
  repairCooldown: number;
  overdriveRemaining: number;
  overdriveCooldown: number;
  
  // Invulnerability on spawn/respawn
  invulnerableTime: number;
  
  // AI State
  aiState?: 'idle' | 'patrol' | 'aggro' | 'attack' | 'retreat';
  homePos?: Vec2;
  patrolAngle?: number;
  aiTimer?: number;
  isHostile: boolean;
  
  // Boss Phase
  bossPhase?: number;
  bossSkillCooldown?: number;
  
  // Gate specific
  gateId?: string;
  targetMapId?: string;
  gateHoldTimer?: number;

  // Projectile specific
  sourceEntityId?: number;
  damage?: number;
  ammoType?: AmmoType;
  distanceTraveled?: number;
  maxDistance?: number;
  splashRadius?: number;

  // Loot Crate specific
  lootScrap?: number;
  lootParts?: number;
  lootAmmo?: { type: AmmoType; count: number };
  pullTargetId?: number;

  // Telegraph specific
  telegraphRadius?: number;
  telegraphTimer?: number;
  telegraphTotal?: number;

  // Visual polish & loot fields
  hitFlashTimer?: number;
  distanceDriven?: number;
  wreckTimer?: number;
  isWreck?: boolean;
  lootKind?: 'scrap' | 'ore' | 'ammo' | 'repair';
}

export interface MapObstacle {
  x: number;
  y: number;
  radius: number;
  type: 'rock' | 'tree' | 'ruin' | 'wall' | 'building' | 'plant' | 'harbor' | 'prop';
  propId?: string;
  blocks?: boolean;
  width?: number;
  height?: number;
  rotation?: number;
}

export interface MapSlowZone {
  x: number;
  y: number;
  radius: number;
  type: 'mud' | 'water' | 'snow';
  speedFactor: number;
}

export interface MapGateDef {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  targetMapId: string | number;
  targetGateId?: string;
  spawnPoint?: Vec2;
  minLevel?: number;
  safeZoneRadius?: number;
}

export interface MapDef {
  id: string | number;
  numericId?: number;
  key?: string;
  name: string;
  biome: string;
  width: number;
  height: number;
  safeZone?: {
    x: number;
    y: number;
    radius: number;
  };
  safeZones?: Array<{
    name: string;
    x: number;
    y: number;
    radius: number;
    repairRate?: number;
    faction?: string;
  }>;
  landmark?: {
    name: string;
    x: number;
    y: number;
    type: string;
  };
  gates: MapGateDef[];
  obstacles: MapObstacle[];
  slowZones: MapSlowZone[];
  enemySpawns: Array<{
    type: EntityKind;
    count: number;
    levelRange: [number, number];
    area: { x: number; y: number; width: number; height: number };
  }>;
  bossSpawn?: {
    type?: string;
    name: string;
    level: number;
    pos: Vec2;
  };
  weather?: string;
  timeOfDay?: string;
}


// Commands
export type SimCommand =
  | { type: 'Drive'; x: number; y: number; seq?: number }
  | { type: 'SetTarget'; targetId: number | undefined }
  | { type: 'ToggleAutoFire' }
  | { type: 'FireMain' }
  | { type: 'UseAbility'; abilityId: 'smoke' | 'repair' | 'overdrive' }
  | { type: 'SelectAmmo'; ammo: AmmoType }
  | { type: 'EnterGate'; gateId: string };

export interface ChatMessage {
  id: string;
  sender: string;
  clanTag?: string;
  channel: 'G' | 'S'; // G = Global, S = System
  text: string;
  timestamp: number;
  isHostile?: boolean;
}

export interface SimEvent {
  type:
    | 'damage'
    | 'kill'
    | 'loot_collected'
    | 'gate_travel'
    | 'level_up'
    | 'player_respawn'
    | 'ability_used'
    | 'boss_phase'
    | 'chat';
  payload: any;
}
