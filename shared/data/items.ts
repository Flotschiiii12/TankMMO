/**
 * Treadfront - Equipment, Items, and Crafting Data Tables (Section 4)
 * Covers Main Weapons (6 families x 8 tiers), Secondary Weapons (4 x 6),
 * Armor (4 x 8), Engines (3 x 8), Modules (20), Drones (8 x 5),
 * Affixes, Upgrade costs (+0..+15), and Crafting Recipes.
 */

export type ItemRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';

export type ItemFamily =
  // Main Weapons (6 families)
  | 'cannon'
  | 'rapid_fire'
  | 'rocket'
  | 'mortar'
  | 'railgun'
  | 'flamethrower'
  // Secondary Weapons (4 families)
  | 'machine_gun'
  | 'flak'
  | 'mine_layer'
  | 'arc_coil'
  // Armor (4 families)
  | 'reactive_armor'
  | 'composite_armor'
  | 'sloped_armor'
  | 'cage_armor'
  // Engines (3 families)
  | 'speed_engine'
  | 'torque_engine'
  | 'efficiency_engine'
  // Utility Modules
  | 'module'
  // Drones
  | 'drone';

export type ItemSlotType = 'main' | 'secondary' | 'armor' | 'engine' | 'module' | 'drone';

export interface ItemAffix {
  stat: 'dps' | 'hull' | 'armor' | 'speed' | 'crit_chance' | 'flat_reduction' | 'reload_speed' | 'range';
  value: number; // percentage bonus or flat bonus
  nameKey: string;
}

export interface ItemDefinition {
  id: string;
  nameKey: string;
  family: ItemFamily;
  slotType: ItemSlotType;
  tier: number;          // 1 to 8 (or 1 to 6/5 for specific types)
  minLevel: number;
  baseRarity: ItemRarity;
  baseDPS?: number;
  baseHullBonus?: number;
  baseArmorBonus?: number;
  baseFlatReduction?: number;
  baseSpeedBonus?: number;
  baseRange?: number;
  baseReloadTime?: number;
  scrapValue: number;
  dismantleYield: {
    oreType: 'iron' | 'copper' | 'titanium' | 'crystal';
    oreAmount: number;
    fragments: number;
  };
  descriptionKey: string;
}

export interface CraftingRecipe {
  id: string;
  outputItemId: string;
  minLevel: number;
  costScrap: number;
  costOre: {
    iron?: number;
    copper?: number;
    titanium?: number;
    crystal?: number;
  };
  costFragments: number;
}

export const RARITY_CONFIGS: Record<ItemRarity, {
  color: string;
  multiplier: number;
  affixCount: number;
  weight: number;
}> = {
  Common: { color: '#94a3b8', multiplier: 1.0, affixCount: 0, weight: 600 },
  Uncommon: { color: '#22c55e', multiplier: 1.15, affixCount: 1, weight: 260 },
  Rare: { color: '#3b82f6', multiplier: 1.35, affixCount: 2, weight: 105 },
  Epic: { color: '#a855f7', multiplier: 1.65, affixCount: 3, weight: 30 },
  Legendary: { color: '#eab308', multiplier: 2.10, affixCount: 3, weight: 5 },
};

export const UPGRADE_LEVEL_STATS = [
  { level: 0, statMult: 1.00, costScrap: 0, costOre: 0, costFragments: 0, successChance: 1.0 },
  { level: 1, statMult: 1.05, costScrap: 120, costOre: 10, costFragments: 2, successChance: 1.0 },
  { level: 2, statMult: 1.10, costScrap: 280, costOre: 20, costFragments: 4, successChance: 1.0 },
  { level: 3, statMult: 1.16, costScrap: 550, costOre: 35, costFragments: 8, successChance: 1.0 },
  { level: 4, statMult: 1.23, costScrap: 980, costOre: 55, costFragments: 14, successChance: 1.0 },
  { level: 5, statMult: 1.31, costScrap: 1600, costOre: 80, costFragments: 22, successChance: 1.0 },
  { level: 6, statMult: 1.40, costScrap: 2500, costOre: 120, costFragments: 35, successChance: 1.0 },
  { level: 7, statMult: 1.50, costScrap: 3800, costOre: 170, costFragments: 50, successChance: 1.0 },
  { level: 8, statMult: 1.62, costScrap: 5800, costOre: 240, costFragments: 75, successChance: 1.0 },
  { level: 9, statMult: 1.75, costScrap: 8800, costOre: 340, costFragments: 110, successChance: 1.0 },
  { level: 10, statMult: 1.90, costScrap: 13500, costOre: 480, costFragments: 160, successChance: 0.85 },
  { level: 11, statMult: 2.07, costScrap: 21000, costOre: 680, costFragments: 230, successChance: 0.70 },
  { level: 12, statMult: 2.26, costScrap: 32000, costOre: 950, costFragments: 320, successChance: 0.55 },
  { level: 13, statMult: 2.48, costScrap: 48000, costOre: 1300, costFragments: 450, successChance: 0.40 },
  { level: 14, statMult: 2.73, costScrap: 72000, costOre: 1800, costFragments: 620, successChance: 0.30 },
  { level: 15, statMult: 3.00, costScrap: 110000, costOre: 2500, costFragments: 850, successChance: 0.20 },
];

function generateAllItems(): ItemDefinition[] {
  const items: ItemDefinition[] = [];

  // 1. MAIN WEAPONS (6 families x 8 tiers = 48 items)
  const mainFamilies: Array<{ family: ItemFamily; baseDps: number; reload: number; range: number }> = [
    { family: 'cannon', baseDps: 160, reload: 1.8, range: 700 },
    { family: 'rapid_fire', baseDps: 180, reload: 0.6, range: 550 },
    { family: 'rocket', baseDps: 210, reload: 2.8, range: 750 },
    { family: 'mortar', baseDps: 190, reload: 3.2, range: 920 },
    { family: 'railgun', baseDps: 240, reload: 3.6, range: 1050 },
    { family: 'flamethrower', baseDps: 200, reload: 0.2, range: 380 },
  ];

  for (const mf of mainFamilies) {
    for (let tier = 1; tier <= 8; tier++) {
      const scale = Math.pow(1.42, tier - 1);
      const minLevel = 1 + (tier - 1) * 12;
      const oreType = tier <= 2 ? 'iron' : tier <= 4 ? 'copper' : tier <= 6 ? 'titanium' : 'crystal';

      items.push({
        id: `wpn_${mf.family}_t${tier}`,
        nameKey: `item.${mf.family}.${tier}.name`,
        family: mf.family,
        slotType: 'main',
        tier,
        minLevel,
        baseRarity: tier >= 7 ? 'Epic' : tier >= 4 ? 'Rare' : tier >= 2 ? 'Uncommon' : 'Common',
        baseDPS: Math.round(mf.baseDps * scale),
        baseReloadTime: mf.reload,
        baseRange: mf.range,
        scrapValue: Math.round(150 * scale),
        dismantleYield: {
          oreType,
          oreAmount: 8 * tier,
          fragments: 3 * tier,
        },
        descriptionKey: `item.${mf.family}.${tier}.desc`,
      });
    }
  }

  // 2. SECONDARY WEAPONS (4 families x 6 tiers = 24 items)
  const secondaryFamilies: Array<{ family: ItemFamily; baseDps: number; range: number }> = [
    { family: 'machine_gun', baseDps: 60, range: 320 },
    { family: 'flak', baseDps: 75, range: 380 },
    { family: 'mine_layer', baseDps: 120, range: 200 },
    { family: 'arc_coil', baseDps: 85, range: 300 },
  ];

  for (const sf of secondaryFamilies) {
    for (let tier = 1; tier <= 6; tier++) {
      const scale = Math.pow(1.40, tier - 1);
      const minLevel = 1 + (tier - 1) * 15;
      const oreType = tier <= 2 ? 'iron' : tier <= 4 ? 'copper' : 'titanium';

      items.push({
        id: `sec_${sf.family}_t${tier}`,
        nameKey: `item.${sf.family}.${tier}.name`,
        family: sf.family,
        slotType: 'secondary',
        tier,
        minLevel,
        baseRarity: tier >= 5 ? 'Epic' : tier >= 3 ? 'Rare' : 'Common',
        baseDPS: Math.round(sf.baseDps * scale),
        baseRange: sf.range,
        scrapValue: Math.round(90 * scale),
        dismantleYield: {
          oreType,
          oreAmount: 5 * tier,
          fragments: 2 * tier,
        },
        descriptionKey: `item.${sf.family}.${tier}.desc`,
      });
    }
  }

  // 3. ARMOR (4 families x 8 tiers = 32 items)
  const armorFamilies: Array<{ family: ItemFamily; armorBonus: number; flatRed: number }> = [
    { family: 'reactive_armor', armorBonus: 600, flatRed: 12 },
    { family: 'composite_armor', armorBonus: 850, flatRed: 6 },
    { family: 'sloped_armor', armorBonus: 700, flatRed: 18 },
    { family: 'cage_armor', armorBonus: 500, flatRed: 24 },
  ];

  for (const af of armorFamilies) {
    for (let tier = 1; tier <= 8; tier++) {
      const scale = Math.pow(1.42, tier - 1);
      const minLevel = 1 + (tier - 1) * 12;
      const oreType = tier <= 2 ? 'iron' : tier <= 4 ? 'copper' : tier <= 6 ? 'titanium' : 'crystal';

      items.push({
        id: `arm_${af.family}_t${tier}`,
        nameKey: `item.${af.family}.${tier}.name`,
        family: af.family,
        slotType: 'armor',
        tier,
        minLevel,
        baseRarity: tier >= 7 ? 'Epic' : tier >= 4 ? 'Rare' : 'Common',
        baseArmorBonus: Math.round(af.armorBonus * scale),
        baseFlatReduction: Math.round(af.flatRed * scale),
        scrapValue: Math.round(130 * scale),
        dismantleYield: {
          oreType,
          oreAmount: 10 * tier,
          fragments: 3 * tier,
        },
        descriptionKey: `item.${af.family}.${tier}.desc`,
      });
    }
  }

  // 4. ENGINES (3 families x 8 tiers = 24 items)
  const engineFamilies: Array<{ family: ItemFamily; speedBonus: number }> = [
    { family: 'speed_engine', speedBonus: 45 },
    { family: 'torque_engine', speedBonus: 28 },
    { family: 'efficiency_engine', speedBonus: 32 },
  ];

  for (const ef of engineFamilies) {
    for (let tier = 1; tier <= 8; tier++) {
      const scale = Math.pow(1.08, tier - 1);
      const minLevel = 1 + (tier - 1) * 12;
      const oreType = tier <= 2 ? 'iron' : tier <= 4 ? 'copper' : tier <= 6 ? 'titanium' : 'crystal';

      items.push({
        id: `eng_${ef.family}_t${tier}`,
        nameKey: `item.${ef.family}.${tier}.name`,
        family: ef.family,
        slotType: 'engine',
        tier,
        minLevel,
        baseRarity: tier >= 7 ? 'Epic' : tier >= 4 ? 'Rare' : 'Common',
        baseSpeedBonus: Math.round(ef.speedBonus * scale),
        scrapValue: Math.round(110 * scale),
        dismantleYield: {
          oreType,
          oreAmount: 7 * tier,
          fragments: 2 * tier,
        },
        descriptionKey: `item.${ef.family}.${tier}.desc`,
      });
    }
  }

  // 5. MODULES (20 distinct modules)
  const moduleNames = [
    'auto_repair', 'radar_range', 'loot_magnet', 'smoke_amplifier', 'targeting_aid',
    'emergency_shield', 'camo_net', 'fuel_saver', 'ammo_drum', 'reinforced_tracks',
    'stabilizer', 'fire_extinguisher', 'overclocker', 'energy_absorber', 'blast_shield',
    'optics_suite', 'plating_hardener', 'salvage_arm', 'drone_beacon', 'stealth_jammer'
  ];

  for (let i = 0; i < moduleNames.length; i++) {
    const mod = moduleNames[i];
    const tier = (i % 4) + 1;
    items.push({
      id: `mod_${mod}`,
      nameKey: `module.${mod}.name`,
      family: 'module',
      slotType: 'module',
      tier,
      minLevel: tier * 15 - 10,
      baseRarity: tier >= 4 ? 'Epic' : tier >= 3 ? 'Rare' : 'Uncommon',
      scrapValue: 350 * tier,
      dismantleYield: {
        oreType: tier <= 2 ? 'copper' : 'titanium',
        oreAmount: 12 * tier,
        fragments: 5 * tier,
      },
      descriptionKey: `module.${mod}.desc`,
    });
  }

  // 6. DRONES (8 types x 5 tiers = 40 drones)
  const droneTypes = ['guardian', 'sentinel', 'repair_bot', 'recon', 'arc_drone', 'sapper', 'interceptor', 'aegis'];
  for (const dt of droneTypes) {
    for (let tier = 1; tier <= 5; tier++) {
      items.push({
        id: `drn_${dt}_t${tier}`,
        nameKey: `drone.${dt}.${tier}.name`,
        family: 'drone',
        slotType: 'drone',
        tier,
        minLevel: tier * 18 - 14,
        baseRarity: tier >= 4 ? 'Epic' : tier >= 2 ? 'Rare' : 'Uncommon',
        baseDPS: 40 * tier,
        baseHullBonus: 200 * tier,
        scrapValue: 500 * tier,
        dismantleYield: {
          oreType: tier <= 2 ? 'copper' : tier <= 4 ? 'titanium' : 'crystal',
          oreAmount: 15 * tier,
          fragments: 8 * tier,
        },
        descriptionKey: `drone.${dt}.${tier}.desc`,
      });
    }
  }

  return items;
}

export const ITEM_CATALOG: ItemDefinition[] = generateAllItems();
export const ITEM_BY_ID = new Map<string, ItemDefinition>(
  ITEM_CATALOG.map(i => [i.id, i])
);

export function generateCraftingRecipes(): CraftingRecipe[] {
  return ITEM_CATALOG.slice(0, 80).map(item => ({
    id: `recipe_${item.id}`,
    outputItemId: item.id,
    minLevel: item.minLevel,
    costScrap: item.scrapValue * 2,
    costOre: {
      [item.dismantleYield.oreType]: item.dismantleYield.oreAmount * 3,
    },
    costFragments: item.dismantleYield.fragments * 2,
  }));
}

export const CRAFTING_RECIPES: CraftingRecipe[] = generateCraftingRecipes();
