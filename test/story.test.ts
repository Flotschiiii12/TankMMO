import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { ALL_QUESTS, BOUNTY_QUESTS, CHAPTERS, DAILY_POOL, EXPLORER_QUESTS, QUEST_BY_ID, WEEKLY_POOL } from '../shared/data/quests.ts';
import { SCENE_BY_ID, SPEAKERS, STORY_SCENES } from '../shared/data/story.ts';
import { STORY_TEXT } from '../shared/data/storyText.ts';
import { NAME_TABLE } from '../shared/data/names/index.ts';
import { SimRNG } from '../shared/prng.ts';
import * as C from '../shared/rules/character.ts';
import * as Q from '../shared/rules/quests.ts';
import { executeAction } from '../shared/rules/actions.ts';
import { getXPForLevel } from '../shared/rules/progression.ts';

describe('story content', () => {
  it('ten chapters with 5 to 10 scenes each, every line and choice has English and German text, speakers and icons exist', () => {
    expect(Object.keys(STORY_TEXT)).toHaveLength(10);
    for (const c of CHAPTERS) {
      const scenes = STORY_SCENES.filter((s) => s.chapter === c.chapter);
      expect(scenes.length, `chapter ${c.chapter}`).toBeGreaterThanOrEqual(5);
      expect(scenes.length).toBeLessThanOrEqual(10);
      expect(NAME_TABLE[`story.c${c.chapter}.summary`]?.de, 'summary').toBeTruthy();
      expect(NAME_TABLE[`story.c${c.chapter}.title`]?.de, 'title').toBeTruthy();
    }
    expect(STORY_SCENES.length).toBeGreaterThanOrEqual(50);
    for (const s of STORY_SCENES) {
      expect(s.lines.length, s.id).toBeGreaterThan(0);
      for (const l of s.lines) { expect(NAME_TABLE[l.key]?.en, l.key).toBeTruthy(); expect(NAME_TABLE[l.key]?.de, l.key).toBeTruthy(); expect(SPEAKERS[l.who], `${s.id}: ${l.who}`).toBeDefined(); }
      for (const c of s.choices) for (const k of [c.key, c.replyKey]) { expect(NAME_TABLE[k]?.en, k).toBeTruthy(); expect(NAME_TABLE[k]?.de, k).toBeTruthy(); }
    }
    for (const sp of Object.values(SPEAKERS)) expect(existsSync(`public/assets/icons/${sp.icon}.png`), sp.icon).toBe(true);
    // informal German
    for (const [k, v] of Object.entries(NAME_TABLE)) if (k.startsWith('story.')) expect(v.de, k).not.toMatch(/\b(Sie|Ihr|Ihre|Ihnen)\b/);
  });

  it('every scene hangs on an existing story quest of its own chapter and ids are unique', () => {
    expect(new Set(STORY_SCENES.map((s) => s.id)).size).toBe(STORY_SCENES.length);
    for (const s of STORY_SCENES) {
      const q = QUEST_BY_ID.get(s.questId);
      expect(q, s.questId).toBeDefined();
      expect(q!.chapter).toBe(s.chapter);
      expect(SCENE_BY_ID.get(s.id)).toBe(s);
    }
  });
});

describe('quest graph', () => {
  it('has no cycles and every quest can be reached from a fresh character (prerequisites are real quests, chains end in the tutorial)', () => {
    const done = new Set<string>();
    let progress = true;
    while (progress) {
      progress = false;
      for (const q of ALL_QUESTS) if (!done.has(q.id) && q.prerequisites.every((p) => done.has(p))) { done.add(q.id); progress = true; }
    }
    const stuck = ALL_QUESTS.filter((q) => !done.has(q.id)).map((q) => q.id);
    expect(stuck, `unreachable or cyclic: ${stuck.join(', ')}`).toEqual([]);
  });

  it('the 40 new daily / weekly / bounty / explorer quests exist and their objectives are satisfiable', () => {
    const newDaily = ['night_patrol', 'dead_drop', 'ground_zero', 'quartermaster', 'safe_passage', 'twin_gates', 'sharpshooter_day', 'ironclad', 'wreck_diver', 'gladiator_warmup', 'long_road', 'boss_hunt_2', 'elite_trio', 'forge_day', 'convoy_double', 'rust_sweep'];
    const newWeekly = ['deep_miner', 'arena_veteran', 'gate_master', 'boss_week', 'logistics', 'long_haul'];
    for (const k of newDaily) expect(QUEST_BY_ID.get(`daily_${k}`)?.kind, k).toBe('daily');
    for (const k of newWeekly) expect(QUEST_BY_ID.get(`weekly_${k}`)?.kind, k).toBe('weekly');
    expect(DAILY_POOL.length - 40).toBe(16); expect(WEEKLY_POOL.length - 9).toBe(6);
    expect(BOUNTY_QUESTS.length - 6).toBe(8); expect(EXPLORER_QUESTS.length - 10).toBe(10);
    for (const q of ALL_QUESTS) for (const o of q.objectives) {
      expect(o.count, q.id).toBeGreaterThan(0);
      if (o.type === 'kill' && typeof o.target === 'string') expect(['scout_buggy', 'gunner_truck', 'artillery', 'bunker_turret', 'flak_wagon', 'engineer', 'loot_convoy', 'ice_tank', 'swamp_crawler', 'lava_truck', 'sandstorm_raider']).toContain(o.target);
    }
  });

  it('new quests pay no more experience (as a share of the next level) than the existing ones of the same kind', () => {
    const oldIds = (q: { id: string; kind: string }) => !/(night_patrol|dead_drop|ground_zero|quartermaster|safe_passage|twin_gates|sharpshooter_day|ironclad|wreck_diver|gladiator_warmup|long_road|boss_hunt_2|elite_trio|forge_day|convoy_double|rust_sweep|deep_miner|arena_veteran|gate_master|boss_week|logistics|long_haul|gravel_jack|salt_hound|canyon_queen|frost_baron|bog_hag|dune_ghost|magma_tyrant|wire_fox)/.test(q.id) && !['explore_map_2', 'explore_map_4', 'explore_map_5', 'explore_map_7', 'explore_map_8', 'explore_map_10', 'explore_map_12', 'explore_map_15', 'explore_map_18', 'explore_map_20'].includes(q.id);
    for (const kind of ['daily', 'weekly', 'bounty', 'explorer']) for (const L of [5, 20, 50, 90]) {
      const share = (q: (typeof ALL_QUESTS)[number]) => Q.scaledReward(q, L).xp / (getXPForLevel(L + 1) - getXPForLevel(L));
      const pool = ALL_QUESTS.filter((q) => q.kind === kind && L >= q.minLevel && (q.maxLevel === undefined || L <= q.maxLevel));
      const old = pool.filter(oldIds).map(share); const added = pool.filter((q) => !oldIds(q)).map(share);
      if (!old.length || !added.length) continue;
      expect(Math.max(...added), `${kind} at level ${L}`).toBeLessThanOrEqual(Math.max(...old) * 1.25);
    }
  });
});

describe('scene flow', () => {
  const fresh = () => { const ch = C.createCharacter('S'); Q.refreshQuests(ch, 1_800_000_000); return ch; };
  it('a scene appears when its quest event happened, once, and cannot be marked before it was earned', () => {
    const ch = fresh();
    expect(Q.pendingScene(ch)).toBeUndefined();
    expect(Q.markSceneSeen(ch, 'scn_c1_1')).toBe(false); // not earned yet
    Q.skipTutorial(ch);
    const acc = Q.acceptQuest(ch, 'story_c1_q1');
    expect(acc.ok).toBe(true);
    const s = Q.pendingScene(ch)!;
    expect(s.id).toBe('scn_c1_1');
    const r = executeAction(ch, { kind: 'scene_seen', sceneId: s.id }, new SimRNG(1), { inSafeZone: false, nowSeconds: 0, buyAmmo: () => ({ ok: false, error: 'x' }) });
    expect(r.ok).toBe(true);
    expect(Q.pendingScene(ch)).toBeUndefined();
    const bad = executeAction(ch, { kind: 'scene_seen', sceneId: 'scn_c9_1' }, new SimRNG(1), { inSafeZone: false, nowSeconds: 0, buyAmmo: () => ({ ok: false, error: 'x' }) });
    expect(bad).toMatchObject({ ok: false, error: 'unknown_scene' });
    expect(executeAction(ch, { kind: 'scene_seen', sceneId: '__proto__' }, new SimRNG(1), { inSafeZone: false, nowSeconds: 0, buyAmmo: () => ({ ok: false, error: 'x' }) }).ok).toBe(false);
  });

  it('a veteran character gets no recap pop-ups for what it did before dialogues existed, but new events still trigger scenes', () => {
    const ch = fresh();
    Q.skipTutorial(ch);
    for (let i = 1; i <= 4; i++) ch.quests.completed.push(`story_c1_q${i}`);
    delete ch.stats['scn_init'];
    Q.initStoryScenes(ch);
    expect(Q.pendingScene(ch)).toBeUndefined();
    ch.quests.completed.push('story_c1_q5');
    ch.quests.completed.push('story_c1_q6');
    expect(Q.pendingScene(ch)?.questId).toBe('story_c1_q6');
  });

  it('the whole story can be played through scene by scene', () => {
    const ch = fresh(); Q.skipTutorial(ch);
    let seen = 0;
    for (const s of STORY_SCENES) {
      const quest = QUEST_BY_ID.get(s.questId)!;
      for (const p of quest.prerequisites) if (!ch.quests.completed.includes(p)) ch.quests.completed.push(p);
      if (s.on === 'accept') ch.quests.active[quest.id] = { id: quest.id, progress: [0], targets: [1], levelAtAccept: 1, ready: false };
      else { delete ch.quests.active[quest.id]; if (!ch.quests.completed.includes(quest.id)) ch.quests.completed.push(quest.id); }
      const p = Q.pendingScene(ch);
      expect(p, s.id).toBeDefined();
      expect(Q.markSceneSeen(ch, p!.id)).toBe(true); seen++;
    }
    expect(seen).toBe(STORY_SCENES.length);
    expect(Q.pendingScene(ch)).toBeUndefined();
  });
});
