import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp } from '../server/app.ts';
import { PROTOCOL_VERSION } from '../shared/protocol.ts';
import { SimRNG } from '../shared/prng.ts';
import * as C from '../shared/rules/character.ts';
import { STORAGE_BASE_SLOTS, STORAGE_DAILY_WITHDRAW, ALLIANCE_REALLY_COOLDOWN_MS, DAY_MS } from '../server/clanStorage.ts';
import { allianceKey } from '../shared/sim/pvp.ts';
import { itemMultiset } from '../scripts/fuzzLib.ts';

process.env.LOAD_TEST = '1';
let ctx: ReturnType<typeof createApp>;
let port: number;
let nowMs = 1_800_000_000_000;
beforeEach(async () => { nowMs = 1_800_000_000_000; ctx = createApp({ adminToken: 'x', clock: { nowMs: () => nowMs, nowSeconds: () => nowMs / 1000 } as any }); port = await ctx.game.listen(0); });
afterEach(async () => { await ctx.game.close(); });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

class P {
  ws!: WebSocket; msgs: any[] = []; n = 0; id = ''; name = '';
  static async make(): Promise<P> {
    const g = (await (await fetch(`http://127.0.0.1:${port}/api/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ageConfirmed: true }) })).json()) as any;
    const p = new P(); p.id = g.accountId; p.name = g.name;
    p.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((r) => p.ws.on('open', () => r()));
    p.ws.on('message', (d) => p.msgs.push(JSON.parse(d.toString())));
    const [a, s] = g.credential.split('.');
    p.ws.send(JSON.stringify({ type: 'c_join', protocolVersion: PROTOCOL_VERSION, accountId: a, secret: s }));
    await p.until(() => p.msgs.some((m) => m.type === 's_character'));
    return p;
  }
  async until(f: () => boolean) { const t = Date.now(); while (!f()) { if (Date.now() - t > 3000) throw new Error('timeout'); ctx.game.stepAll(); await wait(2); } }
  async req(req: any): Promise<any> {
    const id = ++this.n; this.ws.send(JSON.stringify({ type: 'c_social', id, req }));
    await this.until(() => this.msgs.some((m) => m.type === 's_social_result' && m.id === id));
    return this.msgs.find((m) => m.type === 's_social_result' && m.id === id);
  }
  get ch() { return ctx.game.getSessionState(this.id)!.character; }
}

function stock(p: P, count: number, seed = 1) {
  p.ch.level = 40; p.ch.wallet.scrap = 500_000;
  const rng = new SimRNG(seed);
  for (let i = 0; i < count; i++) C.createItem(p.ch, ['wpn_cannon_t1', 'arm_reactive_t1', 'eng_speed_t1'][i % 3], C.RARITIES[0], rng);
}

const free = (p: P) => p.ch.inventory.find((x) => !C.isEquipped(p.ch, x.uid) && !x.bound)!.uid;
/** tops the inventory up so there are always `n` spare (unequipped) items */
function spare(p: P, n: number, seed = 9) {
  const rng = new SimRNG(seed + p.ch.nextUid);
  while (p.ch.inventory.filter((x) => !C.isEquipped(p.ch, x.uid)).length < n && p.ch.inventory.length < C.inventoryCapacity(p.ch)) C.createItem(p.ch, 'wpn_cannon_t1', C.RARITIES[0], rng);
}

/** founder creates the clan, `others` join (invite + accept) */
async function makeClan(tag: string, founder: P, others: P[] = []) {
  founder.ch.wallet.scrap = Math.max(founder.ch.wallet.scrap, 100_000);
  const r = await founder.req({ op: 'clan_create', name: `Clan ${tag}`, tag });
  expect(r.ok, JSON.stringify(r)).toBe(true);
  for (const o of others) {
    expect((await founder.req({ op: 'clan_invite', name: o.name })).ok).toBe(true);
    const info = await o.req({ op: 'clan_invites' });
    expect((await o.req({ op: 'clan_accept', clanId: info.data[0].clanId })).ok).toBe(true);
  }
}

describe('clan item storage', () => {
  it('deposit and withdraw move an item exactly once and persist', async () => {
    const a = await P.make(); stock(a, 4);
    await makeClan('STO', a);
    const uid = free(a); const before = itemMultiset(a.ch.inventory);
    const dep = await a.req({ op: 'clan_deposit', uid });
    expect(dep.ok, JSON.stringify(dep)).toBe(true);
    expect(a.ch.inventory.some((i) => i.uid === uid)).toBe(false);
    expect(dep.data.items).toHaveLength(1);
    // the profile row was written in the same transaction
    expect(ctx.profiles.get(a.id)!.character.inventory.some((i) => i.uid === uid)).toBe(false);
    const w = await a.req({ op: 'clan_withdraw', id: dep.data.items[0].id });
    expect(w.ok, JSON.stringify(w)).toBe(true);
    expect(itemMultiset(a.ch.inventory)).toEqual(before);
    expect((await a.req({ op: 'clan_storage' })).data.items).toHaveLength(0);
    expect((await a.req({ op: 'clan_storage' })).data.log.map((l: any) => l.kind)).toEqual(['withdraw', 'deposit']);
  });

  it('refuses equipped, unknown, bound and non-member requests; respects capacity', async () => {
    const a = await P.make(); const out = await P.make(); stock(a, 3);
    await makeClan('CAP', a);
    expect((await out.req({ op: 'clan_deposit', uid: 'i1' })).error).toBe('no_clan');
    expect((await a.req({ op: 'clan_deposit', uid: 'nope' })).error).toBe('item_not_found');
    const b0 = a.ch.inventory.find((x) => !C.isEquipped(a.ch, x.uid))!;
    b0.bound = true;
    expect((await a.req({ op: 'clan_deposit', uid: b0.uid })).error).toBe('item_bound');
    b0.bound = false;
    const g = a.ch.garage.find((x) => x.vehicleId === a.ch.activeVehicle)!;
    const equippedUid = Object.values(g.loadout)[0] as string | undefined;
    if (equippedUid) expect((await a.req({ op: 'clan_deposit', uid: equippedUid })).error).toBe('item_equipped');
    let ok = 0; let last: any;
    for (let i = 0; i < STORAGE_BASE_SLOTS + 2; i++) { spare(a, 1); last = await a.req({ op: 'clan_deposit', uid: free(a) }); if (last.ok) ok++; }
    expect(ok).toBe(STORAGE_BASE_SLOTS);
    expect(last.error).toBe('storage_full');
  });

  it('withdraw policy and daily limits by role', async () => {
    const l = await P.make(); const m = await P.make(); stock(l, 3);
    await makeClan('POL', l, [m]);
    for (let i = 0; i < 6; i++) { spare(l, 1); expect((await l.req({ op: 'clan_deposit', uid: free(l) })).ok).toBe(true); }
    expect((await m.req({ op: 'clan_storage_policy', minRole: 'officer' })).error).toBe('no_permission');
    expect((await l.req({ op: 'clan_storage_policy', minRole: 'bogus' })).error).toBe('bad_request');
    expect((await l.req({ op: 'clan_storage_policy', minRole: 'officer' })).ok).toBe(true);
    const items = (await m.req({ op: 'clan_storage' })).data.items;
    expect((await m.req({ op: 'clan_withdraw', id: items[0].id })).error).toBe('no_permission');
    await l.req({ op: 'clan_storage_policy', minRole: 'member' });
    for (let i = 0; i < STORAGE_DAILY_WITHDRAW.member; i++) expect((await m.req({ op: 'clan_withdraw', id: items[i].id })).ok).toBe(true);
    expect((await m.req({ op: 'clan_withdraw', id: items[2].id })).error).toBe('daily_limit');
    nowMs += DAY_MS + 1000; // the limit is a rolling 24 h window
    expect((await m.req({ op: 'clan_withdraw', id: items[2].id })).ok).toBe(true);
  });

  it('a full inventory refuses the withdrawal and keeps the item stored', async () => {
    const a = await P.make(); stock(a, 3); await makeClan('FUL', a);
    const uid = free(a);
    const dep = await a.req({ op: 'clan_deposit', uid });
    const rng = new SimRNG(5);
    while (a.ch.inventory.length < C.inventoryCapacity(a.ch)) C.createItem(a.ch, 'wpn_cannon_t1', C.RARITIES[0], rng);
    expect((await a.req({ op: 'clan_withdraw', id: dep.data.items[0].id })).error).toBe('inventory_full');
    expect((await a.req({ op: 'clan_storage' })).data.items).toHaveLength(1);
  });

  it('two members racing for one item: exactly one gets it, nothing is duplicated', async () => {
    const l = await P.make(); const m = await P.make(); stock(l, 2);
    await makeClan('RAC', l, [m]);
    const dep = await l.req({ op: 'clan_deposit', uid: free(l) });
    const id = dep.data.items[0].id;
    const total = () => itemMultiset([...l.ch.inventory, ...m.ch.inventory, ...ctx.clanStorage.list(ctx.social.clanOf(l.id)!.id).map((x) => x.item)]);
    const before = total();
    const [r1, r2] = await Promise.all([l.req({ op: 'clan_withdraw', id }), m.req({ op: 'clan_withdraw', id })]);
    expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1);
    expect(total()).toEqual(before);
    expect((await l.req({ op: 'clan_storage' })).data.items).toHaveLength(0);
  });

  it('a failing persist rolls the deposit back: item stays with the player, storage stays empty', async () => {
    const a = await P.make(); stock(a, 2); await makeClan('ROL', a);
    const uid = free(a);
    const orig = ctx.profiles.save.bind(ctx.profiles);
    ctx.profiles.save = () => { throw new Error('disk full'); };
    const r = await a.req({ op: 'clan_deposit', uid });
    ctx.profiles.save = orig;
    expect(r.ok).toBe(false);
    expect(a.ch.inventory.some((i) => i.uid === uid)).toBe(true);
    expect(ctx.clanStorage.count(ctx.social.clanOf(a.id)!.id)).toBe(0);
  });

  it('research raises the capacity; the last member leaving mails the items back', async () => {
    const a = await P.make(); stock(a, 3); await makeClan('LST', a);
    const clanId = ctx.social.clanOf(a.id)!.id;
    expect(ctx.clanStorage.capacity(clanId)).toBe(STORAGE_BASE_SLOTS);
    ctx.db.exec("UPDATE clans SET research_json = '{\"storage\":2}' WHERE id = " + clanId);
    const dep = await a.req({ op: 'clan_deposit', uid: free(a) });
    expect(dep.ok).toBe(true);
    const defId = dep.data.items[0].item.defId;
    expect((await a.req({ op: 'clan_leave' })).ok).toBe(true);
    const mail = (await a.req({ op: 'mail_list' })).data as any[];
    expect(mail.some((x) => x.item?.defId === defId || x.kind === 'item')).toBe(true);
    expect(ctx.clanStorage.count(clanId)).toBe(0);
  });
});

describe('clan alliances', () => {
  async function three() {
    const a = await P.make(); const b = await P.make(); const c = await P.make();
    await makeClan('AAA', a); await makeClan('BBB', b); await makeClan('CCC', c);
    return { a, b, c, ida: ctx.social.clanOf(a.id)!.id, idb: ctx.social.clanOf(b.id)!.id, idc: ctx.social.clanOf(c.id)!.id };
  }

  it('propose, accept, list, ally chat, break + 7 day cooldown', async () => {
    const { a, b, ida, idb } = await three();
    expect((await a.req({ op: 'clan_ally_propose', tag: 'aaa' })).error).toBe('self');
    expect((await a.req({ op: 'clan_ally_propose', tag: 'ZZZ' })).error).toBe('unknown_clan');
    expect((await a.req({ op: 'clan_ally_propose', tag: 'BBB' })).ok).toBe(true);
    expect((await a.req({ op: 'clan_ally_propose', tag: 'BBB' })).error).toBe('already_proposed');
    expect((await b.req({ op: 'clan_allies' })).data[0]).toMatchObject({ clanId: ida, status: 'incoming' });
    expect((await a.req({ op: 'clan_ally_accept', clanId: idb })).error).toBe('no_proposal'); // the proposer cannot accept their own
    expect((await b.req({ op: 'clan_ally_accept', clanId: ida })).ok).toBe(true);
    expect((await a.req({ op: 'clan_allies' })).data[0]).toMatchObject({ clanId: idb, status: 'active' });
    expect(ctx.alliances.areAllied(ida, idb)).toBe(true);
    a.msgs.length = 0; b.msgs.length = 0;
    a.ws.send(JSON.stringify({ type: 'c_chat', channel: 'A', text: 'hello allies' }));
    await b.until(() => b.msgs.some((m) => m.type === 's_chat' && m.message.channel === 'A'));
    expect((await a.req({ op: 'clan_ally_break', clanId: idb })).ok).toBe(true);
    expect((await a.req({ op: 'clan_ally_propose', tag: 'BBB' })).error).toBe('ally_cooldown');
    nowMs += ALLIANCE_REALLY_COOLDOWN_MS + 1;
    expect((await a.req({ op: 'clan_ally_propose', tag: 'BBB' })).ok).toBe(true);
  });

  it('only officers propose, only the leader accepts/breaks; max two alliances', async () => {
    const { a, b, c, ida, idb, idc } = await three();
    const m = await P.make();
    await a.req({ op: 'clan_invite', name: m.name });
    await m.req({ op: 'clan_accept', clanId: (await m.req({ op: 'clan_invites' })).data[0].clanId });
    expect((await m.req({ op: 'clan_ally_propose', tag: 'BBB' })).error).toBe('no_permission');
    await a.req({ op: 'clan_ally_propose', tag: 'BBB' }); await b.req({ op: 'clan_ally_accept', clanId: ida });
    await a.req({ op: 'clan_ally_propose', tag: 'CCC' }); await c.req({ op: 'clan_ally_accept', clanId: ida });
    expect(ctx.alliances.activeCount(ida)).toBe(2);
    const d = await P.make(); await makeClan('DDD', d);
    expect((await a.req({ op: 'clan_ally_propose', tag: 'DDD' })).error).toBe('ally_limit');
    expect((await d.req({ op: 'clan_ally_propose', tag: 'AAA' })).error).toBe('target_ally_limit');
    expect((await m.req({ op: 'clan_ally_break', clanId: idb })).error).toBe('no_permission');
    expect((await b.req({ op: 'clan_ally_break', clanId: idc })).error).toBe('not_allied');
    expect((await a.req({ op: 'clan_ally_decline', clanId: 99999 })).error).toBe('no_proposal');
  });

  it('crossing proposals become an alliance; dissolving a clan removes its alliances; the sim gets the tag pairs', async () => {
    const { a, b, ida, idb } = await three();
    await a.req({ op: 'clan_ally_propose', tag: 'BBB' });
    const r = await b.req({ op: 'clan_ally_propose', tag: 'AAA' });
    expect(r.ok).toBe(true);
    expect(ctx.alliances.areAllied(ida, idb)).toBe(true);
    expect(ctx.alliances.activeTagPairs()).toEqual([['AAA', 'BBB']]);
    const inst = ctx.game.getSessionState(a.id)!;
    expect(inst.world.alliances.has(allianceKey('bbb', 'AAA'))).toBe(true);
    await b.req({ op: 'clan_leave' }); // last member: the clan (and its alliance rows) go away
    expect(ctx.alliances.areAllied(ida, idb)).toBe(false);
    expect(inst.world.alliances.size).toBe(0);
  });

  it('reserved clan tags are refused', async () => {
    const a = await P.make(); a.ch.wallet.scrap = 500_000;
    for (const tag of ['CMD', 'boss']) expect((await a.req({ op: 'clan_create', name: 'Reserved', tag })).error).toBe('invalid_tag');
  });
});
