// Client view of the simulation types. Entities, commands, events and chat now come from /shared
// (the single deterministic simulation); only the map *view model* below is client specific.
export {
  vec2, distSq, dist, normalize, angleDiff, clamp, lerp,
} from '../../shared/types.ts';
export type {
  Vec2, AmmoType, EntityKind, SimEntity, SimCommand, SimEvent, ChatMessage, MapObstacle, AbilityId, StatusEffectType,
} from '../../shared/types.ts';
import type { Vec2, EntityKind, MapObstacle, AmmoType, TimeOfDay } from '../../shared/types.ts';

export interface VehicleStats {
  id: string;
  name: string;
  vehicleClass: 'scout' | 'medium' | 'heavy' | 'artillery' | 'support';
  tier: number;
  damage: number;
  range: number;
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
  id: string;
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
  timeOfDay?: TimeOfDay;
  sunDirection?: Vec2;
}
