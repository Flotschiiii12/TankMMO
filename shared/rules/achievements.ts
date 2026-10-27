/**
 * Achievement engine: counters in `character.stats` are bumped by game events; `checkAchievements` compares progress with
 * the data table (shared/data/achievements.ts), grants rewards once and records titles. Also the codex (what was met).
 */
import { ACHIEVEMENTS_CATALOG } from '../data/achievements.ts';
import { getRankForHonor } from '../data/ranks.ts';
import { VEHICLE_CATALOG } from '../data/vehicles.ts';
import { ITEM_BY_ID } from '../data/items.ts';
import { arenaLeagueIndexForGold } from './arenaLink.ts';
import { getEarnedTalentPoints } from './progression.ts';
import { CharacterState, masteryLevel } from './character.ts';

export type StatKey =
  | 'kills' | 'crit_strikes' | 'bosses' | 'world_bosses' | 'portal_jumps' | 'crates' | 'mining_nodes' | 'landmarks' | 'gates_cleared'
  | 'upgrades' | 'dismantled' | 'crafted' | 'fusions' | 'rerolls' | 'scrap_earned' | 'market_sales' | 'pvp_kills' | 'cp_caps' | 'arena_wins' | 'flank_kills';

/** Which counter / derived value feeds each achievement. */
const SOURCE: Record<string, StatKey | ((ch: CharacterState) => number)> = {
  ach_first_blood: 'kills', ach_kills_50: 'kills', ach_kills_250: 'kills', ach_kills_1000: 'kills', ach_kills_5000: 'kills',
  ach_crit_strikes_100: 'crit_strikes', ach_flank_master: 'flank_kills', ach_boss_slayer_1: 'bosses', ach_boss_slayer_10: 'bosses', ach_world_boss_conqueror: 'world_bosses',
  ach_reach_level_10: (c) => c.level, ach_reach_level_25: (c) => c.level, ach_reach_level_50: (c) => c.level, ach_reach_level_75: (c) => c.level, ach_reach_level_100: (c) => c.level,
  ach_talent_points_10: (c) => Object.values(c.talentRanks).reduce((a, b) => a + b, 0), ach_talent_points_50: (c) => Object.values(c.talentRanks).reduce((a, b) => a + b, 0),
  ach_garage_fleet_3: (c) => c.garage.length, ach_garage_fleet_8: (c) => c.garage.length,
  ach_mastery_rank_10: (c) => Math.max(0, ...c.garage.map((g) => masteryLevel(g.masteryXp))),
  ach_maps_visited_5: (c) => c.visitedMaps.length, ach_maps_visited_15: (c) => c.visitedMaps.length, ach_maps_visited_30: (c) => c.visitedMaps.length,
  ach_portal_jumps_25: 'portal_jumps', ach_crates_collected_100: 'crates', ach_landmarks_discovered_10: 'landmarks', ach_mining_nodes_50: 'mining_nodes', ach_gates_cleared_6: 'gates_cleared',
  ach_upgrade_item_5: (c) => Math.max(0, ...c.inventory.map((i) => i.upgrade)), ach_upgrade_item_10: (c) => Math.max(0, ...c.inventory.map((i) => i.upgrade)), ach_upgrade_item_15: (c) => Math.max(0, ...c.inventory.map((i) => i.upgrade)),
  ach_items_dismantled_50: 'dismantled', ach_items_crafted_10: 'crafted', ach_fusion_success_5: 'fusions', ach_reroll_affix_10: 'rerolls',
  ach_legendary_equipped: (c) => (c.inventory.some((i) => i.rarity === 'Legendary') ? 1 : 0),
  ach_scrap_earned_10k: 'scrap_earned', ach_scrap_earned_100k: 'scrap_earned', ach_scrap_earned_1m: 'scrap_earned',
  ach_market_sales_5: 'market_sales', ach_market_sales_25: 'market_sales',
  ach_ore_stockpile_500: (c) => Math.max(c.wallet.ore.iron, c.wallet.ore.copper, c.wallet.ore.titanium, c.wallet.ore.crystal),
  ach_reputation_level_7: (c) => Math.floor(Math.max(0, ...Object.values(c.reputation)) / 1000),
  ach_pvp_kills_1: 'pvp_kills', ach_pvp_kills_25: 'pvp_kills', ach_pvp_kills_100: 'pvp_kills',
  ach_honor_rank_captain: (c) => getRankForHonor(c.wallet.honor).level, ach_honor_rank_general: (c) => getRankForHonor(c.wallet.honor).level,
  ach_control_point_caps_10: 'cp_caps', ach_arena_wins_10: 'arena_wins', ach_arena_gold_league: (c) => arenaLeagueIndexForGold(c),
};

export function bump(ch: CharacterState, stat: StatKey, n = 1): void {
  ch.stats[stat] = (ch.stats[stat] ?? 0) + n;
}

export function progressOf(ch: CharacterState, id: string): number {
  const src = SOURCE[id];
  if (!src) return 0;
  return typeof src === 'function' ? src(ch) : ch.stats[src] ?? 0;
}

/** Grants every newly completed achievement (reward once) and returns their ids. */
export function checkAchievements(ch: CharacterState): string[] {
  const done: string[] = [];
  for (const a of ACHIEVEMENTS_CATALOG) {
    if (ch.achievements.includes(a.id)) continue;
    if (progressOf(ch, a.id) < a.targetValue) continue;
    ch.achievements.push(a.id);
    ch.wallet.scrap += a.rewardScrap;
    ch.wallet.seasonMarks += a.rewardSeasonMarks;
    if (a.rewardTitle && !ch.season.titles.includes(a.rewardTitle)) ch.season.titles.push(a.rewardTitle);
    done.push(a.id);
  }
  return done;
}

// ---------------------------------------------------------------------------
// Codex: entries unlock when something is met; counts are shown against the full catalogue sizes.
// ---------------------------------------------------------------------------

export type CodexKind = 'enemy' | 'item' | 'map' | 'vehicle';

export function codexAdd(ch: CharacterState, kind: CodexKind, id: string): boolean {
  const list = (ch.codex[kind] ??= []);
  if (list.includes(id)) return false;
  list.push(id);
  return true;
}

export function codexProgress(ch: CharacterState): Record<CodexKind, { have: number; total: number }> {
  return {
    enemy: { have: ch.codex.enemy?.length ?? 0, total: 11 + 5 },
    item: { have: ch.codex.item?.length ?? 0, total: ITEM_BY_ID.size },
    map: { have: ch.codex.map?.length ?? 0, total: 30 },
    vehicle: { have: ch.codex.vehicle?.length ?? 0, total: VEHICLE_CATALOG.length },
  };
}

export const talentPointsEarned = getEarnedTalentPoints;
