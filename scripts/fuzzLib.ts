/**
 * Fuzz helpers shared by test/fuzz.test.ts and scripts/fuzz.ts: a seeded generator of hostile client messages and
 * the invariants the server must keep no matter what it receives.
 */
import type { CharacterState } from '../shared/rules/character.ts';
import * as C from '../shared/rules/character.ts';
import { SimRNG } from '../shared/prng.ts';

export type Rng = () => number;
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const INF = '__INF__', NINF = '__NINF__';
/** JSON cannot carry NaN/Infinity; these markers are turned into `1e999` / `-1e999` (parsed as +-Infinity) on the wire. */
export const toWire = (v: unknown): string => JSON.stringify(v).split(`"${INF}"`).join('1e999').split(`"${NINF}"`).join('-1e999');

export interface FuzzContext {
  uids: string[]; names: string[]; defIds: string[]; ids: number[];
}

const pick = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)];
const STRINGS = ['', ' ', 'a', '__proto__', 'constructor', 'prototype', 'toString', '$where', '<script>alert(1)</script>', "' OR 1=1 --", '\u0000', '‮', '😀'.repeat(50), 'x'.repeat(5000), '0', '-1', 'NaN', 'Infinity', 'null', 'true', '[]', '{}', '../../etc/passwd', '\ud800'];
const NUMBERS: unknown[] = [0, -0, 1, -1, 0.5, -0.5, 2, 3, 7, 10, 100, 1e6, 1e9, 2 ** 31, 2 ** 53, -(2 ** 53), 1e308, -1e308, 1e-9, INF, NINF, 12345678901234567890];

export function evil(r: Rng, depth = 0): unknown {
  switch (Math.floor(r() * 9)) {
    case 0: return pick(r, NUMBERS);
    case 1: return pick(r, STRINGS);
    case 2: return null;
    case 3: return r() < 0.5;
    case 4: return depth < 2 ? Array.from({ length: Math.floor(r() * 4) }, () => evil(r, depth + 1)) : [];
    case 5: return depth < 2 ? JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}') : {};
    case 6: return depth < 2 ? Object.fromEntries(Array.from({ length: Math.floor(r() * 3) }, () => [pick(r, STRINGS).slice(0, 20), evil(r, depth + 1)])) : {};
    case 7: return undefined;
    default: return pick(r, NUMBERS);
  }
}

/** Mostly well-typed values with an occasional hostile one, so valid-looking requests reach deep into the handlers. */
const num = (r: Rng, ctx?: number[]): unknown => (r() < 0.25 ? evil(r) : ctx && ctx.length && r() < 0.6 ? pick(r, ctx) : pick(r, NUMBERS));
const str = (r: Rng, ctx?: string[]): unknown => (r() < 0.2 ? evil(r) : ctx && ctx.length && r() < 0.7 ? pick(r, ctx) : pick(r, STRINGS));

const ACTIONS = ['equip', 'unequip', 'upgrade', 'dismantle', 'craft', 'reroll', 'fuse', 'expand_inventory', 'buy_vehicle', 'set_vehicle', 'rank_talent', 'respec', 'accept_quest', 'claim_quest', 'abandon_quest', 'claim_season_tier', 'buy_ammo', 'tutorial', 'set_skin', 'change_faction', 'sell_item'];
const OPS = ['friend_request', 'friend_accept', 'friend_remove', 'friend_list', 'block', 'unblock', 'block_list', 'report', 'party_invite', 'party_accept', 'party_leave', 'party_kick', 'party_info', 'clan_create', 'clan_emblem', 'clan_invite', 'clan_accept', 'clan_invites', 'clan_leave', 'clan_kick', 'clan_role', 'clan_info', 'clan_donate', 'clan_research', 'clan_storage', 'clan_deposit', 'clan_withdraw', 'clan_storage_policy', 'clan_allies', 'clan_ally_propose', 'clan_ally_accept', 'clan_ally_decline', 'clan_ally_break', 'war_claim', 'war_status', 'profile', 'ranking', 'arena_queue', 'arena_leave', 'arena_status', 'war_status', 'ah_sell', 'ah_search', 'ah_mine', 'ah_buy', 'ah_cancel', 'mail_list', 'mail_claim', 'trade_open', 'trade_set', 'trade_confirm', 'trade_cancel', 'trade_info', 'fast_travel', 'dungeon_enter', 'dungeon_leave', 'dungeon_list', 'shop_list', 'shop_buy', 'shop_receipt'];
const COMMANDS = ['Drive', 'SetTarget', 'ToggleAutoFire', 'FireMain', 'UseAbility', 'SelectAmmo', 'EnterGate', 'Interact', 'Teleport', 'Spawn'];
const AMMO = ['STANDARD', 'REINFORCED', 'ARMOR_PIERCING', 'SHAPED_CHARGE', 'EXPLOSIVE'];

function genCommand(r: Rng, ctx: FuzzContext): unknown {
  const type = r() < 0.9 ? pick(r, COMMANDS) : evil(r);
  return { type, x: num(r), y: num(r), targetId: num(r, ctx.ids), abilityId: str(r, ['smoke', 'boost', 'repair_kit', 'fortify', 'emergency_shield']), ammo: r() < 0.7 ? pick(r, AMMO) : evil(r), enabled: evil(r) };
}

function genAction(r: Rng, ctx: FuzzContext): unknown {
  const kind = r() < 0.92 ? pick(r, ACTIONS) : evil(r);
  return {
    kind, vehicleId: str(r, ['veh_scout_t1', 'veh_medium_t1', 'veh_heavy_t1']), slot: str(r, ['main', 'armor', 'engine', 'module1']), uid: str(r, ctx.uids),
    recipeId: str(r), index: num(r), uids: r() < 0.8 ? [str(r, ctx.uids), str(r, ctx.uids), str(r, ctx.uids)] : evil(r), talentId: str(r), questId: str(r), tier: num(r),
    ammo: r() < 0.7 ? pick(r, AMMO) : evil(r), packs: num(r), step: str(r), skin: r() < 0.3 ? null : str(r), faction: str(r, ['coastal', 'highland', 'steppe']), safe: evil(r),
  };
}

function genSocial(r: Rng, ctx: FuzzContext): unknown {
  const op = r() < 0.93 ? pick(r, OPS) : evil(r);
  return {
    op, name: str(r, ctx.names), reason: str(r), tag: str(r), emblem: str(r, ['wolf', 'eagle']), clanId: num(r, ctx.ids), role: str(r, ['officer', 'member', 'leader']), amount: num(r), id: r() < 0.5 ? num(r, ctx.ids) : str(r),
    kind: str(r, ['level', 'clans', 'honor', 'arena_1v1']), mode: str(r, ['1v1', '3v3', '5v5']), uid: str(r, ctx.uids), price: num(r), hours: num(r, [12, 24, 48]), defId: str(r, ctx.defIds), slot: str(r), maxPrice: num(r),
    items: r() < 0.7 ? Array.from({ length: Math.floor(r() * 5) }, () => str(r, ctx.uids)) : evil(r), scrap: num(r), mapId: num(r, [1, 2, 13, 14, 30]), dungeonId: str(r), productId: str(r), platform: str(r, ['apple', 'google']), receipt: str(r),
  };
}

/** One hostile frame as wire text (or binary). */
export function genFrame(r: Rng, ctx: FuzzContext): string | Buffer {
  const k = r();
  if (k < 0.04) return Buffer.from(Array.from({ length: Math.floor(r() * 200) }, () => Math.floor(r() * 256)));
  if (k < 0.08) { const s = toWire({ type: 'c_chat', channel: 'G', text: 'x' }); return s.slice(0, Math.floor(r() * s.length)); } // truncated
  if (k < 0.1) return toWire({ type: 'c_chat', channel: 'G', text: 'A'.repeat(70_000) }); // over maxPayload
  if (k < 0.14) return toWire(evil(r));
  if (k < 0.17) return toWire(JSON.parse(`{"type":"${pick(r, ['c_input', 'c_social', 'c_action', 'c_chat', 'c_ping', 'c_join'])}","__proto__":{"x":1},"constructor":{"prototype":{"y":2}}}`));
  const t = r();
  let msg: any;
  if (t < 0.3) msg = { type: 'c_input', seq: r() < 0.7 ? Math.floor(r() * 1e6) : num(r), commands: r() < 0.9 ? Array.from({ length: Math.floor(r() * 24) }, () => genCommand(r, ctx)) : evil(r), clientTime: num(r) };
  else if (t < 0.5) msg = { type: 'c_action', id: num(r), action: r() < 0.95 ? genAction(r, ctx) : evil(r) };
  else if (t < 0.8) msg = { type: 'c_social', id: num(r), req: r() < 0.95 ? genSocial(r, ctx) : evil(r) };
  else if (t < 0.9) msg = { type: 'c_chat', channel: r() < 0.8 ? pick(r, ['G', 'M', 'F', 'C', 'P', 'W', 'T', 'S']) : evil(r), text: str(r), targetRecipient: str(r, ctx.names) };
  else if (t < 0.95) msg = { type: 'c_ping', timestamp: num(r) };
  else msg = { type: r() < 0.5 ? 'c_join' : evil(r), protocolVersion: str(r), accountId: str(r), secret: str(r) };
  return toWire(msg);
}

/** Invariants that must hold for a live character whatever was sent. Returns a list of violations. */
export function characterViolations(label: string, ch: CharacterState): string[] {
  const bad: string[] = [];
  const fin = (name: string, v: unknown, nonNeg = true) => { if (typeof v !== 'number' || !Number.isFinite(v) || (nonNeg && v < 0)) bad.push(`${label}: ${name} = ${String(v)}`); };
  fin('scrap', ch.wallet.scrap); fin('fragments', ch.wallet.fragments); fin('honor', ch.wallet.honor); fin('gateKeys', ch.wallet.gateKeys); fin('seasonMarks', ch.wallet.seasonMarks); fin('factionMarks', ch.wallet.factionMarks);
  for (const [k, v] of Object.entries(ch.wallet.ore)) fin(`ore.${k}`, v);
  fin('level', ch.level); fin('xp', ch.xp);
  const uids = new Set<string>();
  for (const it of ch.inventory) {
    if (uids.has(it.uid)) bad.push(`${label}: duplicate uid ${it.uid}`);
    uids.add(it.uid);
    if (!(it.upgrade >= 0 && it.upgrade <= C.MAX_UPGRADE && Number.isInteger(it.upgrade))) bad.push(`${label}: bad upgrade ${it.upgrade} on ${it.uid}`);
    if (!(it.rerolls >= 0 && it.rerolls <= C.MAX_REROLLS)) bad.push(`${label}: bad rerolls on ${it.uid}`);
    if (!C.RARITIES.includes(it.rarity)) bad.push(`${label}: bad rarity ${it.rarity}`);
  }
  if (ch.inventory.length > C.inventoryCapacity(ch)) bad.push(`${label}: inventory ${ch.inventory.length} > capacity ${C.inventoryCapacity(ch)}`);
  const equipped = new Map<string, string>();
  for (const g of ch.garage) for (const [slot, uid] of Object.entries(g.loadout)) {
    if (!uids.has(uid)) bad.push(`${label}: equipped ${uid} (${g.vehicleId}/${slot}) is not in the inventory`);
    const where = `${g.vehicleId}/${slot}`;
    if (equipped.has(uid)) bad.push(`${label}: ${uid} equipped twice (${equipped.get(uid)} and ${where})`);
    equipped.set(uid, where);
  }
  return bad;
}

/** Multiset signature of items (uids are reassigned on transfer, so identity is defId+rarity+upgrade+bound). */
export function itemMultiset(items: Array<{ defId: string; rarity: string; upgrade: number; bound: boolean }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) { const k = `${i.defId}|${i.rarity}|${i.upgrade}|${i.bound ? 1 : 0}`; out[k] = (out[k] ?? 0) + 1; }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Runner: real server + real WebSocket clients
// ---------------------------------------------------------------------------------------------
import WebSocket from 'ws';
import { createApp } from '../server/app.ts';
import { PROTOCOL_VERSION } from '../shared/protocol.ts';

export interface FuzzOptions { seed: number; clients?: number; framesPerClient?: number; batch?: number; log?: (s: string) => void }
export interface FuzzResult { violations: string[]; uncaught: string[]; sent: number; reconnects: number; seed: number; okResults: number; errResults: number; items: number }

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runFuzz(opts: FuzzOptions): Promise<FuzzResult> {
  process.env.LOAD_TEST = '1';
  const rng = makeRng(opts.seed);
  const ctx = createApp({ adminToken: 'fuzz' });
  const port = await ctx.game.listen(0);
  ctx.game.inboundLimit = { perSecond: 1e9, burst: 1e9 }; // hammer the handlers; the budget itself is tested separately
  const uncaught: string[] = [];
  const onErr = (e: unknown) => uncaught.push(String((e as Error)?.stack ?? e));
  process.on('uncaughtException', onErr);
  process.on('unhandledRejection', onErr);
  const violations: string[] = [];
  let sent = 0; let reconnects = 0; let okResults = 0; let errResults = 0;

  const guest = async () => (await (await fetch(`http://127.0.0.1:${port}/api/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ageConfirmed: true }) })).json()) as any;
  type Cl = { ws: WebSocket; id: string; name: string; cred: string; open: boolean };
  const connect = async (c: { id: string; name: string; cred: string }): Promise<Cl> => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const cl: Cl = { ws, id: c.id, name: c.name, cred: c.cred, open: true };
    ws.on('close', () => { cl.open = false; });
    ws.on('message', (d) => { try { const m = JSON.parse(d.toString()); if (m.type === 's_social_result' || m.type === 's_action_result') (m.ok ? okResults++ : errResults++); } catch { /* ignore */ } });
    ws.on('error', () => { /* expected after oversized frames */ });
    await new Promise<void>((r, j) => { ws.on('open', () => r()); ws.on('error', j); });
    const [a, s] = c.cred.split('.');
    ws.send(JSON.stringify({ type: 'c_join', protocolVersion: PROTOCOL_VERSION, accountId: a, secret: s }));
    const t = Date.now();
    while (!ctx.game.getSessionState(c.id)) { ctx.game.stepAll(); await wait(3); if (Date.now() - t > 4000) throw new Error('join timeout'); }
    return cl;
  };

  const n = opts.clients ?? 3;
  const people: Cl[] = [];
  for (let i = 0; i < n; i++) {
    const g = await guest();
    people.push(await connect({ id: g.accountId, name: g.name, cred: g.credential }));
  }
  // give everybody stuff to lose; befriend them so trades can open
  const fctx: FuzzContext = { uids: [], names: people.map((p) => p.name), defIds: [], ids: [] };
  for (const p of people) {
    const st = ctx.game.getSessionState(p.id)!;
    st.character.wallet.scrap = 50_000; st.character.wallet.fragments = 500; st.character.level = 20;
    for (const k of Object.keys(st.character.wallet.ore) as Array<keyof typeof st.character.wallet.ore>) st.character.wallet.ore[k] = 500;
    for (const def of ['wpn_cannon_t1', 'arm_reactive_t1', 'eng_speed_t1']) {
      const made = C.createItem(st.character, def, 'Common', new SimRNG(7));
      if (made.ok) { fctx.uids.push(made.item.uid); fctx.defIds.push(def); }
    }
  }
  for (let i = 0; i < people.length - 1; i++) { ctx.social.requestFriend(people[i].id, people[i + 1].id); ctx.social.acceptFriend(people[i + 1].id, people[i].id); }
  fctx.ids = [1, 2, 3, 4, 5, 6, 7, 8];

  const frames = opts.framesPerClient ?? 400; const batch = opts.batch ?? 25;
  for (let sentThis = 0; sentThis < frames; sentThis += batch) {
    for (let i = 0; i < people.length; i++) {
      let p = people[i];
      if (!p.open) { try { p = people[i] = await connect(p); reconnects++; } catch { continue; } }
      for (let k = 0; k < batch; k++) { try { p.ws.send(genFrame(rng, fctx) as any); sent++; } catch { break; } }
    }
    ctx.game.stepAll();
    await wait(2);
    ctx.game.stepAll();
    for (const p of people) {
      const st = ctx.game.getSessionState(p.id);
      if (st) violations.push(...characterViolations(p.name, st.character));
    }
    if (violations.length) break;
  }
  await wait(50); ctx.game.stepAll();

  // server still answers HTTP and a fresh client can join and ping
  try {
    const h = await fetch(`http://127.0.0.1:${port}/health`);
    if (!h.ok) violations.push('health check failed');
    const g = await guest();
    const fresh = await connect({ id: g.accountId, name: g.name, cred: g.credential });
    fresh.ws.close();
  } catch (e) { violations.push(`server unresponsive after fuzzing: ${String(e)}`); }

  // persisted == live: capture, disconnect (save on close), reload
  for (const p of people) {
    const st = ctx.game.getSessionState(p.id);
    if (!st) continue;
    violations.push(...characterViolations(p.name, st.character));
    const live = JSON.parse(JSON.stringify(st.character));
    p.ws.close();
    await wait(40); ctx.game.stepAll(); await wait(20);
    const row = ctx.profiles.get(p.id);
    if (!row) { violations.push(`${p.name}: profile missing after disconnect`); continue; }
    const back = JSON.parse(JSON.stringify(row.character));
    for (const key of ['wallet', 'inventory', 'garage', 'level', 'xp', 'talentRanks'] as const) {
      if (JSON.stringify(back[key]) !== JSON.stringify(live[key])) violations.push(`${p.name}: ${key} differs after DB reload`);
    }
    violations.push(...characterViolations(`${p.name} (reloaded)`, row.character));
  }
  if (({} as any).polluted !== undefined) violations.push('Object.prototype was polluted');

  process.off('uncaughtException', onErr);
  process.off('unhandledRejection', onErr);
  await ctx.game.close();
  return { violations, uncaught, sent, reconnects, seed: opts.seed, okResults, errResults, items: fctx.uids.length };
}
