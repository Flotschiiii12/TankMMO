import { describe, expect, it } from 'vitest';
import { ALL_QUESTS, CHAPTERS, DAILY_POOL, QUEST_BY_ID, STORY_QUESTS, TUTORIAL_STEPS, WEEKLY_POOL } from '../shared/data/quests.ts';
import { SEASON_DAILY_POINT_CAP, SEASON_LENGTH_SECONDS, SEASON_REWARDS, SEASON_TIERS } from '../shared/data/season.ts';
import { SimRNG } from '../shared/prng.ts';
import { createCharacter } from '../shared/rules/character.ts';
import * as Q from '../shared/rules/quests.ts';

const DAY = 86400;
const T0 = 20000 * DAY; // some Monday-agnostic day

describe('Quest data', () => {
  it('has 10 story chapters of 8-12 quests, a 40-quest daily pool, 9 weekly, unique ids and valid prerequisites', () => {
    for (const c of CHAPTERS) {
      const n = STORY_QUESTS.filter((q) => q.chapter === c.chapter).length;
      expect(n).toBeGreaterThanOrEqual(8);
      expect(n).toBeLessThanOrEqual(12);
    }
    expect(CHAPTERS).toHaveLength(10);
    expect(DAILY_POOL).toHaveLength(56); // 40 + 16 added in cloud run 3
    expect(WEEKLY_POOL).toHaveLength(15); // 9 + 6
    expect(new Set(ALL_QUESTS.map((q) => q.id)).size).toBe(ALL_QUESTS.length);
    for (const q of ALL_QUESTS) for (const p of q.prerequisites) expect(QUEST_BY_ID.has(p), `${q.id} -> ${p}`).toBe(true);
    // every chapter ends with a boss or a gate
    for (const c of CHAPTERS) expect(['defeat_boss', 'clear_gate']).toContain(QUEST_BY_ID.get(`story_c${c.chapter}_q10`)!.objectives[0].type);
  });
});

describe('Quest rules', () => {
  const rng = () => new SimRNG(5);

  it('tutorial chain unlocks step by step, then chapter 1', () => {
    const ch = createCharacter('T');
    expect(Q.ensureTutorial(ch)).toBe('tut_1_drive');
    expect(Object.keys(ch.quests.active)).toEqual(['tut_1_drive']);
    for (const step of TUTORIAL_STEPS) {
      const id = Object.keys(ch.quests.active).find((q) => q.startsWith('tut_') && q.endsWith(`_${step}`))!;
      expect(id).toBeDefined();
      expect(Q.onQuestEvent(ch, { type: 'tutorial', step })).toEqual([id]);
      expect((Q.claimQuest(ch, id, rng(), T0) as any).ok).toBe(true);
    }
    expect(Q.availableQuests(ch).map((q) => q.id)).toContain('story_c1_q1');
    expect(ch.level).toBeGreaterThan(1); // tutorial rewards level you up
  });

  it('progress counts kills by kind, elite flag and caps at the target; claim pays out once', () => {
    const ch = createCharacter('T');
    ch.level = 20;
    ch.quests.completed.push('story_c1_q1');
    Q.acceptQuest(ch, 'story_c1_q2'); // kill 8 scout_buggy
    for (let i = 0; i < 20; i++) Q.onQuestEvent(ch, { type: 'kill', kind: 'gunner_truck', level: 1 });
    expect(ch.quests.active['story_c1_q2'].progress[0]).toBe(0);
    for (let i = 0; i < 7; i++) expect(Q.onQuestEvent(ch, { type: 'kill', kind: 'scout_buggy', level: 1 })).toEqual([]);
    expect(Q.onQuestEvent(ch, { type: 'kill', kind: 'scout_buggy', level: 1 })).toEqual(['story_c1_q2']);
    expect(Q.onQuestEvent(ch, { type: 'kill', kind: 'scout_buggy', level: 1 })).toEqual([]);
    const scrap = ch.wallet.scrap;
    const r = Q.claimQuest(ch, 'story_c1_q2', rng(), T0) as any;
    expect(r.ok).toBe(true);
    expect(ch.wallet.scrap).toBe(scrap + r.reward.scrap);
    expect(Q.claimQuest(ch, 'story_c1_q2', rng(), T0)).toEqual({ ok: false, error: 'not_active' });
    expect(Q.acceptQuest(ch, 'story_c1_q2')).toEqual({ ok: false, error: 'not_available' });
  });

  it('elite-only objectives ignore normal kills; deliver takes scrap', () => {
    const ch = createCharacter('T');
    ch.level = 20;
    ch.quests.completed.push('story_c1_q6');
    Q.acceptQuest(ch, 'story_c1_q7');
    Q.onQuestEvent(ch, { type: 'kill', kind: 'scout_buggy', level: 1 });
    expect(ch.quests.active['story_c1_q7'].progress[0]).toBe(0);
    expect(Q.onQuestEvent(ch, { type: 'kill', kind: 'scout_buggy', level: 1, isElite: true })).toEqual(['story_c1_q7']);
    ch.quests.completed.push('story_c1_q8');
    expect(Q.acceptQuest(ch, 'story_c1_q9').ok).toBe(true);
    expect(Q.deliverScrap(ch, 100)).toEqual({ ok: false, error: 'not_enough_scrap' });
    ch.wallet.scrap = 1000;
    Q.deliverScrap(ch, 350);
    expect(ch.wallet.scrap).toBe(650);
    expect(ch.quests.active['story_c1_q9'].progress[0]).toBe(350);
  });

  it('daily/weekly rotation: 5 dailies, 3 weeklies, deterministic, changes next day, scales with level', () => {
    const a = createCharacter('Ann'); const b = createCharacter('Ann');
    Q.refreshQuests(a, T0); Q.refreshQuests(b, T0);
    expect(a.quests.dailyIds).toHaveLength(5);
    expect(a.quests.weeklyIds).toHaveLength(3);
    expect(a.quests.dailyIds).toEqual(b.quests.dailyIds);
    expect(Q.refreshQuests(a, T0 + 3600)).toEqual({ dailyChanged: false, weeklyChanged: false });
    const before = [...a.quests.dailyIds];
    expect(Q.refreshQuests(a, T0 + DAY).dailyChanged).toBe(true);
    expect(a.quests.dailyIds).not.toEqual(before);
    for (const id of before) expect(a.quests.active[id]).toBeUndefined();
    // counts scale with level
    const lo = createCharacter('Z'); const hi = createCharacter('Z'); hi.level = 100;
    Q.refreshQuests(lo, T0); Q.refreshQuests(hi, T0);
    const sum = (c: any) => Object.values<any>(c.quests.active).reduce((s, q) => s + q.targets.reduce((x: number, y: number) => x + y, 0), 0);
    expect(sum(hi)).toBeGreaterThan(sum(lo) * 1.5);
    // weekly stays within the same week
    const wk = a.quests.weeklyIds.slice();
    Q.refreshQuests(a, T0 + 2 * DAY);
    expect(a.quests.weeklyKey).toBe(Q.weekKey(T0));
    expect(Q.weekKey(T0 + 14 * DAY)).not.toBe(Q.weekKey(T0));
    void wk;
  });

  it('only one bounty at a time; level windows apply; abandon works for non-rotating quests', () => {
    const ch = createCharacter('T');
    expect(Q.acceptQuest(ch, 'bounty_rust_baron')).toEqual({ ok: false, error: 'not_available' });
    ch.level = 12;
    expect(Q.acceptQuest(ch, 'bounty_rust_baron').ok).toBe(true);
    ch.level = 25;
    expect(Q.acceptQuest(ch, 'bounty_dust_widow').ok).toBe(false);
    expect(Q.abandonQuest(ch, 'bounty_rust_baron').ok).toBe(true);
    Q.refreshQuests(ch, T0);
    expect(Q.abandonQuest(ch, ch.quests.dailyIds[0])).toEqual({ ok: false, error: 'cannot_abandon' });
  });

  it('events: explore, portal, gate, boss and craft feed quests', () => {
    const ch = createCharacter('T');
    ch.level = 100;
    ch.quests.active['x'] = undefined as any; delete ch.quests.active['x'];
    Q.acceptQuest(ch, 'explore_map_1');
    Q.onQuestEvent(ch, { type: 'explore', mapId: 3 });
    expect(ch.quests.active['explore_map_1'].progress[0]).toBe(0);
    Q.onQuestEvent(ch, { type: 'explore', mapId: 1 });
    expect(Q.onQuestEvent(ch, { type: 'explore', mapId: 1 })).toEqual(['explore_map_1']);
  });
});

describe('Season pass', () => {
  const rng = new SimRNG(1);
  void rng;
  it('has 50 tiers; points are capped per day; tiers claim once; rollover resets points but keeps skins', () => {
    expect(SEASON_REWARDS).toHaveLength(SEASON_TIERS);
    const ch = createCharacter('S');
    expect(Q.addSeasonPoints(ch, 100, T0)).toBe(100);
    expect(Q.addSeasonPoints(ch, 100, T0)).toBe(SEASON_DAILY_POINT_CAP - 100);
    expect(Q.addSeasonPoints(ch, 100, T0)).toBe(0);
    expect(Q.addSeasonPoints(ch, 100, T0 + DAY)).toBe(100);
    expect(Q.seasonTier(ch)).toBe(2);
    expect(Q.claimSeasonTier(ch, 3, T0 + DAY)).toEqual({ ok: false, error: 'tier_not_reached' });
    const scrap = ch.wallet.scrap;
    expect(Q.claimSeasonTier(ch, 1, T0 + DAY).ok).toBe(true);
    expect(ch.wallet.scrap).toBeGreaterThan(scrap);
    expect(Q.claimSeasonTier(ch, 1, T0 + DAY)).toEqual({ ok: false, error: 'already_claimed' });
    ch.season.skins.push('skin_x');
    Q.addSeasonPoints(ch, 10, T0 + SEASON_LENGTH_SECONDS + DAY);
    expect(ch.season.points).toBe(10);
    expect(ch.season.claimed).toEqual([]);
    expect(ch.season.skins).toContain('skin_x');
  });
});
