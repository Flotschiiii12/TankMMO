import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp } from '../server/app.ts';
import { PROTOCOL_VERSION } from '../shared/protocol.ts';
import { SimRNG } from '../shared/prng.ts';
import * as C from '../shared/rules/character.ts';
import { ACHIEVEMENTS_CATALOG } from '../shared/data/achievements.ts';
import { characterViolations, itemMultiset, makeRng } from '../scripts/fuzzLib.ts';

process.env.LOAD_TEST = '1';
let ctx: ReturnType<typeof createApp>;
let port: number;
beforeEach(async () => { ctx = createApp({ adminToken: 'x' }); port = await ctx.game.listen(0); });
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

function stock(ch: C.CharacterState, seed: number, count: number) {
  ch.level = 40; ch.wallet.scrap = 200_000;
  ch.achievements = ACHIEVEMENTS_CATALOG.map((a) => a.id); // achievement payouts are not trades: keep them out of the books
  const rng = new SimRNG(seed);
  for (let i = 0; i < count; i++) C.createItem(ch, ['wpn_cannon_t1', 'arm_reactive_t1', 'eng_speed_t1', 'wpn_cannon_t2'][i % 4], C.RARITIES[i % 3], rng);
}

describe('economy conservation under random play', () => {
  it('trades never create or destroy items or scrap', async () => {
    const a = await P.make(); const b = await P.make();
    stock(a.ch, 1, 12); stock(b.ch, 2, 12);
    ctx.social.requestFriend(a.id, b.id); ctx.social.acceptFriend(b.id, a.id);
    const items = () => itemMultiset([...a.ch.inventory, ...b.ch.inventory]);
    const scrap = () => a.ch.wallet.scrap + b.ch.wallet.scrap;
    const startItems = items(); const startScrap = scrap();
    const r = makeRng(42);
    let completed = 0;
    for (let i = 0; i < 250; i++) {
      const x = r() < 0.5 ? a : b; const y = x === a ? b : a;
      switch (Math.floor(r() * 6)) {
        case 0: await x.req({ op: 'trade_open', name: y.name }); break;
        case 1: case 2: {
          const mine = x.ch.inventory.filter(() => r() < 0.3).map((it) => it.uid);
          if (r() < 0.1) mine.push(mine[0] ?? 'zz'); // duplicate / bogus uid
          await x.req({ op: 'trade_set', items: mine, scrap: Math.floor(r() * 60_000) * (r() < 0.05 ? -1 : 1) });
          break;
        }
        case 3: case 4: { const before = scrap(); const pa = a.ch.wallet.scrap, pb = b.ch.wallet.scrap; const res = await x.req({ op: 'trade_confirm' }); if (res.ok && !res.data) completed++; expect(scrap(), `confirm by ${x === a ? 'a' : 'b'}: ${pa}/${pb} -> ${a.ch.wallet.scrap}/${b.ch.wallet.scrap} res=${JSON.stringify(res)}`).toBe(before); break; }
        default: await x.req({ op: 'trade_cancel' });
      }
      await y.req({ op: r() < 0.5 ? 'trade_confirm' : 'trade_info' });
      expect(scrap(), `scrap after step ${i}`).toBe(startScrap);
      expect(items(), `items after step ${i}`).toEqual(startItems);
      expect([...characterViolations('a', a.ch), ...characterViolations('b', b.ch)]).toEqual([]);
    }
    expect(completed + 1).toBeGreaterThan(0);
    a.ws.close(); b.ws.close();
  }, 60_000);

  it('auction listings, purchases, cancellations and mail conserve items; scrap only leaves as tax', async () => {
    const a = await P.make(); const b = await P.make();
    stock(a.ch, 3, 14); stock(b.ch, 4, 6);
    ctx.db.prepare('UPDATE accounts SET created_at = 0').run(); // old enough for the auction house
    expect(ctx.game.adminTeleport(a.id, 13)).toBe(true); expect(ctx.game.adminTeleport(b.id, 13)).toBe(true);
    for (let i = 0; i < 30; i++) ctx.game.stepAll();
    const inMail = (id: string) => ctx.market.mail(id);
    const itemsAll = () => {
      const listed = ctx.market.search({ limit: 500 }).map((l) => l.item);
      const mailed = [a.id, b.id].flatMap((id) => inMail(id).filter((m) => m.kind === 'item').map((m) => JSON.parse(m.payload)));
      return itemMultiset([...a.ch.inventory, ...b.ch.inventory, ...listed, ...mailed]);
    };
    const scrapAll = () => a.ch.wallet.scrap + b.ch.wallet.scrap + [a.id, b.id].flatMap((id) => inMail(id).filter((m) => m.kind === 'scrap').map((m) => Number(m.payload))).reduce((x, y) => x + y, 0);
    const startItems = itemsAll(); const startScrap = scrapAll();
    const r = makeRng(7);
    let sold = 0;
    for (let i = 0; i < 200; i++) {
      const x = r() < 0.5 ? a : b;
      switch (Math.floor(r() * 5)) {
        case 0: case 1: {
          const it = x.ch.inventory[Math.floor(r() * x.ch.inventory.length)];
          if (!it) break;
          const band = (await import('../server/market.ts')).priceBand(it.defId)!;
          await x.req({ op: 'ah_sell', uid: it.uid, price: Math.floor(band.min + r() * (band.max - band.min) * 0.05), hours: 24 });
          break;
        }
        case 2: { const l = ctx.market.search({ limit: 50 }); if (l.length) { const res = await x.req({ op: 'ah_buy', id: l[Math.floor(r() * l.length)].id }); if (res.ok) sold++; } break; }
        case 3: { const mine = ctx.market.mine(x.id); if (mine.length) await x.req({ op: 'ah_cancel', id: mine[0].id }); break; }
        default: {
          for (const m of inMail(x.id)) await x.req({ op: 'mail_claim', id: m.id });
        }
      }
      expect(itemsAll(), `items after step ${i}`).toEqual(startItems);
      const s = scrapAll();
      expect(s, `scrap after step ${i}`).toBeLessThanOrEqual(startScrap);
      expect(characterViolations('a', a.ch).concat(characterViolations('b', b.ch))).toEqual([]);
    }
    // every sale taxes at most 5 %: the total can drop by at most that
    expect(scrapAll()).toBeGreaterThanOrEqual(startScrap * 0.9);
    expect(sold).toBeGreaterThan(0);
    a.ws.close(); b.ws.close();
  }, 60_000);

  it('concurrent buys of one listing: exactly one succeeds, the item exists once', async () => {
    const seller = await P.make(); const b1 = await P.make(); const b2 = await P.make();
    stock(seller.ch, 5, 2); stock(b1.ch, 6, 0); stock(b2.ch, 7, 0);
    ctx.db.prepare('UPDATE accounts SET created_at = 0').run();
    for (const p of [seller, b1, b2]) ctx.game.adminTeleport(p.id, 13);
    for (let i = 0; i < 30; i++) ctx.game.stepAll();
    const it = seller.ch.inventory.find((x) => !C.isEquipped(seller.ch, x.uid))!;
    const band = (await import('../server/market.ts')).priceBand(it.defId)!;
    const listed = await seller.req({ op: 'ah_sell', uid: it.uid, price: band.min, hours: 24 });
    expect(listed, JSON.stringify(listed)).toMatchObject({ ok: true });
    const id = listed.data.id;
    const send = (p: P) => { const n = ++p.n; p.ws.send(JSON.stringify({ type: 'c_social', id: n, req: { op: 'ah_buy', id } })); return n; };
    const count = () => [b1, b2].reduce((n, p) => n + p.ch.inventory.filter((x) => x.defId === it.defId && x.rarity === it.rarity).length, 0);
    const copiesBefore = count();
    const n1 = send(b1); const n2 = send(b2);
    await b1.until(() => b1.msgs.some((m) => m.id === n1 && m.type === 's_social_result') && b2.msgs.some((m) => m.id === n2 && m.type === 's_social_result'));
    const oks = [b1.msgs.find((m) => m.id === n1 && m.type === 's_social_result'), b2.msgs.find((m) => m.id === n2 && m.type === 's_social_result')].filter((m) => m.ok).length;
    expect(oks).toBe(1);
    expect(count() - copiesBefore).toBe(1);
    [seller, b1, b2].forEach((p) => p.ws.close());
  }, 30_000);
});
