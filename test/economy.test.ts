import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp } from '../server/app.ts';
import { AUCTION_MAX_LISTINGS, priceBand, auctionTax, SHOP_CATALOG, PremiumWallet } from '../server/market.ts';
import { PROTOCOL_VERSION } from '../shared/protocol.ts';
import { FLAGS } from '../shared/flags.ts';
import { ITEM_CATALOG } from '../shared/data/items.ts';
import { SimRNG } from '../shared/prng.ts';
import * as C from '../shared/rules/character.ts';

process.env.LOAD_TEST = '1';
let ctx: ReturnType<typeof createApp>; let port: number;
beforeEach(async () => { ctx = createApp({}); port = await ctx.game.listen(0); });
afterEach(async () => { FLAGS.premiumCurrencyEnabled = false; await ctx.game.close(); });

class P {
  ws!: WebSocket; msgs: any[] = []; id = ''; name = ''; n = 0;
  static async make(): Promise<P> {
    const p = new P();
    const g = await (await fetch(`http://127.0.0.1:${port}/api/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ageConfirmed: true }) })).json() as any;
    p.id = g.accountId; p.name = g.name;
    p.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((r) => p.ws.on('open', () => r()));
    p.ws.on('message', (d) => p.msgs.push(JSON.parse(d.toString())));
    const [a, s] = g.credential.split('.');
    p.ws.send(JSON.stringify({ type: 'c_join', protocolVersion: PROTOCOL_VERSION, accountId: a, secret: s }));
    await p.until(() => p.msgs.some((m) => m.type === 's_character'));
    ctx.db.exec(`UPDATE accounts SET created_at = ${Date.now() - 10 * 86400_000} WHERE id = '${p.id}'`);
    return p;
  }
  async until(f: () => boolean, ms = 3000) { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout'); ctx.game.stepAll(); await new Promise((r) => setTimeout(r, 4)); } }
  async req(req: any): Promise<any> {
    const id = ++this.n; this.ws.send(JSON.stringify({ type: 'c_social', id, req }));
    await this.until(() => this.msgs.some((m) => m.type === 's_social_result' && m.id === id));
    return this.msgs.find((m) => m.type === 's_social_result' && m.id === id);
  }
  async act(action: any): Promise<any> {
    const id = ++this.n; this.ws.send(JSON.stringify({ type: 'c_action', id, action }));
    await this.until(() => this.msgs.some((m) => m.type === 's_action_result' && m.id === id));
    return this.msgs.find((m) => m.type === 's_action_result' && m.id === id);
  }
  st() { return ctx.game.getSessionState(this.id)!; }
  close() { this.ws.close(); }
}
const wpn = ITEM_CATALOG.find((i) => i.id === 'wpn_cannon_t3')!;
const give = (p: P, defId = wpn.id, rarity: any = 'Rare') => (C.createItem(p.st().character, defId, rarity, new SimRNG(Math.floor(Math.random() * 1e6))) as any).item as C.ItemInstance;

describe('Auction house', () => {
  it('list -> search -> buy: price band, tax, mail proceeds, hub only, own listing, equipped/bound refused, listing cap, account age', async () => {
    const a = await P.make(); const b = await P.make();
    const item = give(a);
    expect((await a.req({ op: 'ah_sell', uid: item.uid, price: 1000, hours: 24 })).error).toBe('hub_only');
    ctx.game.adminTeleport(a.id, 13); ctx.game.adminTeleport(b.id, 13);
    const band = priceBand(wpn.id)!;
    expect((await a.req({ op: 'ah_sell', uid: item.uid, price: band.min - 1, hours: 24 })).error).toBe('price_out_of_range');
    expect((await a.req({ op: 'ah_sell', uid: item.uid, price: band.max + 1, hours: 24 })).error).toBe('price_out_of_range');
    expect((await a.req({ op: 'ah_sell', uid: item.uid, price: band.min * 4, hours: 5 })).error).toBe('bad_duration');
    const price = band.min * 4;
    const sold = await a.req({ op: 'ah_sell', uid: item.uid, price, hours: 24 });
    expect(sold.ok).toBe(true);
    expect(a.st().character.inventory.find((i) => i.uid === item.uid)).toBeUndefined(); // escrowed
    const found = (await b.req({ op: 'ah_search', defId: wpn.id })).data;
    expect(found).toHaveLength(1);
    expect((await a.req({ op: 'ah_buy', id: found[0].id })).error).toBe('own_listing');
    expect((await b.req({ op: 'ah_buy', id: found[0].id })).error).toBe('not_enough_scrap');
    b.st().character.wallet.scrap = price + 100;
    const sellerBefore = a.st().character.wallet.scrap;
    const buy = await b.req({ op: 'ah_buy', id: found[0].id });
    expect(buy.ok).toBe(true);
    const tax = Math.floor(price * 0.05);
    expect(buy.data.tax).toBe(tax);
    expect(b.st().character.wallet.scrap).toBe(100);
    expect(b.st().character.inventory.some((i) => i.defId === wpn.id && i.rarity === 'Rare')).toBe(true);
    expect(a.st().character.wallet.scrap).toBe(sellerBefore + price - tax); // online seller is paid directly
    expect((await b.req({ op: 'ah_buy', id: found[0].id })).error).toBe('not_found'); // already sold

    // equipped and bound items cannot be listed
    const eq = a.st().character.inventory.find((i) => C.isEquipped(a.st().character, i.uid))!;
    expect((await a.req({ op: 'ah_sell', uid: eq.uid, price: 100000, hours: 12 })).error).toBe('item_equipped');
    const bound = give(a); bound.bound = true;
    expect((await a.req({ op: 'ah_sell', uid: bound.uid, price: band.min * 2, hours: 12 })).error).toBe('item_bound');

    // listing cap
    for (let i = 0; i < AUCTION_MAX_LISTINGS; i++) { const it = give(a); expect((await a.req({ op: 'ah_sell', uid: it.uid, price: band.min * 2, hours: 12 })).ok).toBe(true); }
    const extra = give(a);
    expect((await a.req({ op: 'ah_sell', uid: extra.uid, price: band.min * 2, hours: 12 })).error).toBe('too_many_listings');
    // cancel returns the item by mail
    const mine = (await a.req({ op: 'ah_mine' })).data;
    expect((await a.req({ op: 'ah_cancel', id: mine[0].id })).ok).toBe(true);
    const mail = (await a.req({ op: 'mail_list' })).data;
    expect(mail[0].kind).toBe('item');
    expect((await a.req({ op: 'mail_claim', id: mail[0].id })).ok).toBe(true);
    a.close(); b.close();
  });

  it('new accounts (< 3 days) cannot sell; expired listings return the item by mail; offline sellers get proceeds by mail; daily volume cap', async () => {
    const a = await P.make(); const b = await P.make();
    ctx.db.exec(`UPDATE accounts SET created_at = ${Date.now()} WHERE id = '${a.id}'`);
    ctx.game.adminTeleport(a.id, 13); ctx.game.adminTeleport(b.id, 13);
    const it = give(a);
    expect((await a.req({ op: 'ah_sell', uid: it.uid, price: priceBand(wpn.id)!.min * 2, hours: 12 })).error).toBe('account_too_new');
    ctx.db.exec(`UPDATE accounts SET created_at = ${Date.now() - 9 * 86400_000} WHERE id = '${a.id}'`);
    const l = await a.req({ op: 'ah_sell', uid: it.uid, price: priceBand(wpn.id)!.min * 2, hours: 12 });
    expect(l.ok).toBe(true);
    // expire it
    ctx.db.exec(`UPDATE auctions SET expires_at = ${Date.now() - 1000}`);
    ctx.game.sweepAuctions();
    expect((await a.req({ op: 'ah_search' })).data).toEqual([]);
    expect((await a.req({ op: 'mail_list' })).data.some((m: any) => m.kind === 'item')).toBe(true);
    // seller offline -> proceeds arrive by mail
    const it2 = give(a);
    const l2 = await a.req({ op: 'ah_sell', uid: it2.uid, price: 5000, hours: 12 });
    a.close();
    await b.until(() => ctx.game.getSessionState(a.id) === undefined);
    b.st().character.wallet.scrap = 10000;
    expect((await b.req({ op: 'ah_buy', id: l2.data.id })).ok).toBe(true);
    expect(ctx.market.mail(a.id).some((m) => m.kind === 'scrap' && Number(m.payload) === 5000 - 250)).toBe(true);
    // daily cap
    const it3 = give(b);
    const l3 = await b.req({ op: 'ah_sell', uid: it3.uid, price: priceBand(wpn.id)!.min * 2, hours: 12 });
    ctx.market.addVolume(b.id, 1_999_999);
    const c = await P.make(); ctx.game.adminTeleport(c.id, 13); c.st().character.wallet.scrap = 1e9;
    expect((await c.req({ op: 'ah_buy', id: l3.data.id })).error).toBe('seller_trade_cap');
    b.close(); c.close();
  });
});

describe('Direct trade, NPC vendors, fast travel', () => {
  it('trade needs friends/clan, both confirmations, resets on change, swaps atomically; bound items refused', async () => {
    const a = await P.make(); const b = await P.make(); const c = await P.make();
    expect((await a.req({ op: 'trade_open', name: b.name })).error).toBe('friends_or_clan_only');
    await a.req({ op: 'friend_request', name: b.name }); await b.req({ op: 'friend_accept', name: a.name });
    expect((await a.req({ op: 'trade_open', name: b.name })).ok).toBe(true);
    expect((await a.req({ op: 'trade_open', name: b.name })).error).toBe('already_trading');
    const it = give(a); const bound = give(a); bound.bound = true;
    expect((await a.req({ op: 'trade_set', items: [bound.uid], scrap: 0 })).error).toBe('item_bound');
    expect((await a.req({ op: 'trade_set', items: [it.uid], scrap: 999999 })).error).toBe('not_enough_scrap');
    a.st().character.wallet.scrap = 500; b.st().character.wallet.scrap = 100;
    expect((await a.req({ op: 'trade_set', items: [it.uid], scrap: 200 })).ok).toBe(true);
    expect((await b.req({ op: 'trade_set', items: [], scrap: 50 })).ok).toBe(true);
    await a.req({ op: 'trade_confirm' });
    await b.req({ op: 'trade_set', items: [], scrap: 60 }); // change resets confirmations
    const view = (await a.req({ op: 'trade_info' })).data;
    expect(view.iConfirmed).toBe(false);
    await a.req({ op: 'trade_confirm' });
    const done = await b.req({ op: 'trade_confirm' });
    expect(done.ok).toBe(true);
    expect(a.st().character.inventory.find((i) => i.uid === it.uid)).toBeUndefined();
    expect(b.st().character.inventory.some((i) => i.defId === it.defId && i.rarity === it.rarity)).toBe(true);
    expect(a.st().character.wallet.scrap).toBe(500 - 200 + 60);
    expect(b.st().character.wallet.scrap).toBe(100 + 200 - 60);
    expect((await a.req({ op: 'trade_info' })).data).toBeNull();
    a.close(); b.close(); c.close();
  });

  it('reputation raises the NPC sell value and cuts the auction tax; skins need to be owned', async () => {
    const a = await P.make();
    const ch = a.st().character;
    const it = give(a, 'wpn_cannon_t2', 'Common');
    const base = C.npcSellValue(it, ch);
    ch.reputation[ch.faction] = 7000;
    expect(C.npcSellValue(it, ch)).toBeGreaterThan(base);
    expect(auctionTax(10000, ch)).toBeLessThan(auctionTax(10000, { ...ch, reputation: {} }));
    expect((await a.act({ kind: 'set_skin', skin: 'skin_season_ember' })).error).toBe('skin_not_owned');
    ch.season.skins.push('skin_season_ember');
    expect((await a.act({ kind: 'set_skin', skin: 'skin_season_ember' })).ok).toBe(true);
    expect(a.st().character.activeSkin).toBe('skin_season_ember');
    expect(a.st().entity.skin).toBe('skin_season_ember');
    a.close();
  });

  it('NPC vendor pays a fraction in a safe zone only; fast travel only to visited maps, costs scrap by distance, refuses outside safe zones', async () => {
    const a = await P.make();
    const it = give(a, 'wpn_cannon_t2', 'Common');
    const before = a.st().character.wallet.scrap;
    const r = await a.act({ kind: 'sell_item', uid: it.uid });
    expect(r.ok).toBe(true);
    expect(a.st().character.wallet.scrap).toBe(before + C.npcSellValue({ ...it }, a.st().character));
    expect(C.npcSellValue(it, a.st().character)).toBeLessThan(ITEM_CATALOG.find((i) => i.id === 'wpn_cannon_t2')!.scrapValue);
    const eq = a.st().character.inventory.find((i) => C.isEquipped(a.st().character, i.uid))!;
    expect((await a.act({ kind: 'sell_item', uid: eq.uid })).error).toBe('item_equipped');

    a.st().character.wallet.scrap = 100000; a.st().character.level = 40;
    expect((await a.req({ op: 'fast_travel', mapId: 13 })).error).toBe('not_visited');
    ctx.game.adminTeleport(a.id, 13);
    expect(a.st().character.visitedMaps).toContain(13);
    const cost = C.fastTravelCost(5); // 13 -> 14 -> 4 -> 3 -> 2 -> 1
    const go = await a.req({ op: 'fast_travel', mapId: 1 });
    expect(go).toMatchObject({ ok: true, data: { cost } });
    expect(a.st().mapId).toBe(1);
    expect(a.st().character.wallet.scrap).toBeGreaterThanOrEqual(100000 - cost); // achievements may add rewards
    ctx.game.getWorld(a.id)!.safeZones = [];
    expect((await a.req({ op: 'fast_travel', mapId: 13 })).error).toBe('safe_zone_only');
    a.close();
  });
});

describe('Premium currency model (disabled by flag)', () => {
  it('everything refuses while the flag is off; when on: idempotent credits, purchases deduct, no loot boxes in the catalogue, receipts rejected by the stub', async () => {
    const a = await P.make();
    expect((await a.req({ op: 'shop_list' })).error).toBe('disabled');
    expect((await a.req({ op: 'shop_buy', productId: 'garage_slot' })).error).toBe('disabled');
    expect((await a.req({ op: 'shop_receipt', platform: 'apple', receipt: 'x' })).error).toBe('disabled');
    const w = new PremiumWallet(ctx.db);
    const ch = C.createCharacter('T');
    expect(w.credit(ch, a.id, 100, 'test')).toEqual({ ok: false, error: 'disabled' });
    expect(ch.wallet.cells).toBe(0);

    FLAGS.premiumCurrencyEnabled = true;
    expect(w.credit(ch, a.id, 300, 'iap', 'apple:T1')).toMatchObject({ ok: true, balance: 300 });
    expect(w.credit(ch, a.id, 300, 'iap', 'apple:T1')).toMatchObject({ ok: true, balance: 300, duplicate: true }); // same receipt twice
    expect(ch.wallet.cells).toBe(300);
    expect(w.purchase(ch, a.id, 'nope')).toEqual({ ok: false, error: 'unknown_product' });
    expect(w.purchase(ch, a.id, 'skin_desert_storm')).toEqual({ ok: false, error: 'not_enough_cells' });
    expect(w.purchase(ch, a.id, 'garage_slot')).toMatchObject({ ok: false });
    expect(w.purchase(ch, a.id, 'inv_slots_10')).toMatchObject({ ok: true, balance: 100 });
    expect(w.history(a.id)).toHaveLength(2);
    expect(SHOP_CATALOG.every((p) => !/box|crate|random|gacha/i.test(p.id + p.nameKey))).toBe(true);
    expect((await a.req({ op: 'shop_list' })).ok).toBe(true);
    expect((await a.req({ op: 'shop_receipt', platform: 'apple', receipt: 'fake' })).error).toBe('invalid_receipt');
    a.close();
  });
});
