/**
 * Treadfront - Achievements Catalog (Section 5)
 * 50+ Data-Driven Achievements Across 6 Categories:
 * - Combat & Kills
 * - Progression & Leveling
 * - Exploration & Maps
 * - Crafting & Workshop
 * - Economy & Trading
 * - PvP & Faction War
 */

export type AchievementCategory =
  | 'combat'
  | 'progression'
  | 'exploration'
  | 'crafting'
  | 'economy'
  | 'pvp';

export interface AchievementDefinition {
  id: string;
  category: AchievementCategory;
  nameKey: string;
  descKey: string;
  targetValue: number;
  rewardScrap: number;
  rewardSeasonMarks: number;
  rewardTitle?: string;
  rewardBadge?: string;
}

export const ACHIEVEMENTS_CATALOG: AchievementDefinition[] = [
  // 1. COMBAT (10 Achievements)
  { id: 'ach_first_blood', category: 'combat', nameKey: 'ach.first_blood.name', descKey: 'ach.first_blood.desc', targetValue: 1, rewardScrap: 100, rewardSeasonMarks: 10 },
  { id: 'ach_kills_50', category: 'combat', nameKey: 'ach.kills_50.name', descKey: 'ach.kills_50.desc', targetValue: 50, rewardScrap: 500, rewardSeasonMarks: 25 },
  { id: 'ach_kills_250', category: 'combat', nameKey: 'ach.kills_250.name', descKey: 'ach.kills_250.desc', targetValue: 250, rewardScrap: 2000, rewardSeasonMarks: 50, rewardTitle: 'Eliminator' },
  { id: 'ach_kills_1000', category: 'combat', nameKey: 'ach.kills_1000.name', descKey: 'ach.kills_1000.desc', targetValue: 1000, rewardScrap: 10000, rewardSeasonMarks: 100, rewardTitle: 'Iron Reaper' },
  { id: 'ach_kills_5000', category: 'combat', nameKey: 'ach.kills_5000.name', descKey: 'ach.kills_5000.desc', targetValue: 5000, rewardScrap: 50000, rewardSeasonMarks: 250, rewardTitle: 'Armored Scourge' },
  { id: 'ach_crit_strikes_100', category: 'combat', nameKey: 'ach.crit_strikes_100.name', descKey: 'ach.crit_strikes_100.desc', targetValue: 100, rewardScrap: 800, rewardSeasonMarks: 30 },
  { id: 'ach_flank_master', category: 'combat', nameKey: 'ach.flank_master.name', descKey: 'ach.flank_master.desc', targetValue: 50, rewardScrap: 1200, rewardSeasonMarks: 40, rewardTitle: 'Flank Raider' },
  { id: 'ach_boss_slayer_1', category: 'combat', nameKey: 'ach.boss_slayer_1.name', descKey: 'ach.boss_slayer_1.desc', targetValue: 1, rewardScrap: 1500, rewardSeasonMarks: 50 },
  { id: 'ach_boss_slayer_10', category: 'combat', nameKey: 'ach.boss_slayer_10.name', descKey: 'ach.boss_slayer_10.desc', targetValue: 10, rewardScrap: 8000, rewardSeasonMarks: 120, rewardTitle: 'Goliath Bane' },
  { id: 'ach_world_boss_conqueror', category: 'combat', nameKey: 'ach.world_boss_conqueror.name', descKey: 'ach.world_boss_conqueror.desc', targetValue: 5, rewardScrap: 25000, rewardSeasonMarks: 200, rewardTitle: 'Titan Slayer' },

  // 2. PROGRESSION (10 Achievements)
  { id: 'ach_reach_level_10', category: 'progression', nameKey: 'ach.reach_level_10.name', descKey: 'ach.reach_level_10.desc', targetValue: 10, rewardScrap: 500, rewardSeasonMarks: 20 },
  { id: 'ach_reach_level_25', category: 'progression', nameKey: 'ach.reach_level_25.name', descKey: 'ach.reach_level_25.desc', targetValue: 25, rewardScrap: 2500, rewardSeasonMarks: 50 },
  { id: 'ach_reach_level_50', category: 'progression', nameKey: 'ach.reach_level_50.name', descKey: 'ach.reach_level_50.desc', targetValue: 50, rewardScrap: 10000, rewardSeasonMarks: 100, rewardTitle: 'Veteran Driver' },
  { id: 'ach_reach_level_75', category: 'progression', nameKey: 'ach.reach_level_75.name', descKey: 'ach.reach_level_75.desc', targetValue: 75, rewardScrap: 30000, rewardSeasonMarks: 200 },
  { id: 'ach_reach_level_100', category: 'progression', nameKey: 'ach.reach_level_100.name', descKey: 'ach.reach_level_100.desc', targetValue: 100, rewardScrap: 100000, rewardSeasonMarks: 500, rewardTitle: 'Apex Centurion' },
  { id: 'ach_talent_points_10', category: 'progression', nameKey: 'ach.talent_points_10.name', descKey: 'ach.talent_points_10.desc', targetValue: 10, rewardScrap: 800, rewardSeasonMarks: 25 },
  { id: 'ach_talent_points_50', category: 'progression', nameKey: 'ach.talent_points_50.name', descKey: 'ach.talent_points_50.desc', targetValue: 50, rewardScrap: 5000, rewardSeasonMarks: 75 },
  { id: 'ach_garage_fleet_3', category: 'progression', nameKey: 'ach.garage_fleet_3.name', descKey: 'ach.garage_fleet_3.desc', targetValue: 3, rewardScrap: 3000, rewardSeasonMarks: 40 },
  { id: 'ach_garage_fleet_8', category: 'progression', nameKey: 'ach.garage_fleet_8.name', descKey: 'ach.garage_fleet_8.desc', targetValue: 8, rewardScrap: 20000, rewardSeasonMarks: 150, rewardTitle: 'Hangar Marshal' },
  { id: 'ach_mastery_rank_10', category: 'progression', nameKey: 'ach.mastery_rank_10.name', descKey: 'ach.mastery_rank_10.desc', targetValue: 10, rewardScrap: 15000, rewardSeasonMarks: 120, rewardTitle: 'Tank Master' },

  // 3. EXPLORATION (8 Achievements)
  { id: 'ach_maps_visited_5', category: 'exploration', nameKey: 'ach.maps_visited_5.name', descKey: 'ach.maps_visited_5.desc', targetValue: 5, rewardScrap: 800, rewardSeasonMarks: 25 },
  { id: 'ach_maps_visited_15', category: 'exploration', nameKey: 'ach.maps_visited_15.name', descKey: 'ach.maps_visited_15.desc', targetValue: 15, rewardScrap: 3500, rewardSeasonMarks: 60 },
  { id: 'ach_maps_visited_30', category: 'exploration', nameKey: 'ach.maps_visited_30.name', descKey: 'ach.maps_visited_30.desc', targetValue: 30, rewardScrap: 20000, rewardSeasonMarks: 200, rewardTitle: 'Frontier Cartographer' },
  { id: 'ach_portal_jumps_25', category: 'exploration', nameKey: 'ach.portal_jumps_25.name', descKey: 'ach.portal_jumps_25.desc', targetValue: 25, rewardScrap: 1200, rewardSeasonMarks: 30 },
  { id: 'ach_crates_collected_100', category: 'exploration', nameKey: 'ach.crates_collected_100.name', descKey: 'ach.crates_collected_100.desc', targetValue: 100, rewardScrap: 2500, rewardSeasonMarks: 50 },
  { id: 'ach_landmarks_discovered_10', category: 'exploration', nameKey: 'ach.landmarks_discovered_10.name', descKey: 'ach.landmarks_discovered_10.desc', targetValue: 10, rewardScrap: 3000, rewardSeasonMarks: 60 },
  { id: 'ach_mining_nodes_50', category: 'exploration', nameKey: 'ach.mining_nodes_50.name', descKey: 'ach.mining_nodes_50.desc', targetValue: 50, rewardScrap: 2000, rewardSeasonMarks: 40 },
  { id: 'ach_gates_cleared_6', category: 'exploration', nameKey: 'ach.gates_cleared_6.name', descKey: 'ach.gates_cleared_6.desc', targetValue: 6, rewardScrap: 15000, rewardSeasonMarks: 150, rewardTitle: 'Dungeon Breaker' },

  // 4. CRAFTING & WORKSHOP (8 Achievements)
  { id: 'ach_upgrade_item_5', category: 'crafting', nameKey: 'ach.upgrade_item_5.name', descKey: 'ach.upgrade_item_5.desc', targetValue: 5, rewardScrap: 600, rewardSeasonMarks: 20 },
  { id: 'ach_upgrade_item_10', category: 'crafting', nameKey: 'ach.upgrade_item_10.name', descKey: 'ach.upgrade_item_10.desc', targetValue: 10, rewardScrap: 4000, rewardSeasonMarks: 60 },
  { id: 'ach_upgrade_item_15', category: 'crafting', nameKey: 'ach.upgrade_item_15.name', descKey: 'ach.upgrade_item_15.desc', targetValue: 15, rewardScrap: 25000, rewardSeasonMarks: 200, rewardTitle: 'Grand Machinist' },
  { id: 'ach_items_dismantled_50', category: 'crafting', nameKey: 'ach.items_dismantled_50.name', descKey: 'ach.items_dismantled_50.desc', targetValue: 50, rewardScrap: 1500, rewardSeasonMarks: 35 },
  { id: 'ach_items_crafted_10', category: 'crafting', nameKey: 'ach.items_crafted_10.name', descKey: 'ach.items_crafted_10.desc', targetValue: 10, rewardScrap: 2500, rewardSeasonMarks: 50 },
  { id: 'ach_fusion_success_5', category: 'crafting', nameKey: 'ach.fusion_success_5.name', descKey: 'ach.fusion_success_5.desc', targetValue: 5, rewardScrap: 3000, rewardSeasonMarks: 50 },
  { id: 'ach_reroll_affix_10', category: 'crafting', nameKey: 'ach.reroll_affix_10.name', descKey: 'ach.reroll_affix_10.desc', targetValue: 10, rewardScrap: 2000, rewardSeasonMarks: 40 },
  { id: 'ach_legendary_equipped', category: 'crafting', nameKey: 'ach.legendary_equipped.name', descKey: 'ach.legendary_equipped.desc', targetValue: 1, rewardScrap: 8000, rewardSeasonMarks: 100, rewardTitle: 'Golden Core' },

  // 5. ECONOMY & TRADING (7 Achievements)
  { id: 'ach_scrap_earned_10k', category: 'economy', nameKey: 'ach.scrap_earned_10k.name', descKey: 'ach.scrap_earned_10k.desc', targetValue: 10000, rewardScrap: 1000, rewardSeasonMarks: 20 },
  { id: 'ach_scrap_earned_100k', category: 'economy', nameKey: 'ach.scrap_earned_100k.name', descKey: 'ach.scrap_earned_100k.desc', targetValue: 100000, rewardScrap: 8000, rewardSeasonMarks: 75 },
  { id: 'ach_scrap_earned_1m', category: 'economy', nameKey: 'ach.scrap_earned_1m.name', descKey: 'ach.scrap_earned_1m.desc', targetValue: 1000000, rewardScrap: 50000, rewardSeasonMarks: 250, rewardTitle: 'Scrap Baron' },
  { id: 'ach_market_sales_5', category: 'economy', nameKey: 'ach.market_sales_5.name', descKey: 'ach.market_sales_5.desc', targetValue: 5, rewardScrap: 1500, rewardSeasonMarks: 30 },
  { id: 'ach_market_sales_25', category: 'economy', nameKey: 'ach.market_sales_25.name', descKey: 'ach.market_sales_25.desc', targetValue: 25, rewardScrap: 6000, rewardSeasonMarks: 70, rewardTitle: 'Merchant Prince' },
  { id: 'ach_ore_stockpile_500', category: 'economy', nameKey: 'ach.ore_stockpile_500.name', descKey: 'ach.ore_stockpile_500.desc', targetValue: 500, rewardScrap: 2500, rewardSeasonMarks: 45 },
  { id: 'ach_reputation_level_7', category: 'economy', nameKey: 'ach.reputation_level_7.name', descKey: 'ach.reputation_level_7.desc', targetValue: 7, rewardScrap: 10000, rewardSeasonMarks: 120, rewardTitle: 'Faction Honored' },

  // 6. PVP & FACTION WAR (8 Achievements)
  { id: 'ach_pvp_kills_1', category: 'pvp', nameKey: 'ach.pvp_kills_1.name', descKey: 'ach.pvp_kills_1.desc', targetValue: 1, rewardScrap: 500, rewardSeasonMarks: 20 },
  { id: 'ach_pvp_kills_25', category: 'pvp', nameKey: 'ach.pvp_kills_25.name', descKey: 'ach.pvp_kills_25.desc', targetValue: 25, rewardScrap: 3500, rewardSeasonMarks: 60, rewardTitle: 'Border Hunter' },
  { id: 'ach_pvp_kills_100', category: 'pvp', nameKey: 'ach.pvp_kills_100.name', descKey: 'ach.pvp_kills_100.desc', targetValue: 100, rewardScrap: 15000, rewardSeasonMarks: 150, rewardTitle: 'Warlord' },
  { id: 'ach_honor_rank_captain', category: 'pvp', nameKey: 'ach.honor_rank_captain.name', descKey: 'ach.honor_rank_captain.desc', targetValue: 10, rewardScrap: 8000, rewardSeasonMarks: 100 },
  { id: 'ach_honor_rank_general', category: 'pvp', nameKey: 'ach.honor_rank_general.name', descKey: 'ach.honor_rank_general.desc', targetValue: 17, rewardScrap: 30000, rewardSeasonMarks: 250 },
  { id: 'ach_control_point_caps_10', category: 'pvp', nameKey: 'ach.control_point_caps_10.name', descKey: 'ach.control_point_caps_10.desc', targetValue: 10, rewardScrap: 5000, rewardSeasonMarks: 80 },
  { id: 'ach_arena_wins_10', category: 'pvp', nameKey: 'ach.arena_wins_10.name', descKey: 'ach.arena_wins_10.desc', targetValue: 10, rewardScrap: 4000, rewardSeasonMarks: 60 },
  { id: 'ach_arena_gold_league', category: 'pvp', nameKey: 'ach.arena_gold_league.name', descKey: 'ach.arena_gold_league.desc', targetValue: 1, rewardScrap: 20000, rewardSeasonMarks: 180, rewardTitle: 'Gladiator Prime' },
];

export const ACHIEVEMENTS_BY_ID = new Map<string, AchievementDefinition>(
  ACHIEVEMENTS_CATALOG.map(a => [a.id, a])
);
