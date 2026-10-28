import { VehicleStats } from '../sim/types.ts';
import { TIER_CONFIGS, VEHICLE_CATALOG } from '../../shared/data/vehicles.ts';
import { nm } from '../i18n.ts';

const CLASS_LABEL: Record<string, string> = {
  scout: 'Scout',
  medium: 'Medium',
  heavy: 'Heavy',
  artillery: 'Artillery',
  support: 'Support',
};

const CLASS_BLURB: Record<string, string> = {
  scout: 'Fast and light. Dash to close in or break away.',
  medium: 'Balanced all-rounder with Overcharge.',
  heavy: 'Slow, thick armor and extra slots. Fortify to hold the line.',
  artillery: 'Long range splash damage, fragile. Barrage hits a marked area.',
  support: 'Repair aura and radar for the group, low damage.',
};

/** All 50 vehicles (5 classes x 10 tiers) from the shared data tables. */
export const VEHICLE_TIERS: VehicleStats[] = VEHICLE_CATALOG.map((v) => {
  const tierName = TIER_CONFIGS[v.tier - 1].name;
  return {
    id: v.id,
    name: nm(v.nameKey, `${tierName} ${CLASS_LABEL[v.vehicleClass]}`),
    vehicleClass: v.vehicleClass,
    tier: v.tier,
    damage: v.baseDamage,
    range: v.range,
    baseHull: v.baseHull,
    baseArmor: v.baseArmor,
    maxSpeed: v.baseSpeed,
    turnRate: v.turnRate,
    turretTurnRate: v.turretTurnRate,
    reloadTime: v.reloadTime,
    costScrap: v.costScrap,
    // Ore is not a profile currency yet (economy milestone): parts stand in at 1/10.
    costParts: Math.round(v.costOre / 10),
    minLevel: v.minLevel,
    description: nm(v.descriptionKey, CLASS_BLURB[v.vehicleClass]),
  };
});

export const STARTER_VEHICLE_ID = 'veh_medium_t1';

/** Saves from before the 50-vehicle roster used six prototype ids. */
export const LEGACY_VEHICLE_IDS: Record<string, string> = {
  patchwork_scout: 'veh_medium_t1',
  ranger: 'veh_medium_t2',
  warden: 'veh_medium_t3',
  bulwark: 'veh_heavy_t4',
  sentinel: 'veh_medium_t5',
  titan: 'veh_heavy_t6',
};

export function migrateVehicleId(id: string): string {
  return LEGACY_VEHICLE_IDS[id] || id;
}

export function getVehicleById(id: string): VehicleStats {
  const found = VEHICLE_TIERS.find((v) => v.id === migrateVehicleId(id));
  return found || VEHICLE_TIERS.find((v) => v.id === STARTER_VEHICLE_ID)!;
}
