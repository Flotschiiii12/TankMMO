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
  /** Gate tuning (scripts/balance-bosses.ts): extra hull / damage multiplier on the wave enemies, on top of the party-size hull table. */
  waveHull?: number;
  waveDmg?: number;
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
    waveHull: 0.89, waveDmg: 0.97,
    boss: { name: 'Depot Warden', nameKey: 'gate.rusted_depot.boss', baseHull: 87273, baseArmor: 56105, damage: 25, reloadTime: 2.2, maxSpeed: 90, radius: 46 },
    rewards: { scrap: 3000, xp: 4000, rareDrops: 1, oreType: 'iron', oreAmount: 30 }, firstClearBonus: { scrap: 3000, xp: 4000, keys: 1 },
  },
  {
    id: 'gate_quarry_hold', nameKey: 'gate.quarry_hold.name', name: 'Quarry Hold', unlockMapId: 8, minLevel: 10, recommendedLevel: 14, timeLimitSeconds: 900,
    waves: [w(['gunner_truck', 3]), w(['scout_buggy', 5], ['flak_wagon', 1]), w(['artillery', 2], ['gunner_truck', 2]), w(['bunker_turret', 2], ['gunner_truck', 3]), w(['flak_wagon', 2], ['artillery', 2], ['scout_buggy', 3])],
    waveHull: 0.88, waveDmg: 0.53,
    boss: { name: 'Quarry Crusher', nameKey: 'gate.quarry_hold.boss', baseHull: 93526, baseArmor: 64299, damage: 25, reloadTime: 2.3, maxSpeed: 85, radius: 48 },
    rewards: { scrap: 3400, xp: 4500, rareDrops: 1, oreType: 'copper', oreAmount: 30 }, firstClearBonus: { scrap: 3400, xp: 4500, keys: 1 },
  },
  {
    id: 'gate_windmill_bastion', nameKey: 'gate.windmill_bastion.name', name: 'Windmill Bastion', unlockMapId: 12, minLevel: 10, recommendedLevel: 15, timeLimitSeconds: 900,
    waves: [w(['scout_buggy', 6]), w(['gunner_truck', 4], ['engineer', 1]), w(['artillery', 2], ['bunker_turret', 2]), w(['sandstorm_raider', 4], ['gunner_truck', 2]), w(['flak_wagon', 2], ['artillery', 3], ['engineer', 2])],
    waveHull: 0.72, waveDmg: 0.45,
    boss: { name: 'Bastion Overlord', nameKey: 'gate.windmill_bastion.boss', baseHull: 95843, baseArmor: 66558, damage: 25, reloadTime: 2.4, maxSpeed: 95, radius: 50 },
    rewards: { scrap: 3800, xp: 5000, rareDrops: 1, oreType: 'iron', oreAmount: 40 }, firstClearBonus: { scrap: 3800, xp: 5000, keys: 1 },
  },
  {
    id: 'gate_frozen_foundry', nameKey: 'gate.frozen_foundry.name', name: 'Frozen Foundry', unlockMapId: 18, minLevel: 30, recommendedLevel: 34, timeLimitSeconds: 900,
    waves: [w(['ice_tank', 4]), w(['ice_tank', 3], ['artillery', 2]), w(['bunker_turret', 3], ['ice_tank', 3]), w(['flak_wagon', 3], ['ice_tank', 4]), w(['artillery', 4], ['ice_tank', 4], ['engineer', 2])],
    waveHull: 0.61, waveDmg: 0.36,
    boss: { name: 'Foundry Colossus', nameKey: 'gate.frozen_foundry.boss', baseHull: 276776, baseArmor: 193744, damage: 67, reloadTime: 2.2, maxSpeed: 90, radius: 56 },
    rewards: { scrap: 14000, xp: 9500, rareDrops: 2, oreType: 'titanium', oreAmount: 35 }, firstClearBonus: { scrap: 14000, xp: 9500, keys: 1 },
  },
  {
    id: 'gate_glowworm_sump', nameKey: 'gate.glowworm_sump.name', name: 'Glowworm Sump', unlockMapId: 20, minLevel: 38, recommendedLevel: 42, timeLimitSeconds: 900,
    waves: [w(['swamp_crawler', 5]), w(['swamp_crawler', 4], ['artillery', 2]), w(['bunker_turret', 3], ['swamp_crawler', 4]), w(['flak_wagon', 3], ['swamp_crawler', 5]), w(['artillery', 4], ['swamp_crawler', 5], ['engineer', 3])],
    waveHull: 0.46, waveDmg: 0.29,
    boss: { name: 'Sump Matriarch', nameKey: 'gate.glowworm_sump.boss', baseHull: 407186, baseArmor: 278079, damage: 102, reloadTime: 2.1, maxSpeed: 100, radius: 58 },
    rewards: { scrap: 20000, xp: 11500, rareDrops: 2, oreType: 'crystal', oreAmount: 30 }, firstClearBonus: { scrap: 20000, xp: 11500, keys: 1 },
  },
  {
    id: 'gate_iron_crown_vault', nameKey: 'gate.iron_crown_vault.name', name: 'Iron Crown Vault', unlockMapId: 28, minLevel: 80, recommendedLevel: 86, timeLimitSeconds: 900,
    waves: [w(['lava_truck', 5]), w(['lava_truck', 4], ['artillery', 3]), w(['bunker_turret', 4], ['lava_truck', 4]), w(['flak_wagon', 4], ['lava_truck', 5]), w(['artillery', 5], ['lava_truck', 5], ['engineer', 3])],
    waveHull: 0.50, waveDmg: 0.23,
    boss: { name: 'Vault Sovereign', nameKey: 'gate.iron_crown_vault.boss', baseHull: 2577203, baseArmor: 1804041, damage: 651, reloadTime: 2.0, maxSpeed: 105, radius: 64 },
    rewards: { scrap: 70000, xp: 21000, rareDrops: 3, oreType: 'crystal', oreAmount: 80 }, firstClearBonus: { scrap: 70000, xp: 21000, keys: 2 },
  },
];

export function getDungeon(id: string): DungeonDef | undefined {
  return DUNGEONS.find((d) => d.id === id);
}
