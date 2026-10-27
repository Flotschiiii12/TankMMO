/**
 * Gates: instanced dungeons (design doc section 7). Party size 1-5, 15 minute timer, 3 free keys per day.
 * Waves are data; the wave director lives in shared/sim/dungeon.ts.
 */
import { EntityKind } from '../types.ts';

export interface DungeonWave {
  enemies: Array<{ type: EntityKind | string; count: number }>;
}

export interface DungeonBossDef {
  name: string;
  nameKey: string;
  baseHull: number;
  baseArmor: number;
  damage: number;
  reloadTime: number;
  maxSpeed: number;
  radius: number;
}

export interface DungeonDef {
  id: string;
  nameKey: string;
  name: string;
  unlockMapId: number; // map whose gate leads here
  minLevel: number;
  recommendedLevel: number;
  timeLimitSeconds: number;
  waves: DungeonWave[];
  boss: DungeonBossDef;
  rewards: { scrap: number; xp: number; rareDrops: number; oreType: 'iron' | 'copper' | 'titanium' | 'crystal'; oreAmount: number };
  firstClearBonus: { scrap: number; xp: number; keys: number };
}

export const DUNGEON_PARTY_MIN = 1;
export const DUNGEON_PARTY_MAX = 5;
export const DUNGEON_FREE_KEYS_PER_DAY = 3;
/** Enemy hull multiplier by party size (1 = solo). */
export const DUNGEON_HULL_BY_PARTY = [1, 1, 1.7, 2.4, 3.1, 3.8];

const w = (...e: Array<[string, number]>): DungeonWave => ({ enemies: e.map(([type, count]) => ({ type, count })) });

export const DUNGEONS: DungeonDef[] = [
  {
    id: 'gate_rusted_depot', nameKey: 'gate.rusted_depot.name', name: 'Rusted Depot', unlockMapId: 4, minLevel: 10, recommendedLevel: 12, timeLimitSeconds: 900,
    waves: [w(['scout_buggy', 4]), w(['scout_buggy', 3], ['gunner_truck', 2]), w(['gunner_truck', 3], ['bunker_turret', 1]), w(['scout_buggy', 4], ['gunner_truck', 3]), w(['gunner_truck', 4], ['artillery', 1])],
    boss: { name: 'Depot Warden', nameKey: 'gate.rusted_depot.boss', baseHull: 14000, baseArmor: 9000, damage: 300, reloadTime: 2.2, maxSpeed: 90, radius: 46 },
    rewards: { scrap: 3000, xp: 4000, rareDrops: 1, oreType: 'iron', oreAmount: 30 }, firstClearBonus: { scrap: 3000, xp: 4000, keys: 1 },
  },
  {
    id: 'gate_quarry_hold', nameKey: 'gate.quarry_hold.name', name: 'Quarry Hold', unlockMapId: 8, minLevel: 10, recommendedLevel: 14, timeLimitSeconds: 900,
    waves: [w(['gunner_truck', 3]), w(['scout_buggy', 5], ['flak_wagon', 1]), w(['artillery', 2], ['gunner_truck', 2]), w(['bunker_turret', 2], ['gunner_truck', 3]), w(['flak_wagon', 2], ['artillery', 2], ['scout_buggy', 3])],
    boss: { name: 'Quarry Crusher', nameKey: 'gate.quarry_hold.boss', baseHull: 16000, baseArmor: 11000, damage: 340, reloadTime: 2.3, maxSpeed: 85, radius: 48 },
    rewards: { scrap: 3400, xp: 4500, rareDrops: 1, oreType: 'copper', oreAmount: 30 }, firstClearBonus: { scrap: 3400, xp: 4500, keys: 1 },
  },
  {
    id: 'gate_windmill_bastion', nameKey: 'gate.windmill_bastion.name', name: 'Windmill Bastion', unlockMapId: 12, minLevel: 10, recommendedLevel: 15, timeLimitSeconds: 900,
    waves: [w(['scout_buggy', 6]), w(['gunner_truck', 4], ['engineer', 1]), w(['artillery', 2], ['bunker_turret', 2]), w(['sandstorm_raider', 4], ['gunner_truck', 2]), w(['flak_wagon', 2], ['artillery', 3], ['engineer', 2])],
    boss: { name: 'Bastion Overlord', nameKey: 'gate.windmill_bastion.boss', baseHull: 18000, baseArmor: 12500, damage: 380, reloadTime: 2.4, maxSpeed: 95, radius: 50 },
    rewards: { scrap: 3800, xp: 5000, rareDrops: 1, oreType: 'iron', oreAmount: 40 }, firstClearBonus: { scrap: 3800, xp: 5000, keys: 1 },
  },
  {
    id: 'gate_frozen_foundry', nameKey: 'gate.frozen_foundry.name', name: 'Frozen Foundry', unlockMapId: 18, minLevel: 30, recommendedLevel: 34, timeLimitSeconds: 900,
    waves: [w(['ice_tank', 4]), w(['ice_tank', 3], ['artillery', 2]), w(['bunker_turret', 3], ['ice_tank', 3]), w(['flak_wagon', 3], ['ice_tank', 4]), w(['artillery', 4], ['ice_tank', 4], ['engineer', 2])],
    boss: { name: 'Foundry Colossus', nameKey: 'gate.frozen_foundry.boss', baseHull: 60000, baseArmor: 42000, damage: 900, reloadTime: 2.2, maxSpeed: 90, radius: 56 },
    rewards: { scrap: 14000, xp: 18000, rareDrops: 2, oreType: 'titanium', oreAmount: 35 }, firstClearBonus: { scrap: 14000, xp: 18000, keys: 1 },
  },
  {
    id: 'gate_glowworm_sump', nameKey: 'gate.glowworm_sump.name', name: 'Glowworm Sump', unlockMapId: 20, minLevel: 38, recommendedLevel: 42, timeLimitSeconds: 900,
    waves: [w(['swamp_crawler', 5]), w(['swamp_crawler', 4], ['artillery', 2]), w(['bunker_turret', 3], ['swamp_crawler', 4]), w(['flak_wagon', 3], ['swamp_crawler', 5]), w(['artillery', 4], ['swamp_crawler', 5], ['engineer', 3])],
    boss: { name: 'Sump Matriarch', nameKey: 'gate.glowworm_sump.boss', baseHull: 82000, baseArmor: 56000, damage: 1100, reloadTime: 2.1, maxSpeed: 100, radius: 58 },
    rewards: { scrap: 20000, xp: 26000, rareDrops: 2, oreType: 'crystal', oreAmount: 30 }, firstClearBonus: { scrap: 20000, xp: 26000, keys: 1 },
  },
  {
    id: 'gate_iron_crown_vault', nameKey: 'gate.iron_crown_vault.name', name: 'Iron Crown Vault', unlockMapId: 28, minLevel: 80, recommendedLevel: 86, timeLimitSeconds: 900,
    waves: [w(['lava_truck', 5]), w(['lava_truck', 4], ['artillery', 3]), w(['bunker_turret', 4], ['lava_truck', 4]), w(['flak_wagon', 4], ['lava_truck', 5]), w(['artillery', 5], ['lava_truck', 5], ['engineer', 3])],
    boss: { name: 'Vault Sovereign', nameKey: 'gate.iron_crown_vault.boss', baseHull: 400000, baseArmor: 280000, damage: 3200, reloadTime: 2.0, maxSpeed: 105, radius: 64 },
    rewards: { scrap: 150000, xp: 220000, rareDrops: 3, oreType: 'crystal', oreAmount: 80 }, firstClearBonus: { scrap: 150000, xp: 220000, keys: 2 },
  },
];

export function getDungeon(id: string): DungeonDef | undefined {
  return DUNGEONS.find((d) => d.id === id);
}
