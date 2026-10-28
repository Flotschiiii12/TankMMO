/**
 * Treadfront - Vehicle Data Tables (Section 3)
 * 5 Classes x 10 Tiers = 50 Distinct Combat Vehicles
 *
 * Tiers:
 * 1: Patchwork (L1)
 * 2: Drifter (L8)
 * 3: Wanderer (L16)
 * 4: Warden (L24)
 * 5: Striker (L34)
 * 6: Bulwark (L44)
 * 7: Conqueror (L56)
 * 8: Behemoth (L68)
 * 9: Titan (L80)
 * 10: Colossus (L92)
 *
 * Scaling: 1.45x per tier for hull/armor/damage, 1.04x per tier for speed.
 */

import { VehicleClass } from '../types.ts';

import { PACE } from '../rules/movement.ts';
export interface VehicleDefinition {
  id: string;
  nameKey: string;
  vehicleClass: VehicleClass;
  tier: number;
  minLevel: number;
  baseHull: number;
  baseArmor: number;
  baseSpeed: number;
  turnRate: number;        // rad/s
  turretTurnRate: number;  // rad/s
  baseDamage: number;
  reloadTime: number;      // s
  range: number;
  mainSlots: number;       // 1-2
  secondarySlots: number;  // 1
  armorSlots: number;      // 1
  engineSlots: number;     // 1
  moduleSlots: number;     // 2-4
  droneSlots: number;      // 1-2
  costScrap: number;
  costOre: number;
  specialAbility: string;
  descriptionKey: string;
}

export const TIER_CONFIGS = [
  { tier: 1, name: 'Patchwork', minLevel: 1, costScrap: 0, costOre: 0, moduleSlots: 2, droneSlots: 1, mainSlots: 1 },
  { tier: 2, name: 'Drifter', minLevel: 8, costScrap: 800, costOre: 50, moduleSlots: 2, droneSlots: 1, mainSlots: 1 },
  { tier: 3, name: 'Wanderer', minLevel: 16, costScrap: 2400, costOre: 180, moduleSlots: 2, droneSlots: 1, mainSlots: 1 },
  { tier: 4, name: 'Warden', minLevel: 24, costScrap: 6500, costOre: 450, moduleSlots: 3, droneSlots: 1, mainSlots: 1 },
  { tier: 5, name: 'Striker', minLevel: 34, costScrap: 16000, costOre: 1100, moduleSlots: 3, droneSlots: 1, mainSlots: 2 },
  { tier: 6, name: 'Bulwark', minLevel: 44, costScrap: 38000, costOre: 2600, moduleSlots: 3, droneSlots: 2, mainSlots: 2 },
  { tier: 7, name: 'Conqueror', minLevel: 56, costScrap: 85000, costOre: 5800, moduleSlots: 4, droneSlots: 2, mainSlots: 2 },
  { tier: 8, name: 'Behemoth', minLevel: 68, costScrap: 190000, costOre: 13000, moduleSlots: 4, droneSlots: 2, mainSlots: 2 },
  { tier: 9, name: 'Titan', minLevel: 80, costScrap: 420000, costOre: 29000, moduleSlots: 4, droneSlots: 2, mainSlots: 2 },
  { tier: 10, name: 'Colossus', minLevel: 92, costScrap: 950000, costOre: 65000, moduleSlots: 4, droneSlots: 2, mainSlots: 2 },
] as const;

export interface ClassMultiplier {
  hull: number;
  armor: number;
  speed: number;
  turnRate: number;
  turretTurnRate: number;
  damage: number;
  reload: number;
  range: number;
  ability: string;
}

export const CLASS_MULTIPLIERS: Record<VehicleClass, ClassMultiplier> = {
  scout: {
    hull: 0.76,
    armor: 0.69,
    speed: 1.30,
    turnRate: 1.25,
    turretTurnRate: 1.30,
    damage: 0.85,
    reload: 0.80,
    range: 650,
    ability: 'dash',
  },
  medium: {
    hull: 0.80,
    armor: 0.80,
    speed: 1.00,
    turnRate: 1.00,
    turretTurnRate: 1.00,
    damage: 1.00,
    reload: 1.00,
    range: 700,
    ability: 'overcharge',
  },
  heavy: {
    hull: 1.07,
    armor: 1.11,
    speed: 0.80,
    turnRate: 0.80,
    turretTurnRate: 0.85,
    damage: 1.00,
    reload: 1.30,
    range: 720,
    ability: 'fortify',
  },
  artillery: {
    hull: 0.86,
    armor: 0.80,
    speed: 0.82,
    turnRate: 0.75,
    turretTurnRate: 0.75,
    damage: 2.16,
    reload: 1.45,
    range: 950,
    ability: 'barrage',
  },
  support: {
    hull: 0.85,
    armor: 0.94,
    speed: 1.05,
    turnRate: 1.05,
    turretTurnRate: 1.10,
    damage: 0.80,
    reload: 0.90,
    range: 680,
    ability: 'repair_aura',
  },
};

const BASE_HULL = 1200;
const BASE_ARMOR = 800;
const BASE_SPEED = PACE.baseSpeed;
const BASE_TURN_RATE = PACE.baseTurnRate;
const BASE_TURRET_TURN_RATE = 3.2;
const BASE_DAMAGE = 150;
const BASE_RELOAD = 1.8;

export function generateAllVehicles(): VehicleDefinition[] {
  const classes: VehicleClass[] = ['scout', 'medium', 'heavy', 'artillery', 'support'];
  const list: VehicleDefinition[] = [];

  for (const c of classes) {
    const cm = CLASS_MULTIPLIERS[c];

    for (const tConfig of TIER_CONFIGS) {
      const tier = tConfig.tier;
      const statScale = Math.pow(1.45, tier - 1);
      const speedScale = Math.pow(1.04, tier - 1);

      const id = `veh_${c}_t${tier}`;
      const nameKey = `vehicle.${c}.${tier}.name`;
      const descriptionKey = `vehicle.${c}.${tier}.desc`;

      list.push({
        id,
        nameKey,
        vehicleClass: c,
        tier,
        minLevel: tConfig.minLevel,
        baseHull: Math.round(BASE_HULL * statScale * cm.hull),
        baseArmor: Math.round(BASE_ARMOR * statScale * cm.armor),
        baseSpeed: Math.round(BASE_SPEED * speedScale * cm.speed),
        turnRate: Number((BASE_TURN_RATE * cm.turnRate).toFixed(2)),
        turretTurnRate: Number((BASE_TURRET_TURN_RATE * cm.turretTurnRate).toFixed(2)),
        baseDamage: Math.round(BASE_DAMAGE * statScale * cm.damage),
        reloadTime: Number((BASE_RELOAD * cm.reload).toFixed(2)),
        range: cm.range,
        mainSlots: tConfig.mainSlots,
        secondarySlots: 1,
        armorSlots: 1,
        engineSlots: 1,
        moduleSlots: tConfig.moduleSlots,
        droneSlots: tConfig.droneSlots,
        costScrap: tConfig.costScrap,
        costOre: tConfig.costOre,
        specialAbility: cm.ability,
        descriptionKey,
      });
    }
  }

  return list;
}

export const VEHICLE_CATALOG: VehicleDefinition[] = generateAllVehicles();
export const VEHICLE_BY_ID = new Map<string, VehicleDefinition>(
  VEHICLE_CATALOG.map(v => [v.id, v])
);
