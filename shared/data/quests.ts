/**
 * Quest definitions (design doc section 7): story (10 chapters x 10), faction, daily pool (40), weekly pool (9),
 * bounty, explorer and clan quests. Generated from templates so the numbers stay consistent; all data, no logic.
 */
export type QuestKind = 'story' | 'faction' | 'daily' | 'weekly' | 'bounty' | 'explorer' | 'clan';

export type ObjectiveType =
  | 'kill' // kill N enemies (optionally of a kind / elite / boss)
  | 'collect_ore'
  | 'deliver' // hand in scrap
  | 'reach_map' // enter a map
  | 'defeat_boss'
  | 'clear_gate' // finish a dungeon (optionally a specific one)
  | 'win_arena'
  | 'craft'
  | 'upgrade'
  | 'explore' // find a secret/landmark
  | 'escort' // convoy escort completed
  | 'use_portal'
  | 'tutorial'; // first-time-user steps: drive, lock, fire, loot, garage, equip, levelup, portal

export interface QuestObjective {
  type: ObjectiveType;
  count: number;
  /** enemy kind, ore type, map id, dungeon id or secret id depending on the type */
  target?: string | number;
  elite?: boolean;
}

export interface QuestReward {
  xp: number;
  scrap: number;
  fragments?: number;
  gateKeys?: number;
  reputation?: number;
  seasonPoints?: number;
  itemRarity?: 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
}

export interface QuestDef {
  id: string;
  kind: QuestKind;
  nameKey: string;
  name: string;
  chapter?: number;
  minLevel: number;
  maxLevel?: number;
  prerequisites: string[];
  objectives: QuestObjective[];
  reward: QuestReward;
  repeatable?: boolean;
}

const rewardFor = (level: number, mult = 1): QuestReward => ({
  xp: Math.round((120 + level * 60) * mult * 0.5),
  scrap: Math.round((80 + level * 40) * mult),
});

// ---------------------------------------------------------------------------
// Story: 10 chapters, one per ~10 levels; each chapter ends with a boss or a gate
// ---------------------------------------------------------------------------

/** Guided first 15 minutes, driven by the quest framework. Steps are reported by the client via 'tutorial' events. */
export const TUTORIAL_STEPS = ['drive', 'lock', 'fire', 'loot', 'garage', 'equip', 'levelup', 'portal'] as const;

export const CHAPTERS: Array<{ chapter: number; name: string; minLevel: number; maps: number[]; enemy: string; finale: { type: 'defeat_boss' | 'clear_gate'; target: string | number } }> = [
  { chapter: 1, name: 'Gravel and Rust', minLevel: 1, maps: [1, 2, 3, 4], enemy: 'scout_buggy', finale: { type: 'defeat_boss', target: 'boss_cape_warden' } },
  { chapter: 2, name: 'The Crossing', minLevel: 11, maps: [14, 15], enemy: 'gunner_truck', finale: { type: 'clear_gate', target: 'gate_rusted_depot' } },
  { chapter: 3, name: 'Canyon Fire', minLevel: 21, maps: [16, 17], enemy: 'artillery', finale: { type: 'clear_gate', target: 'gate_quarry_hold' } },
  { chapter: 4, name: 'Frozen Front', minLevel: 31, maps: [17, 18], enemy: 'ice_tank', finale: { type: 'clear_gate', target: 'gate_frozen_foundry' } },
  { chapter: 5, name: 'The Old Highway', minLevel: 41, maps: [19, 20], enemy: 'swamp_crawler', finale: { type: 'defeat_boss', target: 'boss_highway_behemoth' } },
  { chapter: 6, name: 'Borderlands', minLevel: 51, maps: [21, 22, 23], enemy: 'gunner_truck', finale: { type: 'clear_gate', target: 'gate_glowworm_sump' } },
  { chapter: 7, name: 'Ruins of Vaelmar', minLevel: 61, maps: [25], enemy: 'flak_wagon', finale: { type: 'defeat_boss', target: 'boss_storm_coast_leviathan' } },
  { chapter: 8, name: 'Obsidian Sands', minLevel: 71, maps: [26, 27], enemy: 'sandstorm_raider', finale: { type: 'defeat_boss', target: 'boss_storm_coast_leviathan' } },
  { chapter: 9, name: 'Iron Crown', minLevel: 81, maps: [28], enemy: 'lava_truck', finale: { type: 'clear_gate', target: 'gate_iron_crown_vault' } },
  { chapter: 10, name: 'The Burning Valley', minLevel: 91, maps: [29], enemy: 'lava_truck', finale: { type: 'clear_gate', target: 'gate_iron_crown_vault' } },
];

function buildStory(): QuestDef[] {
  const out: QuestDef[] = [];
  for (const c of CHAPTERS) {
    const lvl = (i: number) => c.minLevel + Math.floor((i / 10) * 9);
    const mk = (i: number, name: string, objectives: QuestObjective[], mult = 1): QuestDef => ({
      id: `story_c${c.chapter}_q${i}`,
      kind: 'story',
      nameKey: `quest.story.c${c.chapter}.q${i}`,
      name,
      chapter: c.chapter,
      minLevel: lvl(i - 1),
      prerequisites: i === 1 ? (c.chapter === 1 ? [`tut_${TUTORIAL_STEPS.length}_${TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1]}`] : [`story_c${c.chapter - 1}_q10`]) : [`story_c${c.chapter}_q${i - 1}`],
      objectives,
      reward: rewardFor(lvl(i - 1), mult),
    });
    const m0 = c.maps[0];
    const mLast = c.maps[c.maps.length - 1];
    out.push(
      mk(1, `${c.name}: Arrival`, [{ type: 'reach_map', count: 1, target: m0 }]),
      mk(2, `${c.name}: First Contact`, [{ type: 'kill', count: 8, target: c.enemy }]),
      mk(3, `${c.name}: Salvage`, [{ type: 'collect_ore', count: 30 }]),
      mk(4, `${c.name}: Scouting`, [{ type: 'explore', count: 1 }]),
      mk(5, `${c.name}: Clear the Road`, [{ type: 'kill', count: 15, target: c.enemy }], 1.2),
      mk(6, `${c.name}: Better Gear`, [{ type: 'craft', count: 1 }, { type: 'upgrade', count: 3 }]),
      mk(7, `${c.name}: Elite Hunt`, [{ type: 'kill', count: 1, elite: true }], 1.4),
      mk(8, `${c.name}: Deeper In`, [{ type: 'reach_map', count: 1, target: mLast }, { type: 'kill', count: 12, target: c.enemy }], 1.3),
      mk(9, `${c.name}: Supplies`, [{ type: 'deliver', count: 200 + c.chapter * 150 }, { type: 'escort', count: 1 }], 1.3),
      mk(10, `${c.name}: Finale`, [{ type: c.finale.type, count: 1, target: c.finale.target }], 3),
    );
    out[out.length - 1].reward.gateKeys = 1;
    out[out.length - 1].reward.itemRarity = c.chapter >= 6 ? 'Epic' : 'Rare';
  }
  return out;
}

// ---------------------------------------------------------------------------
// Daily pool (40) and weekly pool (9)
// ---------------------------------------------------------------------------

const DAILY_KILL_TARGETS = ['scout_buggy', 'gunner_truck', 'artillery', 'bunker_turret', 'flak_wagon', 'engineer', 'loot_convoy', 'ice_tank', 'swamp_crawler', 'lava_truck', 'sandstorm_raider'];

function buildDailyPool(): QuestDef[] {
  const pool: QuestDef[] = [];
  const add = (key: string, name: string, objectives: QuestObjective[], mult = 1) =>
    pool.push({ id: `daily_${key}`, kind: 'daily', nameKey: `quest.daily.${key}`, name, minLevel: 1, prerequisites: [], objectives, reward: { ...rewardFor(1, mult), seasonPoints: 10 }, repeatable: true });
  DAILY_KILL_TARGETS.forEach((t) => add(`kill_${t}`, `Hunt: ${t.replace('_', ' ')}`, [{ type: 'kill', count: 12, target: t }]));
  DAILY_KILL_TARGETS.slice(0, 7).forEach((t) => add(`kill_many_${t}`, `Sweep: ${t.replace('_', ' ')}`, [{ type: 'kill', count: 30, target: t }], 1.6));
  (['iron', 'copper', 'titanium', 'crystal'] as const).forEach((o) => add(`ore_${o}`, `Mine ${o}`, [{ type: 'collect_ore', count: 40, target: o }]));
  add('any_kill_50', 'Cleanup crew', [{ type: 'kill', count: 50 }], 1.8);
  add('elite_2', 'Two elites', [{ type: 'kill', count: 2, elite: true }], 1.5);
  add('elite_5', 'Elite sweep', [{ type: 'kill', count: 5, elite: true }], 2.2);
  add('boss_1', 'Take down a boss', [{ type: 'defeat_boss', count: 1 }], 2.5);
  add('gate_1', 'Clear a gate', [{ type: 'clear_gate', count: 1 }], 2.5);
  add('craft_1', 'Workshop work', [{ type: 'craft', count: 1 }]);
  add('upgrade_3', 'Tune it up', [{ type: 'upgrade', count: 3 }]);
  add('upgrade_6', 'Heavy tuning', [{ type: 'upgrade', count: 6 }], 1.5);
  add('portal_3', 'Portal hopper', [{ type: 'use_portal', count: 3 }]);
  add('escort_1', 'Convoy escort', [{ type: 'escort', count: 1 }], 1.4);
  add('deliver_scrap', 'Supply drop', [{ type: 'deliver', count: 500 }]);
  add('arena_1', 'Arena debut', [{ type: 'win_arena', count: 1 }], 1.6);
  add('explore_1', 'Explorer', [{ type: 'explore', count: 1 }]);
  add('mixed_a', 'Patrol duty', [{ type: 'kill', count: 20 }, { type: 'collect_ore', count: 20 }], 1.4);
  add('mixed_b', 'Frontline', [{ type: 'kill', count: 10, elite: false }, { type: 'use_portal', count: 2 }], 1.2);
  add('ore_any_80', 'Big haul', [{ type: 'collect_ore', count: 80 }], 1.5);
  add('elite_1', 'One elite', [{ type: 'kill', count: 1, elite: true }]);
  add('mixed_c', 'Salvage run', [{ type: 'collect_ore', count: 30 }, { type: 'craft', count: 1 }], 1.4);
  return pool;
}

function buildWeeklyPool(): QuestDef[] {
  const pool: QuestDef[] = [];
  const add = (key: string, name: string, objectives: QuestObjective[]) =>
    pool.push({ id: `weekly_${key}`, kind: 'weekly', nameKey: `quest.weekly.${key}`, name, minLevel: 1, prerequisites: [], objectives, reward: { ...rewardFor(1, 8), seasonPoints: 60, gateKeys: 1, itemRarity: 'Rare' }, repeatable: true });
  add('slayer', 'Weekly slayer', [{ type: 'kill', count: 300 }]);
  add('elite_hunter', 'Elite hunter', [{ type: 'kill', count: 25, elite: true }]);
  add('miner', 'Weekly miner', [{ type: 'collect_ore', count: 400 }]);
  add('dungeon_runner', 'Dungeon runner', [{ type: 'clear_gate', count: 5 }]);
  add('boss_breaker', 'Boss breaker', [{ type: 'defeat_boss', count: 5 }]);
  add('smith', 'Master smith', [{ type: 'upgrade', count: 25 }, { type: 'craft', count: 5 }]);
  add('arena_climber', 'Arena climber', [{ type: 'win_arena', count: 5 }]);
  add('globetrotter', 'Globetrotter', [{ type: 'use_portal', count: 25 }]);
  add('convoy_guard', 'Convoy guard', [{ type: 'escort', count: 5 }]);
  return pool;
}

export const BOUNTY_TARGETS = [
  { id: 'bounty_rust_baron', name: 'Rust Baron', kind: 'gunner_truck', level: 12 },
  { id: 'bounty_dust_widow', name: 'Dust Widow', kind: 'scout_buggy', level: 20 },
  { id: 'bounty_iron_hound', name: 'Iron Hound', kind: 'artillery', level: 30 },
  { id: 'bounty_frost_wraith', name: 'Frost Wraith', kind: 'ice_tank', level: 40 },
  { id: 'bounty_mire_king', name: 'Mire King', kind: 'swamp_crawler', level: 50 },
  { id: 'bounty_ash_reaper', name: 'Ash Reaper', kind: 'lava_truck', level: 70 },
];

function buildBounties(): QuestDef[] {
  return BOUNTY_TARGETS.map((b) => ({
    id: b.id, kind: 'bounty' as const, nameKey: `quest.bounty.${b.id}`, name: `Bounty: ${b.name}`, minLevel: Math.max(1, b.level - 5), maxLevel: b.level + 15, prerequisites: [],
    objectives: [{ type: 'kill' as const, count: 1, target: b.kind, elite: true }], reward: { ...rewardFor(b.level, 3), reputation: 50, itemRarity: 'Rare' as const }, repeatable: true,
  }));
}

function buildExplorer(): QuestDef[] {
  return [1, 3, 6, 9, 14, 16, 19, 21, 25, 27].map((mapId) => ({
    id: `explore_map_${mapId}`, kind: 'explorer' as const, nameKey: `quest.explorer.map_${mapId}`, name: `Explorer: map ${mapId}`, minLevel: 1, prerequisites: [],
    objectives: [{ type: 'explore' as const, count: 2, target: mapId }], reward: { ...rewardFor(mapId * 3, 2), fragments: 20 },
  }));
}

function buildFaction(): QuestDef[] {
  return ['coastal', 'highland', 'steppe'].flatMap((f) =>
    [1, 2, 3].map((i) => ({
      id: `faction_${f}_${i}`, kind: 'faction' as const, nameKey: `quest.faction.${f}.${i}`, name: `${f} union duty ${i}`, minLevel: 1 + (i - 1) * 8, prerequisites: i === 1 ? [] : [`faction_${f}_${i - 1}`],
      objectives: [{ type: 'kill' as const, count: 10 * i }, { type: 'collect_ore' as const, count: 15 * i }], reward: { ...rewardFor(i * 8, 1.5), reputation: 100 * i },
    }))
  );
}

function buildClan(): QuestDef[] {
  return [
    { id: 'clan_hunt', name: 'Clan hunt', objectives: [{ type: 'kill' as const, count: 1000 }] },
    { id: 'clan_mine', name: 'Clan mining', objectives: [{ type: 'collect_ore' as const, count: 2000 }] },
    { id: 'clan_gates', name: 'Clan gates', objectives: [{ type: 'clear_gate' as const, count: 20 }] },
  ].map((q) => ({ ...q, kind: 'clan' as const, nameKey: `quest.${q.id}`, minLevel: 1, prerequisites: [], reward: { ...rewardFor(20, 6), seasonPoints: 40 }, repeatable: true }));
}

function buildTutorial(): QuestDef[] {
  return TUTORIAL_STEPS.map((step, i) => ({
    id: `tut_${i + 1}_${step}`, kind: 'story' as const, nameKey: `quest.tutorial.${step}`, name: `Tutorial: ${step}`, chapter: 0, minLevel: 1,
    prerequisites: i === 0 ? [] : [`tut_${i}_${TUTORIAL_STEPS[i - 1]}`],
    objectives: [{ type: 'tutorial' as const, count: 1, target: step }],
    reward: { xp: i === TUTORIAL_STEPS.length - 1 ? 400 : 60, scrap: 100 },
  }));
}

export const TUTORIAL_QUESTS = buildTutorial();
export const STORY_QUESTS = [...TUTORIAL_QUESTS, ...buildStory()];
export const DAILY_POOL = buildDailyPool();
export const WEEKLY_POOL = buildWeeklyPool();
export const BOUNTY_QUESTS = buildBounties();
export const EXPLORER_QUESTS = buildExplorer();
export const FACTION_QUESTS = buildFaction();
export const CLAN_QUESTS = buildClan();

export const ALL_QUESTS: QuestDef[] = [...STORY_QUESTS, ...DAILY_POOL, ...WEEKLY_POOL, ...BOUNTY_QUESTS, ...EXPLORER_QUESTS, ...FACTION_QUESTS, ...CLAN_QUESTS];
export const QUEST_BY_ID = new Map(ALL_QUESTS.map((q) => [q.id, q]));

export const DAILY_QUEST_COUNT = 5;
export const WEEKLY_QUEST_COUNT = 3;
