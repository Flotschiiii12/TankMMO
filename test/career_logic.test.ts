import { describe, expect, it } from 'vitest';
import * as C from '../shared/rules/character.ts';
import { TALENTS_CATALOG } from '../shared/data/talents.ts';
import { SEASON_LENGTH_SECONDS, SEASON_POINTS_PER_TIER, SEASON_REWARDS } from '../shared/data/season.ts';
import { BRANCHES, NODE_H, NODE_W, achievementRows, codexEntries, codexSummary, filterAchievements, formatDuration, getTracked, kindMatches, rewardParts, seasonInfo, seasonSecondsLeft, setTracked, talentGraph, talentState, tierState, trackerOrder } from '../src/ui/career/careerLogic.ts';

const fresh = (level = 30) => { const ch = C.createCharacter('Career'); ch.level = level; return ch; };

describe('talent graph', () => {
  it('has all 36 talents in 3 branches, no node overlaps, and every prerequisite is an edge to a node in the same graph', () => {
    const ch = fresh(); let total = 0;
    for (const b of BRANCHES) {
      const g = talentGraph(ch, b); total += g.nodes.length; expect(g.nodes.every((n) => n.def.branch === b)).toBe(true);
      for (let i = 0; i < g.nodes.length; i++) for (let j = i + 1; j < g.nodes.length; j++) { const a = g.nodes[i], c = g.nodes[j]; const overlap = a.x < c.x + NODE_W && c.x < a.x + NODE_W && a.y < c.y + NODE_H && c.y < a.y + NODE_H; expect(overlap, `${a.def.id} / ${c.def.id}`).toBe(false); }
      const ids = new Set(g.nodes.map((n) => n.def.id)); for (const e of g.edges) { expect(ids.has(e.from) && ids.has(e.to)).toBe(true); const f = g.nodes.find((n) => n.def.id === e.from)!, t = g.nodes.find((n) => n.def.id === e.to)!; expect(t.def.tier).toBeGreaterThan(f.def.tier); }
    }
    expect(total).toBe(TALENTS_CATALOG.length); expect(total).toBe(36);
  });
  it('talent states follow the server rules: locked by prerequisite, available with points, maxed, and rank-up really works exactly when it says available', () => {
    const ch = fresh(40);
    for (const def of TALENTS_CATALOG) { const st = talentState(ch, def); expect(st.state === 'available', def.id).toBe(C.rankUpTalent(structuredClone(ch), def.id).ok); }
    const root = TALENTS_CATALOG.find((t) => !t.prerequisites?.length && t.minLevel <= 40)!; const child = TALENTS_CATALOG.find((t) => t.prerequisites?.includes(root.id))!;
    expect(talentState(ch, child)).toMatchObject({ state: 'locked', reason: 'prerequisite_missing' });
    expect(C.rankUpTalent(ch, root.id).ok).toBe(true); expect(talentState(ch, root).state).toBe('available'); expect(talentState(ch, child).state).toBe('available');
    const one = fresh(5); expect(C.talentPointsAvailable(one)).toBe(1); C.rankUpTalent(one, root.id); expect(talentState(one, root)).toMatchObject({ state: 'ranked', reason: 'no_points' });
    ch.talentRanks[root.id] = root.maxRank; expect(talentState(ch, root).state).toBe('maxed');
    const low = fresh(1); expect(talentState(low, root).reason).toBe('level_too_low');
  });
});

describe('achievements and codex', () => {
  it('progress is capped at the target, finished ones sort last, filters work', () => {
    const ch = fresh(); const rows = achievementRows(ch); expect(rows.length).toBeGreaterThan(40);
    ch.achievements.push(rows[0].id); const r2 = achievementRows(ch); expect(r2[0].done).toBe(true); expect(r2[0].pct).toBe(1);
    expect(r2.every((r) => r.progress <= r.target)).toBe(true);
    const done = filterAchievements(r2, 'all', 'done'); expect(done).toHaveLength(1); expect(filterAchievements(r2, 'all', 'open')).toHaveLength(r2.length - 1);
    const combat = filterAchievements(r2, 'combat', 'all'); expect(combat.length).toBeGreaterThan(0); expect(combat.every((r) => r.category === 'combat')).toBe(true);
    expect(filterAchievements(r2, 'all', 'open')[0].pct).toBeGreaterThanOrEqual(filterAchievements(r2, 'all', 'open').at(-1)!.pct);
  });
  it('codex lists every catalogue entry once and marks the known ones', () => {
    const ch = fresh(); ch.codex.map = ['1', '2']; ch.codex.vehicle = [ch.activeVehicle];
    expect(codexSummary(ch, 'map')).toEqual({ have: 2, total: 30 }); expect(codexSummary(ch, 'vehicle').have).toBe(1); expect(codexSummary(ch, 'vehicle').total).toBe(50);
    for (const k of ['enemy', 'item', 'map', 'vehicle'] as const) { const e = codexEntries(ch, k); expect(new Set(e.map((x) => x.id)).size).toBe(e.length); }
    expect(codexEntries(ch, 'item').every((e) => !!e.rarity)).toBe(true);
  });
});

describe('season pass', () => {
  it('tier, points in tier, claimable list and time left', () => {
    const ch = fresh(); ch.season.seasonId = 3; ch.season.points = 2 * SEASON_POINTS_PER_TIER + 40; ch.season.claimed = [1];
    const now = 2 * SEASON_LENGTH_SECONDS + 5 * 86400; const i = seasonInfo(ch, now);
    expect(i).toMatchObject({ tier: 2, pointsInTier: 40, claimable: [2], maxed: false }); expect(i.nextReward!.tier).toBe(3);
    expect(i.secondsLeft).toBe(3 * SEASON_LENGTH_SECONDS - now); expect(seasonSecondsLeft(0, 10)).toBe(SEASON_LENGTH_SECONDS - 10);
    expect(tierState(ch, SEASON_REWARDS[0])).toBe('claimed'); expect(tierState(ch, SEASON_REWARDS[1])).toBe('claimable'); expect(tierState(ch, SEASON_REWARDS[2])).toBe('locked');
    ch.season.points = 99999; expect(seasonInfo(ch, now).maxed).toBe(true);
  });
  it('reward parts and duration text', () => {
    expect(rewardParts(SEASON_REWARDS[49]).map((p) => p.kind)).toEqual(expect.arrayContaining(['scrap', 'season', 'skin', 'title'])); expect(rewardParts(SEASON_REWARDS[0])).toEqual([{ kind: 'scrap', amount: SEASON_REWARDS[0].scrap }]);
    expect(formatDuration(3 * 86400 + 5 * 3600)).toBe('3d 5h'); expect(formatDuration(2 * 3600 + 90)).toBe('2h 1m'); expect(formatDuration(59)).toBe('0m');
  });
});

describe('quest tracking', () => {
  it('tracked quest first, then tutorial, then ready ones; storage failures are harmless', () => {
    const q = [{ id: 'b', ready: false }, { id: 'tut_1_drive', ready: false }, { id: 'c', ready: true }, { id: 'a', ready: false }];
    expect(trackerOrder(q, 'a').map((x) => x.id)).toEqual(['a', 'tut_1_drive', 'c', 'b']); expect(trackerOrder(q, null).map((x) => x.id)).toEqual(['tut_1_drive', 'c', 'b', 'a']); expect(trackerOrder(q, 'gone')[0].id).toBe('tut_1_drive');
    const mem: Record<string, string> = {}; const st = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
    expect(getTracked(st)).toBeNull(); setTracked('q1', st); expect(getTracked(st)).toBe('q1'); setTracked(null, st); expect(getTracked(st)).toBeNull();
    expect(getTracked({ getItem: () => { throw new Error('blocked'); } })).toBeNull();
    expect(kindMatches('tutorial', 'story')).toBe(true); expect(kindMatches('daily', 'story')).toBe(false); expect(kindMatches('weekly', 'all')).toBe(true);
  });
});
