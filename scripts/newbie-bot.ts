/**
 * Plays the first minutes of a new account through the REAL client/server protocol (websocket, deltas, actions) and
 * reports when the milestones happened, to find dead ends and tune the first levels.
 *   npm run newbie -- --minutes 30 --seed 1
 * The server runs in-process on a fake clock that advances one tick (1/30 s) per step, so 30 simulated minutes take about
 * a minute of real time. The bot only uses what a human has: it drives, locks and shoots, picks up loot, claims quests,
 * and visits the safe zone to craft and equip.
 */
import WebSocket from 'ws';
import { createApp } from '../server/app.ts';
import { PROTOCOL_VERSION } from '../shared/protocol.ts';
import { applyPatch } from '../shared/net/delta.ts';
import { getMapById } from '../shared/data/maps.ts';
import { CRAFTING_RECIPES, ITEM_BY_ID } from '../shared/data/items.ts';
import { QUEST_BY_ID, STORY_QUESTS } from '../shared/data/quests.ts';
import * as C from '../shared/rules/character.ts';
import * as Q from '../shared/rules/quests.ts';
import { tutorialStatus } from '../shared/rules/quests.ts';
import type { SimEntity } from '../shared/types.ts';

export interface NewbieReport {
  minutes: number; seed: number; finalLevel: number; kills: number;
  firstMs: Record<string, number | null>; tutorial: { done: number; total: number; stuckOn?: string };
  idleSeconds: number; deaths: number; scrap: number; questsClaimed: number;
}

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

export async function runNewbie(opts: { minutes: number; seed: number }): Promise<NewbieReport> {
  process.env.LOAD_TEST = '1';
  let nowMs = 1_800_000_000_000;
  const ctx = createApp({ adminToken: 'bot', clock: { nowMs: () => nowMs } });
  const port = await ctx.game.listen(0);
  let seed = opts.seed >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  const g = (await (await fetch(`http://127.0.0.1:${port}/api/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ageConfirmed: true }) })).json()) as any;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const entities = new Map<number, SimEntity>();
  let me = 0; let mapId = 1; let character: C.CharacterState | undefined; let seq = 0; let actionId = 0; let lastTick = 0;
  const results = new Map<number, any>();
  await new Promise<void>((r) => ws.on('open', () => r()));
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.type === 's_map') { entities.clear(); me = m.assignedEntityId; mapId = m.mapId; }
    else if (m.type === 's_character') character = m.character;
    else if (m.type === 's_state') { for (const p of m.patches) applyPatch(entities, p); for (const id of m.removed) entities.delete(id); lastTick = m.tick; }
    else if (m.type === 's_action_result') results.set(m.id, m);
  });
  const [a, s] = g.credential.split('.');
  ws.send(JSON.stringify({ type: 'c_join', protocolVersion: PROTOCOL_VERSION, accountId: a, secret: s }));
  const tick = async (n = 1) => { for (let i = 0; i < n; i++) { nowMs += 1000 / 30; ctx.game.stepAll(); } await new Promise((r) => setImmediate(r)); };
  while (!character || !me) await tick();

  const first: Record<string, number | null> = { firstKill: null, firstLoot: null, level2: null, level3: null, level5: null, level10: null, firstCraft: null, firstEquip: null, tutorialDone: null, firstGateList: null, firstStoryAccepted: null, firstStoryClaimed: null };
  const t0 = nowMs; const minutes = () => Math.round(((nowMs - t0) / 60000) * 10) / 10;
  const mark = (k: string) => { if (first[k] === null) first[k] = minutes(); };
  let kills = 0; let deaths = 0; let idleTicks = 0; let claimed = 0; let lastKillsStat = 0; let lastPos = { x: 0, y: 0 }; let moved = 0;
  const act = async (action: any) => { const id = ++actionId; ws.send(JSON.stringify({ type: 'c_action', id, action })); for (let i = 0; i < 40 && !results.has(id); i++) await tick(); if (process.env.BOT_DEBUG) console.error('act', JSON.stringify(action), JSON.stringify(results.get(id))); return results.get(id); };
  const social = async (req: any) => { const id = ++actionId; ws.send(JSON.stringify({ type: 'c_social', id, req })); for (let i = 0; i < 40; i++) { await tick(); } };
  const map = () => getMapById(mapId) as any;
  const home = () => { const z = map().safeZones?.[0]; return z ? { x: z.x, y: z.y, r: z.radius } : { x: 2000, y: 2000, r: 400 }; };
  const input = (cmds: any[]) => ws.send(JSON.stringify({ type: 'c_input', seq: ++seq, commands: cmds, clientTime: 0 }));
  const dirTo = (from: { x: number; y: number }, to: { x: number; y: number }) => { const dx = to.x - from.x, dy = to.y - from.y, l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; };
  const ownEntity = () => entities.get(me);

  let lastMaintenance = -1e9; let wantRepair = false;
  const maintenance = async () => {
    const ch = character!;
    // quests: claim what is ready, accept the next story quest
    for (const aq of Object.values(ch.quests.active)) if (aq.ready) {
      const r = await act({ kind: 'claim_quest', questId: aq.id });
      if (r?.ok) { claimed++; if (aq.id === 'story_c1_q1') mark('firstStoryClaimed'); }
    }
    const st = tutorialStatus(ch);
    if (!st.step) mark('tutorialDone');
    if (!st.step) {
      const next = STORY_QUESTS.find((q) => Q.questAvailable(ch, q) && !ch.quests.active[q.id]);
      if (next && Object.values(ch.quests.active).filter((x) => !x.id.startsWith('tut_') && QUEST_BY_ID.get(x.id)?.kind === 'story').length < 1) {
        const r = await act({ kind: 'accept_quest', questId: next.id });
        if (r?.ok && next.id === 'story_c1_q1') mark('firstStoryAccepted');
      }
    }
    // workshop (only in the safe zone): craft the cheapest affordable thing, equip into empty slots
    const e = ownEntity();
    const h = home();
    if (e && Math.hypot(e.pos.x - h.x, e.pos.y - h.y) <= h.r) {
      const afford = CRAFTING_RECIPES.filter((r) => ch.level >= r.minLevel).sort((x, y) => x.costScrap - y.costScrap);
      for (const r of afford) { const res = await act({ kind: 'craft', recipeId: r.id }); if (res?.ok) { mark('firstCraft'); break; } }
      const v = ch.garage.find((x) => x.vehicleId === ch.activeVehicle)!;
      for (const slot of C.slotKeysFor(ch.activeVehicle)) {
        if (v.loadout[slot.key]) continue;
        const item = ch.inventory.find((i) => ITEM_BY_ID.get(i.defId)?.slotType === slot.type && !C.isEquipped(ch, i.uid));
        if (item) { const res = await act({ kind: 'equip', vehicleId: ch.activeVehicle, slot: slot.key, uid: item.uid }); if (res?.ok) mark('firstEquip'); }
      }
      if (st.step === 'garage') await act({ kind: 'tutorial', step: 'garage' });
      if (st.step === 'equip') await act({ kind: 'tutorial', step: 'equip' });
      if (st.step === 'gate') { await social({ op: 'dungeon_list' }); mark('firstGateList'); }
      // unspent talent points
      for (const t of ch.talentRanks ? [] : []) void t;
      wantRepair = false;
    }
    if (ch.level >= 10) { await social({ op: 'dungeon_list' }); mark('firstGateList'); }
  };

  const total = Math.round(opts.minutes * 60 * 30);
  let phase: 'hunt' | 'home' | 'gate' = 'hunt';
  for (let t = 0; t < total; t++) {
    await tick(); // one sim tick per loop; the bot thinks every 3rd tick (10 Hz)
    if (t % 3 !== 0) continue;
    const ch = character!;
    const e = ownEntity();
    if (!e) continue;
    if (e.hull <= 0) { deaths += 0; idleTicks++; continue; }
    // milestones
    if ((ch.stats['kills'] ?? 0) > lastKillsStat) { kills += (ch.stats['kills'] ?? 0) - lastKillsStat; lastKillsStat = ch.stats['kills'] ?? 0; mark('firstKill'); }
    if (ch.level >= 2) mark('level2'); if (ch.level >= 3) mark('level3'); if (ch.level >= 5) mark('level5'); if (ch.level >= 10) mark('level10');
    if ((ch.stats['crates'] ?? 0) > 0 || ch.wallet.scrap > 0) mark('firstLoot');
    const dMoved = Math.hypot(e.pos.x - lastPos.x, e.pos.y - lastPos.y); lastPos = { ...e.pos }; moved += dMoved;
    if (dMoved < 0.5 && !e.targetId) idleTicks++;

    const h = home();
    const needHome = ch.inventory.length >= C.inventoryCapacity(ch) - 1 || e.hull / e.maxHull < 0.35 || (t % (30 * 60 * 3) < 3 && t > 30 * 60);
    const stNow = tutorialStatus(ch);
    if (process.env.BOT_DEBUG && t % 300 === 0) console.error(minutes(), 'step', stNow.step, 'target', e.targetId, 'autoFire', e.autoFire, 'phase', phase, 'pos', Math.round(e.pos.x), Math.round(e.pos.y), 'map', mapId, 'active', Object.keys(ch.quests.active).join(','));
    if (needHome) phase = 'home';
    if (phase === 'home') {
      const d = Math.hypot(e.pos.x - h.x, e.pos.y - h.y);
      if (d > h.r * 0.6) { const v = dirTo(e.pos, h); input([{ type: 'Drive', x: v.x, y: v.y }]); continue; }
      input([{ type: 'Drive', x: 0, y: 0 }]);
      await maintenance();
      phase = stNow.step === 'portal' ? 'gate' : 'hunt';
      continue;
    }
    if (phase === 'gate') {
      const gate = map().gates?.[0];
      if (!gate) { phase = 'hunt'; continue; }
      const dg = Math.hypot(e.pos.x - gate.x, e.pos.y - gate.y);
      const v = dirTo(e.pos, gate); input(dg < gate.radius * 0.5 ? [{ type: 'Drive', x: 0, y: 0 }] : [{ type: 'Drive', x: v.x, y: v.y }]); // a human parks inside the gate ring until it opens
      if (mapId !== 1 && t > 0) phase = 'hunt';
      continue;
    }
    if (t - lastMaintenance > 30 * 25) { lastMaintenance = t; await maintenance(); }
    // tutorial helpers the human would trigger by tapping
    if (stNow.step === 'drive' && moved > 60) await act({ kind: 'tutorial', step: 'drive' });
    if (stNow.step === 'lock' && e.targetId !== undefined) await act({ kind: 'tutorial', step: 'lock' });
    if (stNow.step === 'fire' && e.autoFire) await act({ kind: 'tutorial', step: 'fire' });
    if (stNow.step === 'ability') input([{ type: 'UseAbility', abilityId: 'boost' }]);
    if (stNow.step === 'ammo') input([{ type: 'SelectAmmo', ammo: 'ARMOR_PIERCING' }]);
    if (stNow.step === 'garage' || stNow.step === 'equip' || stNow.step === 'gate') { phase = 'home'; continue; }
    if (stNow.step === 'portal') { phase = 'gate'; continue; }
    if (Object.values(ch.quests.active).some((q) => q.ready)) { lastMaintenance = -1e9; }

    // hunt: nearest hostile non-gate within 1400, else loot, else wander toward the middle
    let foe: SimEntity | undefined; let best = 1400;
    for (const o of entities.values()) { if (!o.isHostile || o.hull <= 0 || o.kind === 'gate' || o.kind === 'projectile' || o.kind === 'telegraph' || o.kind === 'mine') continue; const d = Math.hypot(o.pos.x - e.pos.x, o.pos.y - e.pos.y); if (d < best) { best = d; foe = o; } }
    let crate: SimEntity | undefined; let cb = 700;
    for (const o of entities.values()) { if (o.kind !== 'loot_crate') continue; const d = Math.hypot(o.pos.x - e.pos.x, o.pos.y - e.pos.y); if (d < cb) { cb = d; crate = o; } }
    if (crate && (!foe || best > 450)) { const v = dirTo(e.pos, crate.pos); input([{ type: 'Drive', x: v.x, y: v.y }]); continue; }
    if (foe) {
      const v = dirTo(e.pos, foe.pos);
      const hold = best < 320;
      const cmds: any[] = [{ type: 'Drive', x: hold ? -v.y * 0.5 : v.x, y: hold ? v.x * 0.5 : v.y }];
      if (e.targetId !== foe.id) cmds.push({ type: 'SetTarget', targetId: foe.id });
      if (!e.autoFire) cmds.push({ type: 'ToggleAutoFire' });
      input(cmds);
    } else {
      const wander = rnd() * Math.PI * 2; const center = { x: map().width / 2, y: map().height / 2 };
      const far = Math.hypot(e.pos.x - center.x, e.pos.y - center.y) > map().width * 0.35;
      const v = far ? dirTo(e.pos, center) : { x: Math.cos(wander), y: Math.sin(wander) };
      input([{ type: 'Drive', x: v.x, y: v.y }]);
    }
    void lastTick;
  }

  const st = tutorialStatus(character!);
  const report: NewbieReport = {
    minutes: opts.minutes, seed: opts.seed, finalLevel: character!.level, kills: Math.max(kills, character!.stats['kills'] ?? 0), firstMs: first,
    tutorial: { done: st.done, total: st.total, stuckOn: st.step }, idleSeconds: Math.round(idleTicks / 10), deaths, scrap: character!.wallet.scrap, questsClaimed: claimed,
  };
  ws.close(); await ctx.game.close();
  return report;
}

if (process.argv[1]?.endsWith('newbie-bot.ts')) {
  const rep = await runNewbie({ minutes: Number(arg('minutes', '30')), seed: Number(arg('seed', '1')) });
  console.log(JSON.stringify(rep, null, 2));
  process.exit(0);
}
