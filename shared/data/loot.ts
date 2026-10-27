/**
 * Treadfront - Loot Tables and Drop Rules (Section 4 & 7)
 * Defines item drop rates, rarity weights, scrap/ore rewards, and pity counter rules.
 */

import { SimRNG } from '../prng.ts';
import { ITEM_CATALOG, ItemRarity, RARITY_CONFIGS } from './items.ts';

export interface LootTableEntry {
  rarity: ItemRarity;
  baseWeight: number; // weight out of 1000
}

export interface LootDropResult {
  itemId?: string;
  rarity?: ItemRarity;
  scrap: number;
  ore: { type: 'iron' | 'copper' | 'titanium' | 'crystal'; amount: number } | null;
  keys: number;
  newPityCounter: number;
  pityTriggered: boolean;
}

export const PITY_THRESHOLD = 10; // Guaranteed Rare+ drop after 10 drops without Rare+

export function rollLoot(
  rng: SimRNG,
  enemyLevel: number,
  tier: number,
  isElite: boolean,
  isBoss: boolean,
  currentPityCounter: number
): LootDropResult {
  const levelMult = 1 + enemyLevel * 0.05;
  const scrap = Math.round((20 + enemyLevel * 12) * (isBoss ? 15 : isElite ? 4 : 1));

  // Determine ore drop
  let ore: { type: 'iron' | 'copper' | 'titanium' | 'crystal'; amount: number } | null = null;
  const oreChance = isBoss ? 1.0 : isElite ? 0.8 : 0.35;
  if (rng.chance(oreChance)) {
    const oreType = enemyLevel < 20 ? 'iron' : enemyLevel < 45 ? 'copper' : enemyLevel < 70 ? 'titanium' : 'crystal';
    const oreAmount = Math.round((2 + enemyLevel * 0.4) * (isBoss ? 8 : isElite ? 3 : 1));
    ore = { type: oreType, amount: oreAmount };
  }

  // Determine item drop
  const dropChance = isBoss ? 1.0 : isElite ? 0.65 : 0.30;
  if (!rng.chance(dropChance)) {
    return {
      scrap,
      ore,
      keys: isBoss ? 1 : 0,
      newPityCounter: currentPityCounter,
      pityTriggered: false,
    };
  }

  let pityTriggered = false;
  let newPityCounter = currentPityCounter + 1;

  // Calculate weights
  let weights = { ...RARITY_CONFIGS };
  let rolledRarity: ItemRarity = 'Common';

  if (newPityCounter >= PITY_THRESHOLD || isBoss) {
    pityTriggered = true;
    newPityCounter = 0;
    // Guaranteed Rare, Epic, or Legendary
    const roll = rng.next();
    if (roll < 0.15 || (isBoss && roll < 0.35)) {
      rolledRarity = 'Epic';
    } else {
      rolledRarity = 'Rare';
    }
  } else {
    // Normal roll with level shift
    const roll = rng.range(0, 1000);
    const eliteBonus = isElite ? 100 : 0;
    const rareBonus = Math.min(150, enemyLevel * 2) + eliteBonus;

    const commonThreshold = Math.max(250, weights.Common.weight - rareBonus);
    const uncommonThreshold = commonThreshold + weights.Uncommon.weight;
    const rareThreshold = uncommonThreshold + weights.Rare.weight + rareBonus;
    const epicThreshold = rareThreshold + weights.Epic.weight;

    if (roll < commonThreshold) {
      rolledRarity = 'Common';
    } else if (roll < uncommonThreshold) {
      rolledRarity = 'Uncommon';
    } else if (roll < rareThreshold) {
      rolledRarity = 'Rare';
      newPityCounter = 0; // Reset pity
    } else if (roll < epicThreshold) {
      rolledRarity = 'Epic';
      newPityCounter = 0; // Reset pity
    } else {
      rolledRarity = 'Legendary';
      newPityCounter = 0; // Reset pity
    }
  }

  // Find an eligible item matching tier and rarity
  const targetTier = Math.max(1, Math.min(8, Math.ceil(enemyLevel / 12)));
  const candidates = ITEM_CATALOG.filter(i => Math.abs(i.tier - targetTier) <= 1);
  const picked = candidates.length > 0 ? rng.pick(candidates) : ITEM_CATALOG[0];

  return {
    itemId: picked.id,
    rarity: rolledRarity,
    scrap,
    ore,
    keys: isBoss ? 1 : 0,
    newPityCounter,
    pityTriggered,
  };
}
