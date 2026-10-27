/**
 * Treadfront - Shared Simulation Types
 * Deterministic, pure TypeScript. No DOM or Node.js runtime bindings.
 */

export const SIM_TIMESTEP = 1 / 30; // 30 Hz fixed timestep (~0.033333s)
export const SIM_TICK_RATE = 30;
export const SERVER_SNAPSHOT_RATE = 10; // 10 Hz snapshots sent over network

// ==========================================
// 1. Math Primitives
// ==========================================

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

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/**
 * Returns angular difference in range [-PI, PI]
 */
export function angleDiff(target: number, current: number): number {
  let d = target - current;
  while (d < -Math.PI) d += Math.PI * 2;
  while (d > Math.PI) d -= Math.PI * 2;
  return d;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ==========================================
// 2. Combat & Vehicle Classifications
// ==========================================

export type VehicleClass =
  | 'scout'
  | 'medium'
  | 'heavy'
  | 'artillery'
  | 'support';

export type AmmoType =
  | 'STANDARD'
  | 'REINFORCED'
  | 'ARMOR_PIERCING'
  | 'SHAPED_CHARGE'
  | 'EXPLOSIVE';

// Backward compatibility alias for lowercase ammo ids
export type AmmoTypeLower = 'standard' | 'reinforced' | 'ap' | 'shaped' | 'he' | 'explosive';

export type AbilityId =
  | 'smoke'
  | 'repair_kit'
  | 'boost'
  | 'radar_pulse'
  | 'emergency_shield'
  | 'dash'           // Scout class ability
  | 'overcharge'     // Medium class ability
  | 'fortify'        // Heavy class ability
  | 'barrage'        // Artillery class ability
  | 'repair_aura';   // Support class ability

export type StatusEffectType =
  | 'slowed'
  | 'burning'
  | 'stunned'
  | 'marked'
  | 'smoked'
  | 'invulnerable'
  | 'fortified'
  | 'boosted'
  | 'repairing';

export interface ActiveStatusEffect {
  type: StatusEffectType;
  duration: number; // remaining duration in seconds
  maxDuration: number;
  value?: number; // e.g. slow multiplier (0.6), DoT damage per tick
  sourceId?: number; // entity id that caused it
  stacks?: number;
}

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
  | 'resource_node'
  | 'wreck';

// ==========================================
// 3. Entity Representation
// ==========================================

export interface SimEntity {
  id: number;
  kind: EntityKind;
  name: string;
  clanTag?: string;
  level: number;
  vehicleClass?: VehicleClass;
  tier?: number;

  pos: Vec2;
  vel: Vec2;
  chassisAngle: number;
  turretAngle: number;
  radius: number;

  // Combat Stats
  hull: number;
  maxHull: number;
  armor: number;
  maxArmor: number;
  armorRegenTimer: number; // seconds since last damage taken
  flatArmorReduction: number; // Flat damage reduction from armor parts/talents
  critChance: number; // 0..1 (default e.g. 0.05)

  // Driving & Mobility
  maxSpeed: number;
  turnRate: number; // rad/s
  turretTurnRate: number; // rad/s
  targetSpeed: number;
  desiredDriveAngle?: number;

  // Weapons & Ammo
  targetId?: number;
  autoFire?: boolean;
  mainReloadRemaining: number;
  mainReloadTime: number;
  mainDamage: number;
  mainRange: number;
  mainProjectileSpeed: number;
  selectedAmmo: AmmoType;
  ammoInventory: Record<AmmoType, number>; // stack counts; STANDARD is infinite (-1)
  
  // Secondary Weapon (MG)
  mgReloadRemaining: number;
  mgReloadTime: number;
  mgDamage: number;
  mgRange: number;

  // Ability Cooldowns & Durations
  abilityCooldowns: Partial<Record<AbilityId, number>>;
  statusEffects: ActiveStatusEffect[];

  // Diminishing returns tracker for CC (e.g. EMP Stun)
  stunDiminishingTimer: number; // window where subsequent stuns have reduced duration
  stunCount: number;

  // Safe zones & Spawn protection
  invulnerableTime: number;
  isInSafeZone?: boolean;

  // AI State (for NPCs and enemies)
  aiState?: 'idle' | 'patrol' | 'aggro' | 'attack' | 'retreat';
  homePos?: Vec2;
  patrolAngle?: number;
  aiTimer?: number;
  isHostile: boolean;
  leashRange?: number;
  aggroRange?: number;

  // Interactive entities
  gateId?: string;
  targetMapId?: string;
  crateType?: 'scrap' | 'ore' | 'parts' | 'ammo' | 'repair';
  crateValue?: number;
  wreckTimer?: number;
  nodeType?: 'iron' | 'copper' | 'titanium' | 'crystal';
  nodeOreRemaining?: number;

  // Telegraph for boss / artillery ground attacks
  telegraphRadius?: number;
  telegraphDuration?: number;
  telegraphMaxDuration?: number;
  telegraphDamage?: number;
}

// ==========================================
// 4. Commands (Client -> Sim)
// ==========================================

export type SimCommand =
  | { type: 'Drive'; seq?: number; x: number; y: number }
  | { type: 'SetTarget'; seq?: number; targetId: number | null }
  | { type: 'ToggleAutoFire'; seq?: number; enabled?: boolean }
  | { type: 'FireMain'; seq?: number }
  | { type: 'UseAbility'; seq?: number; abilityId: AbilityId; targetPos?: Vec2 }
  | { type: 'SelectAmmo'; seq?: number; ammo: AmmoType }
  | { type: 'EnterGate'; seq?: number; gateId?: string }
  | { type: 'Interact'; seq?: number; targetId?: number };

// ==========================================
// 5. Simulation Events (Sim -> Client / Server)
// ==========================================

export interface DamageDealtEvent {
  type: 'damage_dealt';
  attackerId?: number;
  targetId: number;
  rawDamage: number;
  finalDamage: number;
  armorDamage: number;
  hullDamage: number;
  isCrit: boolean;
  isRearHit: boolean;
  isFrontHit: boolean;
  ammoType: AmmoType;
  pos: Vec2;
}

export interface EntityKilledEvent {
  type: 'entity_killed';
  victimId: number;
  killerId?: number;
  pos: Vec2;
  level: number;
  scrapReward: number;
  xpReward: number;
}

export interface LootCollectedEvent {
  type: 'loot_collected';
  collectorId: number;
  crateType: string;
  amount: number;
  pos: Vec2;
}

export interface AbilityUsedEvent {
  type: 'ability_used';
  entityId: number;
  abilityId: AbilityId;
  pos: Vec2;
}

export interface ProjectileFiredEvent {
  type: 'projectile_fired';
  shooterId: number;
  pos: Vec2;
  angle: number;
  speed: number;
  range: number;
  ammoType: AmmoType;
  isSecondary: boolean;
}

export interface ChatMessage {
  id: string;
  sender: string;
  clanTag?: string;
  channel: 'G' | 'M' | 'F' | 'C' | 'P' | 'W' | 'S'; // Global, Map, Faction, Clan, Party, Whisper, System
  text: string;
  timestamp: number;
}

export type SimEvent =
  | DamageDealtEvent
  | EntityKilledEvent
  | LootCollectedEvent
  | AbilityUsedEvent
  | ProjectileFiredEvent
  | { type: 'gate_used'; entityId: number; gateId: string; targetMapId: string }
  | { type: 'status_applied'; entityId: number; status: StatusEffectType; duration: number }
  | { type: 'level_up'; entityId: number; newLevel: number };

// ==========================================
// 6. Map & Obstacle Definitions
// ==========================================

export type BiomeType =
  | 'coastal'
  | 'highland'
  | 'steppe'
  | 'marsh'
  | 'canyon'
  | 'snow'
  | 'ruins'
  | 'desert'
  | 'volcanic'
  | 'arena'
  | 'valley'
  | 'ash';

export type WeatherType =
  | 'clear'
  | 'fog'
  | 'rain'
  | 'storm'
  | 'sandstorm'
  | 'snowstorm'
  | 'ashfall';

export type TimeOfDay = 'dawn' | 'noon' | 'sunset' | 'dusk' | 'night';

export type OreType = 'iron' | 'copper' | 'titanium' | 'crystal';

export type MapType = 'HOME' | 'PVE' | 'HUB' | 'PVP' | 'ENDGAME' | 'ARENA';

export type FactionId =
  | 'coastal_union'
  | 'highland_union'
  | 'steppe_caravan'
  | 'neutral';

export interface MapObstacle {
  x: number;
  y: number;
  radius: number;
  type: 'tree' | 'rock' | 'building' | 'wreck' | 'water' | 'plant' | 'harbor' | 'prop' | 'crystal';
  propId?: string;
  blocks?: boolean;
  slowFactor?: number; // e.g. 0.6 for water/mud
  width?: number;
  height?: number;
}

export interface SafeZone {
  x: number;
  y: number;
  radius: number;
  name: string;
  repairRate?: number;
  faction?: FactionId;
}

export interface GateDef {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  targetMapId: string | number;
  spawnPoint: Vec2;
  targetGateId?: string;
  minLevel?: number;
  safeZoneRadius?: number;
}

export interface ResourceNodeDef {
  id: string;
  type: OreType;
  x: number;
  y: number;
  radius: number;
  maxOre: number;
  currentOre: number;
  respawnSeconds: number;
}

export interface SecretSpotDef {
  id: string;
  name: string;
  x: number;
  y: number;
  description: string;
  rewardXp?: number;
}

export interface EnemySpawnDef {
  type: EntityKind;
  area: { x: number; y: number; width: number; height: number };
  count: number;
  levelRange: [number, number];
  respawnSeconds?: number;
}

export interface BossSpawnDef {
  type?: string;
  name: string;
  level: number;
  pos: Vec2;
  respawnSeconds: number;
  phases?: number;
}

export interface GroundGenerationParams {
  baseColor: string;
  accentColor: string;
  roadColor: string;
  waterColor: string;
  treeCount: number;
  rockCount: number;
  ruinCount: number;
  hasRiver?: boolean;
  riverY?: number;
  hasRoad?: boolean;
}

export interface MapDef {
  id: number | string;
  numericId?: number;
  key?: string;
  nameKey?: string;
  name: string;
  levelRange: [number, number];
  biome: BiomeType;
  width: number;
  height: number;
  type?: MapType;
  faction?: FactionId;
  weather?: WeatherType;
  timeOfDay?: TimeOfDay;
  instanceCapacity?: number;
  seed?: number;
  safeZones: SafeZone[];
  gates: GateDef[];
  obstacles: MapObstacle[];
  resourceNodes?: ResourceNodeDef[];
  lootSpots?: Array<{ x: number; y: number; tier: number }>;
  secrets?: SecretSpotDef[];
  enemySpawns: EnemySpawnDef[];
  bossSpawn?: BossSpawnDef;
  groundParams?: GroundGenerationParams;
  slowZones?: Array<{
    x: number;
    y: number;
    radius: number;
    type: string;
    speedFactor: number;
  }>;
}

