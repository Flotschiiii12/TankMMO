/**
 * Quest framework: objectives, auto-completion by game events, daily/weekly rotation, rewards, and the
 * free season pass. Pure rules over CharacterState (see character.ts); no clock access: callers pass server seconds.
 */
import {
  ALL_QUESTS, DAILY_POOL, TUTORIAL_QUESTS, DAILY_QUEST_COUNT, QUEST_BY_ID, QuestDef, QuestObjective, QuestReward, WEEKLY_POOL, WEEKLY_QUEST_COUNT,
} from '../data/quests.ts';
import { SEASON_DAILY_POINT_CAP, SEASON_LENGTH_SECONDS, SEASON_POINTS_PER_TIER, SEASON_REWARDS, SEASON_TIERS } from '../data/season.ts';
import { SimRNG } from '../prng.ts';
import { CharacterState, createItem, grantXP, Result } from './character.ts';

export interface ActiveQuest {
  id: string;
  progress: number[];
  /** objective counts scaled to the player's level at accept time (repeatables) */
  targets: number[];
  levelAtAccept: number;
  ready: boolean; // all objectives met, waiting to be claimed
}

export interface QuestLog {
  active: Record<string, ActiveQuest>;
  completed: string[];
  dailyKey: string;
  dailyIds: string[];
  weeklyKey: string;
  weeklyIds: string[];
  bountyId?: string;
}

export interface SeasonState {
  seasonId: number;
  points: number;
  claimed: number[];
  dayKey: string;
  pointsToday: number;
  skins: string[];
  titles: string[];
}

export type QuestEvent =
  | { type: 'kill'; kind: string; level: number; isElite?: boolean; isBoss?: boolean }
  | { type: 'collect_ore'; ore: string; amount: number }
  | { type: 'deliver'; amount: number }
  | { type: 'reach_map'; mapId: number }
  | { type: 'use_portal'; mapId: number }
  | { type: 'defeat_boss'; bossId: string }
  | { type: 'clear_gate'; dungeonId: string }
  | { type: 'win_arena' }
  | { type: 'craft' }
  | { type: 'upgrade' }
  | { type: 'explore'; mapId: number; spotId?: string }
  | { type: 'escort' }
  | { type: 'tutorial'; step: string };

export const createQuestLog = (): QuestLog => ({ active: {}, completed: [], dailyKey: '', dailyIds: [], weeklyKey: '', weeklyIds: [] });
export const createSeasonState = (): SeasonState => ({ seasonId: 0, points: 0, claimed: [], dayKey: '', pointsToday: 0, skins: [], titles: [] });

export const dayKey = (clockSeconds: number): string => `d${Math.floor(clockSeconds / 86400)}`;
/** Weeks start on Monday (epoch day 0 was a Thursday). */
export const weekKey = (clockSeconds: number): string => `w${Math.floor((Math.floor(clockSeconds / 86400) + 3) / 7)}`;
export const seasonIdFor = (clockSeconds: number): number => Math.floor(clockSeconds / SEASON_LENGTH_SECONDS) + 1;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Counts grow with level so quests stay meaningful: x1 at level 1, about x3 at level 100. */
export function levelScale(level: number): number {
  return 1 + Math.min(2, level / 50);
}

export function scaledReward(def: QuestDef, level: number): QuestReward {
  if (!def.repeatable) return def.reward;
  const k = (120 + level * 60) / 180;
  return { ...def.reward, xp: Math.round(def.reward.xp * k), scrap: Math.round(def.reward.scrap * k) };
}

function pickDeterministic(pool: QuestDef[], n: number, seed: number, level: number): QuestDef[] {
  const rng = new SimRNG(seed);
  const eligible = pool.filter((q) => q.minLevel <= level);
  const out: QuestDef[] = [];
  const bag = [...eligible];
  while (out.length < n && bag.length > 0) out.push(bag.splice(rng.rangeInt(0, bag.length - 1), 1)[0]);
  return out;
}

function makeActive(def: QuestDef, level: number): ActiveQuest {
  const scale = def.repeatable ? levelScale(level) : 1;
  return {
    id: def.id,
    progress: def.objectives.map(() => 0),
    targets: def.objectives.map((o) => (def.repeatable && o.type !== 'tutorial' ? Math.max(1, Math.round(o.count * scale)) : o.count)),
    levelAtAccept: level,
    ready: false,
  };
}

/** The guided first steps start by themselves: keeps exactly the next tutorial quest active. */
export function ensureTutorial(ch: CharacterState): string | undefined {
  const next = TUTORIAL_QUESTS.find((q) => !ch.quests.completed.includes(q.id));
  if (!next) return undefined;
  if (!ch.quests.active[next.id] && next.prerequisites.every((p) => ch.quests.completed.includes(p))) ch.quests.active[next.id] = makeActive(next, ch.level);
  return next.id;
}

/** Call whenever the server clock may have crossed a day/week boundary (login, tick). Rotates daily and weekly quests. */
export function refreshQuests(ch: CharacterState, clockSeconds: number): { dailyChanged: boolean; weeklyChanged: boolean } {
  const log = ch.quests;
  const dk = dayKey(clockSeconds);
  const wk = weekKey(clockSeconds);
  let dailyChanged = false;
  let weeklyChanged = false;
  if (log.dailyKey !== dk) {
    for (const id of log.dailyIds) delete log.active[id];
    const picks = pickDeterministic(DAILY_POOL, DAILY_QUEST_COUNT, hashString(`${dk}:${ch.name}`), ch.level);
    log.dailyIds = picks.map((q) => q.id);
    for (const q of picks) log.active[q.id] = makeActive(q, ch.level);
    log.dailyKey = dk;
    dailyChanged = true;
  }
  if (log.weeklyKey !== wk) {
    for (const id of log.weeklyIds) delete log.active[id];
    const picks = pickDeterministic(WEEKLY_POOL, WEEKLY_QUEST_COUNT, hashString(`${wk}:${ch.name}`), ch.level);
    log.weeklyIds = picks.map((q) => q.id);
    for (const q of picks) log.active[q.id] = makeActive(q, ch.level);
    log.weeklyKey = wk;
    weeklyChanged = true;
  }
  const before = Object.keys(log.active).length;
  ensureTutorial(ch);
  return { dailyChanged: dailyChanged || Object.keys(log.active).length !== before, weeklyChanged };
}

export function questAvailable(ch: CharacterState, def: QuestDef): boolean {
  if (ch.quests.active[def.id]) return false;
  if (!def.repeatable && ch.quests.completed.includes(def.id)) return false;
  if (ch.level < def.minLevel || (def.maxLevel !== undefined && ch.level > def.maxLevel)) return false;
  return def.prerequisites.every((p) => ch.quests.completed.includes(p));
}

/** Quests the player may accept right now (story chain, explorer, faction, bounties; dailies/weeklies are auto-assigned). */
export function availableQuests(ch: CharacterState): QuestDef[] {
  return ALL_QUESTS.filter((q) => q.kind !== 'daily' && q.kind !== 'weekly' && q.kind !== 'clan' && questAvailable(ch, q));
}

export function acceptQuest(ch: CharacterState, id: string): Result {
  const def = QUEST_BY_ID.get(id);
  if (!def) return { ok: false, error: 'unknown_quest' };
  if (def.kind === 'daily' || def.kind === 'weekly') return { ok: false, error: 'auto_assigned' };
  if (!questAvailable(ch, def)) return { ok: false, error: 'not_available' };
  if (def.kind === 'bounty') {
    if (ch.quests.bountyId && ch.quests.active[ch.quests.bountyId]) return { ok: false, error: 'bounty_active' };
    ch.quests.bountyId = id;
  }
  ch.quests.active[id] = makeActive(def, ch.level);
  return { ok: true };
}

export function abandonQuest(ch: CharacterState, id: string): Result {
  const def = QUEST_BY_ID.get(id);
  if (!def || !ch.quests.active[id]) return { ok: false, error: 'not_active' };
  if (def.kind === 'daily' || def.kind === 'weekly') return { ok: false, error: 'cannot_abandon' };
  delete ch.quests.active[id];
  return { ok: true };
}

function matches(o: QuestObjective, ev: QuestEvent): number {
  switch (ev.type) {
    case 'kill':
      if (o.type !== 'kill') return 0;
      if (o.elite && !ev.isElite) return 0;
      if (o.target !== undefined && o.target !== ev.kind) return 0;
      return 1;
    case 'collect_ore': return o.type === 'collect_ore' && (o.target === undefined || o.target === ev.ore) ? ev.amount : 0;
    case 'deliver': return o.type === 'deliver' ? ev.amount : 0;
    case 'reach_map': return o.type === 'reach_map' && o.target === ev.mapId ? 1 : 0;
    case 'use_portal': return o.type === 'use_portal' ? 1 : 0;
    case 'defeat_boss': return o.type === 'defeat_boss' && (o.target === undefined || o.target === ev.bossId) ? 1 : 0;
    case 'clear_gate': return o.type === 'clear_gate' && (o.target === undefined || o.target === ev.dungeonId) ? 1 : 0;
    case 'win_arena': return o.type === 'win_arena' ? 1 : 0;
    case 'craft': return o.type === 'craft' ? 1 : 0;
    case 'upgrade': return o.type === 'upgrade' ? 1 : 0;
    case 'explore': return o.type === 'explore' && (o.target === undefined || o.target === ev.mapId) ? 1 : 0;
    case 'escort': return o.type === 'escort' ? 1 : 0;
    case 'tutorial': return o.type === 'tutorial' && o.target === ev.step ? 1 : 0;
  }
}

/** Feeds a game event to all active quests. Returns the ids of quests that just became ready to claim. */
export function onQuestEvent(ch: CharacterState, ev: QuestEvent): string[] {
  const readyNow: string[] = [];
  for (const aq of Object.values(ch.quests.active)) {
    if (aq.ready) continue;
    const def = QUEST_BY_ID.get(aq.id);
    if (!def) continue;
    def.objectives.forEach((o, i) => {
      const add = matches(o, ev);
      if (add > 0) aq.progress[i] = Math.min(aq.targets[i], aq.progress[i] + add);
    });
    if (aq.progress.every((p, i) => p >= aq.targets[i])) {
      aq.ready = true;
      readyNow.push(aq.id);
    }
  }
  return readyNow;
}

/** Hand in scrap for 'deliver' objectives (scrap leaves the wallet). */
export function deliverScrap(ch: CharacterState, amount: number): Result<{ ready: string[] }> {
  const n = Math.floor(amount);
  if (n <= 0 || ch.wallet.scrap < n) return { ok: false, error: 'not_enough_scrap' };
  ch.wallet.scrap -= n;
  return { ok: true, ready: onQuestEvent(ch, { type: 'deliver', amount: n }) };
}

export function claimQuest(ch: CharacterState, id: string, rng: SimRNG, clockSeconds: number): Result<{ reward: QuestReward; levelsGained: number }> {
  const aq = ch.quests.active[id];
  const def = QUEST_BY_ID.get(id);
  if (!aq || !def) return { ok: false, error: 'not_active' };
  if (!aq.ready) return { ok: false, error: 'not_complete' };
  const reward = scaledReward(def, aq.levelAtAccept);
  const { levelsGained } = grantXP(ch, reward.xp);
  ch.wallet.scrap += reward.scrap;
  ch.wallet.fragments += reward.fragments ?? 0;
  ch.wallet.gateKeys += reward.gateKeys ?? 0;
  if (reward.reputation) ch.reputation[def.nameKey.split('.')[2] ?? 'general'] = (ch.reputation[def.nameKey.split('.')[2] ?? 'general'] ?? 0) + reward.reputation;
  if (reward.seasonPoints) addSeasonPoints(ch, reward.seasonPoints, clockSeconds);
  if (reward.itemRarity) {
    const tier = Math.max(1, Math.min(8, Math.ceil(ch.level / 12)));
    const candidates = ['wpn_cannon', 'arm_composite_armor', 'eng_torque_engine'].map((p) => `${p}_t${tier}`);
    createItem(ch, candidates[rng.rangeInt(0, candidates.length - 1)], reward.itemRarity, rng);
  }
  delete ch.quests.active[id];
  if (def.repeatable) {
    // dailies/weeklies stay "claimed" until the next rotation: remember them so they are not re-offered
    if (!ch.quests.completed.includes(id) && def.kind !== 'daily' && def.kind !== 'weekly') ch.quests.completed.push(id);
    if (def.kind === 'daily' || def.kind === 'weekly') ch.quests.completed.push(`${id}@${def.kind === 'daily' ? ch.quests.dailyKey : ch.quests.weeklyKey}`);
  } else ch.quests.completed.push(id);
  if (ch.quests.bountyId === id) ch.quests.bountyId = undefined;
  ensureTutorial(ch);
  return { ok: true, reward, levelsGained };
}

// ---------------------------------------------------------------------------
// Season pass (free track)
// ---------------------------------------------------------------------------

function rolloverSeason(ch: CharacterState, clockSeconds: number): void {
  const id = seasonIdFor(clockSeconds);
  if (ch.season.seasonId !== id) ch.season = { ...createSeasonState(), seasonId: id, skins: ch.season.skins, titles: ch.season.titles };
}

/** Adds season points, respecting the daily cap. Returns the points actually added. */
export function addSeasonPoints(ch: CharacterState, points: number, clockSeconds: number): number {
  rolloverSeason(ch, clockSeconds);
  const dk = dayKey(clockSeconds);
  if (ch.season.dayKey !== dk) { ch.season.dayKey = dk; ch.season.pointsToday = 0; }
  const add = Math.max(0, Math.min(points, SEASON_DAILY_POINT_CAP - ch.season.pointsToday));
  ch.season.pointsToday += add;
  ch.season.points += add;
  return add;
}

export function seasonTier(ch: CharacterState): number {
  return Math.min(SEASON_TIERS, Math.floor(ch.season.points / SEASON_POINTS_PER_TIER));
}

export function claimSeasonTier(ch: CharacterState, tier: number, clockSeconds: number): Result {
  rolloverSeason(ch, clockSeconds);
  if (tier < 1 || tier > SEASON_TIERS) return { ok: false, error: 'bad_tier' };
  if (tier > seasonTier(ch)) return { ok: false, error: 'tier_not_reached' };
  if (ch.season.claimed.includes(tier)) return { ok: false, error: 'already_claimed' };
  const r = SEASON_REWARDS[tier - 1];
  ch.wallet.scrap += r.scrap ?? 0;
  ch.wallet.fragments += r.fragments ?? 0;
  ch.wallet.ore.iron += r.ore ?? 0;
  ch.wallet.seasonMarks += r.seasonMarks ?? 0;
  ch.wallet.gateKeys += r.gateKeys ?? 0;
  if (r.skin) ch.season.skins.push(r.skin);
  if (r.title) ch.season.titles.push(r.title);
  ch.season.claimed.push(tier);
  return { ok: true };
}
