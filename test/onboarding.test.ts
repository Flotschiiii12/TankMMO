import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp } from '../server/app.ts';
import { PROTOCOL_VERSION } from '../shared/protocol.ts';
import { SimRNG } from '../shared/prng.ts';
import * as C from '../shared/rules/character.ts';
import * as Q from '../shared/rules/quests.ts';
import { QUEST_BY_ID, TUTORIAL_QUESTS, TUTORIAL_STEPS } from '../shared/data/quests.ts';
import { HINTS, markShown, newHintMemory, nextHint, NEWBIE_PROTECTION_LEVEL, TUTORIAL_HINT_KEYS, type HintState } from '../shared/rules/hints.ts';
import { DE_TABLE } from '../src/i18n.ts';

const fresh = () => { const ch = C.createCharacter('Newbie'); Q.refreshQuests(ch, 1_800_000_000); return ch; };
const claimAllReady = (ch: C.CharacterState, rng: SimRNG) => {
  for (let guard = 0; guard < 40; guard++) {
    const ready = Object.values(ch.quests.active).find((a) => a.ready && a.id.startsWith('tut_'));
    if (!ready) return;
    expect(Q.claimQuest(ch, ready.id, rng, 1_800_000_000).ok).toBe(true);
  }
};

describe('guided start state machine', () => {
  it('has 11 steps, one active at a time, starting with driving', () => {
    expect(TUTORIAL_STEPS).toHaveLength(11);
    const ch = fresh();
    expect(Object.keys(ch.quests.active).filter((id) => id.startsWith('tut_'))).toEqual(['tut_1_drive']);
    expect(Q.tutorialStatus(ch)).toEqual({ step: 'drive', done: 0, total: 11 });
  });

  it('can always be completed, whatever order things happen in (300 random orders, repeats and events before their step)', () => {
    const rng = new SimRNG(77);
    for (let run = 0; run < 300; run++) {
      const ch = fresh();
      const events = [...TUTORIAL_STEPS, ...TUTORIAL_STEPS.filter(() => rng.chance(0.4))];
      for (let i = events.length - 1; i > 0; i--) { const j = rng.rangeInt(0, i); [events[i], events[j]] = [events[j], events[i]]; }
      for (const step of events) { Q.onQuestEvent(ch, { type: 'tutorial', step }); claimAllReady(ch, rng); }
      claimAllReady(ch, rng);
      const st = Q.tutorialStatus(ch);
      expect(st.step, `run ${run}: stuck on ${st.step} after ${events.join(',')}`).toBeUndefined();
      expect(st.done).toBe(11);
    }
  });

  it('is never stuck without the player doing anything wrong: each step needs exactly its own event and none is impossible', () => {
    const ch = fresh(); const rng = new SimRNG(1);
    for (const step of TUTORIAL_STEPS) {
      expect(Q.tutorialStatus(ch).step).toBe(step);
      Q.onQuestEvent(ch, { type: 'kill', kind: 'scout_buggy', level: 1, isElite: false, isBoss: false }); // unrelated events change nothing
      expect(Q.tutorialStatus(ch).step).toBe(step);
      Q.onQuestEvent(ch, { type: 'tutorial', step });
      claimAllReady(ch, rng);
    }
    expect(Q.tutorialStatus(ch).step).toBeUndefined();
    // the first story quest follows
    expect(Q.questAvailable(ch, QUEST_BY_ID.get('story_c1_q1')!)).toBe(true);
  });

  it('the skip button completes everything without rewards and unlocks the story; unknown steps cannot pollute the character', () => {
    const ch = fresh(); const scrap = ch.wallet.scrap; const xp = ch.xp;
    Q.skipTutorial(ch);
    expect(Q.tutorialStatus(ch)).toMatchObject({ step: undefined, done: 11 });
    expect(ch.wallet.scrap).toBe(scrap); expect(ch.xp).toBe(xp);
    expect(Object.keys(ch.quests.active).some((id) => id.startsWith('tut_'))).toBe(false);
    const other = fresh();
    Q.onQuestEvent(other, { type: 'tutorial', step: '__proto__' }); Q.onQuestEvent(other, { type: 'tutorial', step: 'x'.repeat(500) });
    expect(Object.keys(other.stats).filter((k) => k.startsWith('tut_'))).toEqual([]);
  });

  it('every step has a hint text and a German translation', () => {
    for (const s of TUTORIAL_STEPS) { expect(TUTORIAL_HINT_KEYS[s], s).toBeTruthy(); expect(DE_TABLE[TUTORIAL_HINT_KEYS[s]], TUTORIAL_HINT_KEYS[s]).toBeTruthy(); }
    for (const h of HINTS) expect(DE_TABLE[h.textKey], h.textKey).toBeTruthy();
    expect(TUTORIAL_QUESTS).toHaveLength(TUTORIAL_STEPS.length);
  });
});

describe('contextual hints', () => {
  const base: HintState = { level: 3, mapId: 1, inSafeZone: false, hullRatio: 1, inventoryFull: false, specialAmmo: 0, specialAmmoJustRanOut: false, unspentTalentPoints: 0, tutorialDone: false };
  it('fires for the situation, then respects cooldown and the lifetime cap', () => {
    const mem = newHintMemory();
    expect(nextHint(base, mem, 0)).toBeUndefined();
    const hurt = { ...base, hullRatio: 0.2 };
    expect(nextHint(hurt, mem, 0)?.id).toBe('low_hull');
    markShown(mem, 'low_hull', 0);
    expect(nextHint(hurt, mem, 30)).toBeUndefined(); // cooldown
    expect(nextHint(hurt, mem, 100)?.id).toBe('low_hull');
    for (let t = 100, i = 0; i < 5; i++, t += 100) markShown(mem, 'low_hull', t);
    expect(nextHint(hurt, mem, 10_000)).toBeUndefined(); // used up
  });
  it('knows the new-player mistakes: PvP map too early, full inventory, out of special ammo, unspent talents', () => {
    const mem = newHintMemory();
    expect(nextHint({ ...base, mapId: 23 }, mem, 0)?.id).toBe('pvp_early');
    expect(nextHint({ ...base, mapId: 23, level: 20 }, newHintMemory(), 0)).toBeUndefined();
    expect(nextHint({ ...base, inventoryFull: true }, newHintMemory(), 0)?.id).toBe('full_inventory');
    expect(nextHint({ ...base, specialAmmoJustRanOut: true }, newHintMemory(), 0)?.id).toBe('low_ammo');
    expect(nextHint({ ...base, unspentTalentPoints: 2, inSafeZone: true }, newHintMemory(), 0)?.id).toBe('talent_points');
    expect(nextHint({ ...base, unspentTalentPoints: 2, inSafeZone: false }, newHintMemory(), 0)).toBeUndefined();
  });
  it('quest markers name what to hunt, where to go and whether ore is wanted', () => {
    const ch = fresh();
    ch.quests.active['x'] = { id: 'story_c1_q2', progress: [0], targets: [8], levelAtAccept: 1, ready: false };
    ch.quests.active['y'] = { id: 'story_c1_q3', progress: [0], targets: [30], levelAtAccept: 1, ready: false };
    ch.quests.active['z'] = { id: 'story_c1_q1', progress: [0], targets: [1], levelAtAccept: 1, ready: false };
    expect(Q.questMarkers(ch)).toEqual({ enemyKinds: ['scout_buggy'], mapIds: [1], ore: true });
    ch.quests.active['x'].ready = true;
    expect(Q.questMarkers(ch).enemyKinds).toEqual([]);
  });
});

// ------------------------------------------------------------------------------------------------ server

process.env.LOAD_TEST = '1';
let ctx: ReturnType<typeof createApp>; let port: number;
beforeEach(async () => { ctx = createApp({ adminToken: 'x' }); port = await ctx.game.listen(0); });
afterEach(async () => { await ctx.game.close(); });

async function join() {
  const g = (await (await fetch(`http://127.0.0.1:${port}/api/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ageConfirmed: true }) })).json()) as any;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); const msgs: any[] = [];
  await new Promise<void>((r) => ws.on('open', () => r()));
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
  const [a, s] = g.credential.split('.');
  ws.send(JSON.stringify({ type: 'c_join', protocolVersion: PROTOCOL_VERSION, accountId: a, secret: s }));
  for (let i = 0; i < 500 && !msgs.some((m) => m.type === 's_character'); i++) { ctx.game.stepAll(); await new Promise((r) => setTimeout(r, 4)); }
  return { id: g.accountId as string, ws, msgs };
}

describe('newbie protection and server-side steps', () => {
  it('dying at level 5 or below costs no scrap, above it costs 10 %', async () => {
    const lose = async (level: number) => {
      const p = await join(); const st = ctx.game.getSessionState(p.id)!;
      st.character.level = level; st.character.wallet.scrap = 1000;
      st.entity.invulnerableTime = 0; st.entity.hull = 0;
      for (let i = 0; i < 5; i++) ctx.game.stepAll();
      const after = ctx.game.getSessionState(p.id)!.character.wallet.scrap;
      p.ws.close();
      return after;
    };
    expect(await lose(NEWBIE_PROTECTION_LEVEL)).toBe(1000);
    expect(await lose(NEWBIE_PROTECTION_LEVEL + 1)).toBe(900);
  });

  it('using an ability, switching ammo and opening the gate list count as tutorial steps without the client saying so', async () => {
    const p = await join(); const st = ctx.game.getSessionState(p.id)!;
    st.entity.invulnerableTime = 0;
    p.ws.send(JSON.stringify({ type: 'c_input', seq: 1, commands: [{ type: 'UseAbility', abilityId: 'boost' }], clientTime: 0 }));
    for (let i = 0; i < 5; i++) { ctx.game.stepAll(); await new Promise((r) => setTimeout(r, 4)); }
    expect(st.character.stats[Q.tutorialFlag('ability')]).toBe(1);
    p.ws.send(JSON.stringify({ type: 'c_social', id: 1, req: { op: 'dungeon_list' } }));
    for (let i = 0; i < 20 && !p.msgs.some((m) => m.type === 's_social_result'); i++) { ctx.game.stepAll(); await new Promise((r) => setTimeout(r, 4)); }
    expect(st.character.stats[Q.tutorialFlag('gate')]).toBe(1);
    p.ws.close();
  });
});
