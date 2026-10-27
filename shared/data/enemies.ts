/**
 * Treadfront - Enemy Archetypes and Boss Data Tables (Section 7)
 * Defines regular archetypes, elites, mini bosses, world bosses, and dungeon bosses.
 */

import { EntityKind } from '../types.ts';

export interface EnemyArchetype {
  id: string;
  kind: EntityKind;
  displayName: string;
  nameKey: string;
  baseHull: number;
  baseArmor: number;
  maxSpeed: number;
  turnRate: number;
  turretTurnRate: number;
  reloadTime: number;
  baseDamage: number;
  radius: number;
  aggroRange: number;
  leashRange: number;
  attackRange: number;
  fleeAtHpPercent?: number;
  dropsScrapMultiplier: number;
  dropsOreChance: number;
  descriptionKey: string;
}

export const ENEMY_ARCHETYPES: Record<string, EnemyArchetype> = {
  scout_buggy: {
    id: 'scout_buggy',
    kind: 'scout_buggy',
    displayName: 'Scout Buggy',
    nameKey: 'enemy.scout_buggy.name',
    baseHull: 600,
    baseArmor: 350,
    maxSpeed: 240,
    turnRate: 3.2,
    turretTurnRate: 4.0,
    reloadTime: 1.2,
    baseDamage: 85,
    radius: 20,
    aggroRange: 550,
    leashRange: 800,
    attackRange: 420,
    fleeAtHpPercent: 0.20,
    dropsScrapMultiplier: 1.0,
    dropsOreChance: 0.25,
    descriptionKey: 'enemy.scout_buggy.desc',
  },
  gunner_truck: {
    id: 'gunner_truck',
    kind: 'gunner_truck',
    displayName: 'Gunner Truck',
    nameKey: 'enemy.gunner_truck.name',
    baseHull: 1100,
    baseArmor: 700,
    maxSpeed: 175,
    turnRate: 2.2,
    turretTurnRate: 2.8,
    reloadTime: 1.6,
    baseDamage: 160,
    radius: 26,
    aggroRange: 600,
    leashRange: 900,
    attackRange: 500,
    dropsScrapMultiplier: 1.4,
    dropsOreChance: 0.40,
    descriptionKey: 'enemy.gunner_truck.desc',
  },
  artillery: {
    id: 'artillery',
    kind: 'artillery',
    displayName: 'Siege Artillery',
    nameKey: 'enemy.artillery.name',
    baseHull: 800,
    baseArmor: 450,
    maxSpeed: 110,
    turnRate: 1.4,
    turretTurnRate: 1.6,
    reloadTime: 3.8,
    baseDamage: 480,
    radius: 30,
    aggroRange: 900,
    leashRange: 1200,
    attackRange: 920,
    dropsScrapMultiplier: 2.0,
    dropsOreChance: 0.60,
    descriptionKey: 'enemy.artillery.desc',
  },
  bunker_turret: {
    id: 'bunker_turret',
    kind: 'bunker_turret',
    displayName: 'Bunker Fortress',
    nameKey: 'enemy.bunker_turret.name',
    baseHull: 3200,
    baseArmor: 2200,
    maxSpeed: 0,
    turnRate: 0,
    turretTurnRate: 2.0,
    reloadTime: 1.8,
    baseDamage: 280,
    radius: 40,
    aggroRange: 750,
    leashRange: 800,
    attackRange: 720,
    dropsScrapMultiplier: 3.5,
    dropsOreChance: 0.85,
    descriptionKey: 'enemy.bunker_turret.desc',
  },
  flak_wagon: {
    id: 'flak_wagon',
    kind: 'gunner_truck',
    displayName: 'Flak Wagon',
    nameKey: 'enemy.flak_wagon.name',
    baseHull: 1400,
    baseArmor: 900,
    maxSpeed: 160,
    turnRate: 2.0,
    turretTurnRate: 3.4,
    reloadTime: 0.8,
    baseDamage: 95,
    radius: 28,
    aggroRange: 620,
    leashRange: 950,
    attackRange: 520,
    dropsScrapMultiplier: 1.6,
    dropsOreChance: 0.45,
    descriptionKey: 'enemy.flak_wagon.desc',
  },
  engineer: {
    id: 'engineer',
    kind: 'scout_buggy',
    displayName: 'Combat Engineer',
    nameKey: 'enemy.engineer.name',
    baseHull: 950,
    baseArmor: 600,
    maxSpeed: 190,
    turnRate: 2.6,
    turretTurnRate: 2.8,
    reloadTime: 2.0,
    baseDamage: 120,
    radius: 22,
    aggroRange: 600,
    leashRange: 850,
    attackRange: 450,
    fleeAtHpPercent: 0.35,
    dropsScrapMultiplier: 1.8,
    dropsOreChance: 0.50,
    descriptionKey: 'enemy.engineer.desc',
  },
  loot_convoy: {
    id: 'loot_convoy',
    kind: 'loot_convoy',
    displayName: 'Heavy Cargo Convoy',
    nameKey: 'enemy.loot_convoy.name',
    baseHull: 4500,
    baseArmor: 3000,
    maxSpeed: 95,
    turnRate: 1.2,
    turretTurnRate: 1.5,
    reloadTime: 2.5,
    baseDamage: 140,
    radius: 38,
    aggroRange: 400,
    leashRange: 600,
    attackRange: 350,
    dropsScrapMultiplier: 8.0,
    dropsOreChance: 1.0,
    descriptionKey: 'enemy.loot_convoy.desc',
  },

  // Biome specialists
  ice_tank: {
    id: 'ice_tank',
    kind: 'gunner_truck',
    displayName: 'Frost Glider',
    nameKey: 'enemy.ice_tank.name',
    baseHull: 1600,
    baseArmor: 1100,
    maxSpeed: 190,
    turnRate: 2.4,
    turretTurnRate: 2.6,
    reloadTime: 1.7,
    baseDamage: 190,
    radius: 28,
    aggroRange: 650,
    leashRange: 900,
    attackRange: 550,
    dropsScrapMultiplier: 1.8,
    dropsOreChance: 0.55,
    descriptionKey: 'enemy.ice_tank.desc',
  },
  swamp_crawler: {
    id: 'swamp_crawler',
    kind: 'gunner_truck',
    displayName: 'Muck Crawler',
    nameKey: 'enemy.swamp_crawler.name',
    baseHull: 1800,
    baseArmor: 1300,
    maxSpeed: 150,
    turnRate: 1.9,
    turretTurnRate: 2.2,
    reloadTime: 2.0,
    baseDamage: 220,
    radius: 30,
    aggroRange: 600,
    leashRange: 850,
    attackRange: 500,
    dropsScrapMultiplier: 2.0,
    dropsOreChance: 0.60,
    descriptionKey: 'enemy.swamp_crawler.desc',
  },
  lava_truck: {
    id: 'lava_truck',
    kind: 'gunner_truck',
    displayName: 'Pyre Smasher',
    nameKey: 'enemy.lava_truck.name',
    baseHull: 2100,
    baseArmor: 1500,
    maxSpeed: 160,
    turnRate: 1.8,
    turretTurnRate: 2.4,
    reloadTime: 1.5,
    baseDamage: 260,
    radius: 32,
    aggroRange: 650,
    leashRange: 900,
    attackRange: 520,
    dropsScrapMultiplier: 2.4,
    dropsOreChance: 0.70,
    descriptionKey: 'enemy.lava_truck.desc',
  },
  sandstorm_raider: {
    id: 'sandstorm_raider',
    kind: 'scout_buggy',
    displayName: 'Dune Skimmer',
    nameKey: 'enemy.sandstorm_raider.name',
    baseHull: 900,
    baseArmor: 550,
    maxSpeed: 250,
    turnRate: 3.4,
    turretTurnRate: 4.2,
    reloadTime: 1.0,
    baseDamage: 110,
    radius: 22,
    aggroRange: 620,
    leashRange: 900,
    attackRange: 450,
    dropsScrapMultiplier: 1.6,
    dropsOreChance: 0.40,
    descriptionKey: 'enemy.sandstorm_raider.desc',
  },
};

export interface BossDefinition {
  id: string;
  name: string;
  nameKey: string;
  type: 'mini_boss' | 'world_boss' | 'gate_boss';
  mapId: string;
  level: number;
  baseHull: number;
  baseArmor: number;
  maxSpeed: number;
  damage: number;
  reloadTime: number;
  radius: number;
  phases: number;
  mechanics: string[];
  respawnMinutes: number;
  guaranteedDrops: {
    rareCount: number;
    oreType: 'iron' | 'copper' | 'titanium' | 'crystal';
    oreAmount: number;
  };
}

export const BOSS_CATALOG: BossDefinition[] = [
  // Mini Bosses
  {
    id: 'boss_cape_warden',
    name: 'Cape Solitude Iron Warden',
    nameKey: 'boss.cape_warden.name',
    type: 'mini_boss',
    mapId: 'lighthouse_cape',
    level: 15,
    baseHull: 18000,
    baseArmor: 12000,
    maxSpeed: 105,
    damage: 420,
    reloadTime: 2.2,
    radius: 48,
    phases: 2,
    mechanics: ['summon_scouts', 'artillery_telegraph'],
    respawnMinutes: 10,
    guaranteedDrops: { rareCount: 1, oreType: 'iron', oreAmount: 40 },
  },
  {
    id: 'boss_eagle_colossus',
    name: 'Eagle Pass Sky Breaker',
    nameKey: 'boss.eagle_colossus.name',
    type: 'mini_boss',
    mapId: 'eagle_pass',
    level: 15,
    baseHull: 19500,
    baseArmor: 13500,
    maxSpeed: 100,
    damage: 460,
    reloadTime: 2.4,
    radius: 50,
    phases: 2,
    mechanics: ['smoke_screen', 'emp_shockwave'],
    respawnMinutes: 10,
    guaranteedDrops: { rareCount: 1, oreType: 'iron', oreAmount: 45 },
  },
  {
    id: 'boss_windmill_goliath',
    name: 'Steppe Windmill Overlord',
    nameKey: 'boss.windmill_goliath.name',
    type: 'mini_boss',
    mapId: 'windmill_plateau',
    level: 15,
    baseHull: 20000,
    baseArmor: 14000,
    maxSpeed: 95,
    damage: 480,
    reloadTime: 2.5,
    radius: 52,
    phases: 2,
    mechanics: ['summon_escorts', 'flame_wave'],
    respawnMinutes: 10,
    guaranteedDrops: { rareCount: 1, oreType: 'iron', oreAmount: 50 },
  },

  // World Bosses (2h rotation)
  {
    id: 'boss_highway_behemoth',
    name: 'Highway Juggernaut Rex',
    nameKey: 'boss.highway_behemoth.name',
    type: 'world_boss',
    mapId: 'old_highway',
    level: 42,
    baseHull: 145000,
    baseArmor: 98000,
    maxSpeed: 85,
    damage: 1200,
    reloadTime: 2.8,
    radius: 70,
    phases: 3,
    mechanics: ['quad_cannon', 'carpet_bombing', 'enrage_fury'],
    respawnMinutes: 120,
    guaranteedDrops: { rareCount: 3, oreType: 'copper', oreAmount: 250 },
  },
  {
    id: 'boss_storm_coast_leviathan',
    name: 'Storm Coast Dreadnought',
    nameKey: 'boss.storm_coast_leviathan.name',
    type: 'world_boss',
    mapId: 'storm_coast',
    level: 80,
    baseHull: 480000,
    baseArmor: 320000,
    maxSpeed: 90,
    damage: 2600,
    reloadTime: 3.2,
    radius: 85,
    phases: 3,
    mechanics: ['lightning_strike', 'armor_overcharge', 'orbital_lance'],
    respawnMinutes: 120,
    guaranteedDrops: { rareCount: 5, oreType: 'titanium', oreAmount: 600 },
  },
];
