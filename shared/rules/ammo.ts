/**
 * Treadfront - Ammo Rules and Definitions
 * Pure deterministic implementation of ammo types, modifiers, and fallback.
 */

import { AmmoType, EntityKind, VehicleClass } from '../types.ts';

export interface AmmoConfig {
  type: AmmoType;
  nameKey: string;
  damageMultiplier: number;
  armorPiercingBypass: number; // Fraction of target flat armor reduction ignored (e.g. 0.40 = 40%)
  splashRadius: number;
  speed: number;
  rangeMultiplier: number;
  costScrap: number;
  unlimited: boolean;
}

export const AMMO_CONFIGS: Record<AmmoType, AmmoConfig> = {
  STANDARD: {
    type: 'STANDARD',
    nameKey: 'ammo.standard',
    damageMultiplier: 1.0,
    armorPiercingBypass: 0.0,
    splashRadius: 0,
    speed: 620,
    rangeMultiplier: 1.0,
    costScrap: 0,
    unlimited: true,
  },
  REINFORCED: {
    type: 'REINFORCED',
    nameKey: 'ammo.reinforced',
    damageMultiplier: 1.25,
    armorPiercingBypass: 0.0,
    splashRadius: 0,
    speed: 650,
    rangeMultiplier: 1.0,
    costScrap: 4,
    unlimited: false,
  },
  ARMOR_PIERCING: {
    type: 'ARMOR_PIERCING',
    nameKey: 'ammo.armor_piercing',
    damageMultiplier: 1.0,
    armorPiercingBypass: 0.40, // ignores 40% of target armor reduction
    splashRadius: 0,
    speed: 750,
    rangeMultiplier: 1.05,
    costScrap: 6,
    unlimited: false,
  },
  SHAPED_CHARGE: {
    type: 'SHAPED_CHARGE',
    nameKey: 'ammo.shaped_charge',
    damageMultiplier: 1.0, // dynamically modified vs boss/bunker (1.6x) vs vehicle (0.7x)
    armorPiercingBypass: 0.20,
    splashRadius: 0,
    speed: 580,
    rangeMultiplier: 0.95,
    costScrap: 10,
    unlimited: false,
  },
  EXPLOSIVE: {
    type: 'EXPLOSIVE',
    nameKey: 'ammo.explosive',
    damageMultiplier: 0.85,
    armorPiercingBypass: 0.0,
    splashRadius: 60,
    speed: 520,
    rangeMultiplier: 0.9,
    costScrap: 8,
    unlimited: false,
  },
};

/**
 * Calculates dynamic damage multiplier for a given ammo type against a specific target.
 */
export function getAmmoDamageMultiplier(
  ammoType: AmmoType,
  targetKind: EntityKind,
  targetVehicleClass?: VehicleClass
): number {
  const config = AMMO_CONFIGS[ammoType] || AMMO_CONFIGS.STANDARD;

  if (ammoType === 'SHAPED_CHARGE') {
    if (targetKind === 'boss' || targetKind === 'bunker_turret') {
      return 1.6; // x1.6 vs bosses / bunkers
    }
    return 0.7; // x0.7 vs vehicles
  }

  if (ammoType === 'ARMOR_PIERCING') {
    // x1.0 vs light (scout/medium), x0.8 vs heavy bodies
    if (targetVehicleClass === 'heavy') {
      return 0.8;
    }
    return 1.0;
  }

  return config.damageMultiplier;
}

/**
 * Checks ammo inventory, consumes 1 unit if applicable, and falls back to STANDARD if empty.
 */
export function consumeAmmo(
  inventory: Record<AmmoType, number>,
  requestedAmmo: AmmoType
): { effectiveAmmo: AmmoType; newInventory: Record<AmmoType, number> } {
  const config = AMMO_CONFIGS[requestedAmmo];
  if (!config || config.unlimited) {
    return { effectiveAmmo: 'STANDARD', newInventory: { ...inventory } };
  }

  const currentCount = inventory[requestedAmmo] ?? 0;
  if (currentCount <= 0) {
    // Auto-fallback to STANDARD if special ammo is exhausted
    return { effectiveAmmo: 'STANDARD', newInventory: { ...inventory, [requestedAmmo]: 0 } };
  }

  return {
    effectiveAmmo: requestedAmmo,
    newInventory: {
      ...inventory,
      [requestedAmmo]: currentCount - 1,
    },
  };
}
