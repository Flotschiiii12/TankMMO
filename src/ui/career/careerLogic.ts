/** Pure logic of the career screens: talent graph and states, achievements, codex, season pass, tracked quest. */
import * as C from '../../../shared/rules/character.ts';
import * as Q from '../../../shared/rules/quests.ts';
import { TALENTS_CATALOG, TALENT_BY_ID, type TalentBranch, type TalentDefinition } from '../../../shared/data/talents.ts';
import { ACHIEVEMENTS_CATALOG, type AchievementCategory } from '../../../shared/data/achievements.ts';
import { progressOf } from '../../../shared/rules/achievements.ts';
import { ENEMY_ARCHETYPES, BOSS_CATALOG } from '../../../shared/data/enemies.ts';
import { ITEM_CATALOG } from '../../../shared/data/items.ts';
import { MAP_METADATA_TABLE } from '../../../shared/data/maps.ts';
import { VEHICLE_CATALOG } from '../../../shared/data/vehicles.ts';
import { SEASON_LENGTH_SECONDS, SEASON_POINTS_PER_TIER, SEASON_REWARDS, SEASON_TIERS, type SeasonReward } from '../../../shared/data/season.ts';

// ---------------------------------------------------------------- talents
export const BRANCHES: readonly TalentBranch[] = ['offense', 'defense', 'logistics'];
export type TalentState = 'maxed' | 'available' | 'ranked' | 'locked';
export interface TalentNode { def: TalentDefinition; rank: number; state: TalentState; reason?: string; x: number; y: number }
export interface TalentGraph { branch: TalentBranch; nodes: TalentNode[]; edges: Array<{ from: string; to: string; active: boolean }>; width: number; height: number }

export const NODE_W = 150; export const NODE_H = 64; const GAP_X = 14; const GAP_Y = 34;
/** Talent state: `maxed`, `available` (a point would be accepted now), `ranked` (has ranks, cannot rank now) or `locked`. `reason` is the server's error code. */
export function talentState(ch: C.CharacterState, def: TalentDefinition): { state: TalentState; reason?: string } {
  const rank = ch.talentRanks[def.id] ?? 0;
  if (rank >= def.maxRank) return { state: 'maxed' };
  const can = C.canRankTalent(ch, def.id);
  if (can.ok) return { state: 'available' };
  return { state: rank > 0 ? 'ranked' : 'locked', reason: can.error };
}
/** Tiers become rows, talents of one tier sit side by side; edges go from a prerequisite to the talent that needs it. */
export function talentGraph(ch: C.CharacterState, branch: TalentBranch): TalentGraph {
  const defs = TALENTS_CATALOG.filter((t) => t.branch === branch).sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
  const byTier = new Map<number, TalentDefinition[]>(); for (const d of defs) byTier.set(d.tier, [...(byTier.get(d.tier) ?? []), d]);
  const tiers = [...byTier.keys()].sort((a, b) => a - b); const maxCols = Math.max(...[...byTier.values()].map((v) => v.length));
  const width = maxCols * NODE_W + (maxCols - 1) * GAP_X;
  const nodes: TalentNode[] = [];
  tiers.forEach((tier, row) => {
    const list = byTier.get(tier)!; const rowW = list.length * NODE_W + (list.length - 1) * GAP_X;
    list.forEach((def, i) => { const st = talentState(ch, def); nodes.push({ def, rank: ch.talentRanks[def.id] ?? 0, ...st, x: (width - rowW) / 2 + i * (NODE_W + GAP_X), y: row * (NODE_H + GAP_Y) }); });
  });
  const edges = nodes.flatMap((n) => (n.def.prerequisites ?? []).filter((p) => TALENT_BY_ID.has(p)).map((p) => ({ from: p, to: n.def.id, active: (ch.talentRanks[p] ?? 0) >= 1 })));
  return { branch, nodes, edges, width, height: tiers.length * NODE_H + (tiers.length - 1) * GAP_Y };
}
export const talentPointsSummary = (ch: C.CharacterState) => ({ available: C.talentPointsAvailable(ch), spent: Object.values(ch.talentRanks).reduce((a, b) => a + b, 0) });

// ---------------------------------------------------------------- achievements
export interface AchievementRow { id: string; category: AchievementCategory; nameKey: string; descKey: string; progress: number; target: number; done: boolean; pct: number }
export function achievementRows(ch: C.CharacterState): AchievementRow[] {
  return ACHIEVEMENTS_CATALOG.map((a) => { const done = ch.achievements.includes(a.id); const progress = done ? a.targetValue : Math.min(a.targetValue, progressOf(ch, a.id)); return { id: a.id, category: a.category, nameKey: a.nameKey, descKey: a.descKey, progress, target: a.targetValue, done, pct: a.targetValue > 0 ? progress / a.targetValue : 0 }; });
}
export function filterAchievements(rows: AchievementRow[], category: AchievementCategory | 'all', status: 'all' | 'done' | 'open'): AchievementRow[] {
  return rows.filter((r) => (category === 'all' || r.category === category) && (status === 'all' || (status === 'done') === r.done)).sort((a, b) => Number(a.done) - Number(b.done) || b.pct - a.pct);
}

// ---------------------------------------------------------------- codex
export type CodexKind = 'enemy' | 'item' | 'map' | 'vehicle';
export interface CodexEntry { id: string; nameKey?: string; name: string; known: boolean; rarity?: string }
export function codexEntries(ch: C.CharacterState, kind: CodexKind): CodexEntry[] {
  const have = new Set(ch.codex[kind] ?? []);
  switch (kind) {
    case 'enemy': return [...Object.values(ENEMY_ARCHETYPES).map((e) => ({ id: e.id, nameKey: e.nameKey, name: e.displayName })), ...BOSS_CATALOG.map((b) => ({ id: b.id, nameKey: b.nameKey, name: b.name }))].map((e) => ({ ...e, known: have.has(e.id) }));
    case 'item': return ITEM_CATALOG.map((i) => ({ id: i.id, nameKey: i.nameKey, name: i.id, rarity: i.baseRarity, known: have.has(i.id) }));
    case 'map': return Object.values(MAP_METADATA_TABLE).map((m) => ({ id: String(m.id), nameKey: m.nameKey, name: m.name, known: have.has(String(m.id)) }));
    case 'vehicle': return VEHICLE_CATALOG.map((v) => ({ id: v.id, nameKey: v.nameKey, name: v.id, known: have.has(v.id) }));
  }
}
export const codexSummary = (ch: C.CharacterState, kind: CodexKind): { have: number; total: number } => { const e = codexEntries(ch, kind); return { have: e.filter((x) => x.known).length, total: e.length }; };

// ---------------------------------------------------------------- season pass
export interface SeasonInfo { tier: number; pointsInTier: number; pointsPerTier: number; secondsLeft: number; claimable: number[]; nextReward?: SeasonReward; maxed: boolean }
export function seasonSecondsLeft(seasonId: number, nowSeconds: number): number {
  const id = seasonId > 0 ? seasonId : Q.seasonIdFor(nowSeconds);
  return Math.max(0, id * SEASON_LENGTH_SECONDS - nowSeconds);
}
export function seasonInfo(ch: C.CharacterState, nowSeconds: number): SeasonInfo {
  const tier = Q.seasonTier(ch); const maxed = tier >= SEASON_TIERS;
  return { tier, pointsInTier: maxed ? SEASON_POINTS_PER_TIER : ch.season.points % SEASON_POINTS_PER_TIER, pointsPerTier: SEASON_POINTS_PER_TIER, secondsLeft: seasonSecondsLeft(ch.season.seasonId, nowSeconds),
    claimable: SEASON_REWARDS.filter((r) => r.tier <= tier && !ch.season.claimed.includes(r.tier)).map((r) => r.tier), nextReward: SEASON_REWARDS.find((r) => r.tier === tier + 1), maxed };
}
export type TierState = 'claimed' | 'claimable' | 'locked';
export const tierState = (ch: C.CharacterState, r: SeasonReward): TierState => (ch.season.claimed.includes(r.tier) ? 'claimed' : r.tier <= Q.seasonTier(ch) ? 'claimable' : 'locked');
export function rewardParts(r: SeasonReward): Array<{ kind: string; amount?: number; text?: string }> {
  return [r.scrap && { kind: 'scrap', amount: r.scrap }, r.fragments && { kind: 'fragments', amount: r.fragments }, r.ore && { kind: 'ore', amount: r.ore }, r.seasonMarks && { kind: 'season', amount: r.seasonMarks }, r.gateKeys && { kind: 'gate_key', amount: r.gateKeys }, r.skin && { kind: 'skin', text: r.skin }, r.title && { kind: 'title', text: r.title }].filter(Boolean) as Array<{ kind: string; amount?: number; text?: string }>;
}
export function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400); const h = Math.floor((seconds % 86400) / 3600); const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ---------------------------------------------------------------- tracked quest (client side)
const TRACK_KEY = 'treadfront_tracked_quest';
export function getTracked(storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage !== 'undefined' ? localStorage : undefined): string | null { try { return storage?.getItem(TRACK_KEY) ?? null; } catch { return null; } }
export function setTracked(id: string | null, storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = typeof localStorage !== 'undefined' ? localStorage : undefined): void { try { if (id) storage?.setItem(TRACK_KEY, id); else storage?.removeItem(TRACK_KEY); } catch { /* private mode */ } }
/** The tracker order: tracked quest first (if still active), then tutorial, then ready-to-claim, then the rest. */
export function trackerOrder<T extends { id: string; ready: boolean }>(active: T[], tracked: string | null): T[] {
  return [...active].sort((a, b) => Number(b.id === tracked) - Number(a.id === tracked) || Number(b.id.startsWith('tut_')) - Number(a.id.startsWith('tut_')) || Number(b.ready) - Number(a.ready));
}
export const QUEST_KINDS = ['all', 'daily', 'weekly', 'story'] as const;
export type QuestKindFilter = (typeof QUEST_KINDS)[number];
export const kindMatches = (kind: string, f: QuestKindFilter): boolean => f === 'all' || kind === f || (f === 'story' && (kind === 'story' || kind === 'tutorial'));
