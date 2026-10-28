import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp } from '../server/app.ts';
import { MAX_MESSAGE_BURST } from '../server/gameServer.ts';
import { PROTOCOL_VERSION } from '../shared/protocol.ts';
import { SimRNG } from '../shared/prng.ts';
import * as C from '../shared/rules/character.ts';
import { claimSeasonTier } from '../shared/rules/quests.ts';

process.env.LOAD_TEST = '1';
let ctx: ReturnType<typeof createApp>;
let port: number;
const ADMIN = 'test-admin-token';
beforeEach(async () => { ctx = createApp({ adminToken: ADMIN }); port = await ctx.game.listen(0); });
afterEach(async () => { await ctx.game.close(); });

const post = async (path: string, body: any, headers: Record<string, string> = {}, raw = false) => {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: raw ? body : JSON.stringify(body) });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as any };
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function open(): Promise<{ ws: WebSocket; msgs: any[]; closed: () => number | undefined; until: (f: () => boolean) => Promise<void> }> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const msgs: any[] = []; let closed: number | undefined;
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
  ws.on('close', (c) => { closed = c; });
  await new Promise<void>((r) => ws.on('open', () => r()));
  const until = async (f: () => boolean) => { const t = Date.now(); while (!f()) { if (Date.now() - t > 3000) throw new Error('timeout'); ctx.game.stepAll(); await wait(4); } };
  return { ws, msgs, closed: () => closed, until };
}
async function join() {
  const g = (await post('/api/guest', { ageConfirmed: true })).json;
  const c = await open();
  const [accountId, secret] = g.credential.split('.');
  c.ws.send(JSON.stringify({ type: 'c_join', protocolVersion: PROTOCOL_VERSION, accountId, secret }));
  await c.until(() => c.msgs.some((m) => m.type === 's_character'));
  return { ...c, id: accountId as string };
}
/** The server is still alive and answers a ping on this connection. */
async function expectAlive(c: { ws: WebSocket; msgs: any[]; until: (f: () => boolean) => Promise<void> }) {
  const stamp = Math.floor(Math.random() * 1e9);
  c.ws.send(JSON.stringify({ type: 'c_ping', timestamp: stamp }));
  await c.until(() => c.msgs.some((m) => m.type === 's_pong' && m.originalTimestamp === stamp));
}

describe('WebSocket hardening', () => {
  it('survives non-object frames and wrong-typed join fields before login, and drops spammers', async () => {
    const c = await open();
    for (const frame of ['null', '123', '"str"', '[]', '{}', '{"type":5}', '{"type":"c_join","accountId":{"x":1},"secret":"s","protocolVersion":"1.0.0"}', '{"type":"c_join","accountId":"a","secret":["x"],"protocolVersion":{}}']) c.ws.send(frame);
    await wait(150);
    // the process did not crash: HTTP and new sockets still work
    expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);
    await c.until(() => c.closed() !== undefined); // closed for too many bad messages / bad credentials
    const ok = await join();
    await expectAlive(ok);
    ok.ws.close();
  });

  it('ignores malformed commands, requests and actions after login without crashing or disconnecting', async () => {
    const p = await join();
    p.ws.send(JSON.stringify({ type: 'c_input', seq: 1, commands: [null, 5, 'x', { type: 'SetTarget', targetId: { a: 1 } }, { type: 'Drive', x: '1', y: null }], clientTime: 0 }));
    p.ws.send(JSON.stringify({ type: 'c_input', seq: 'NaN', commands: 'x' }));
    p.ws.send(JSON.stringify({ type: 'c_social', id: 1, req: null }));
    p.ws.send(JSON.stringify({ type: 'c_social', id: 2, req: { op: 'ranking' } }));
    p.ws.send(JSON.stringify({ type: 'c_social', id: 3, req: { op: 'ah_search', defId: { a: 1 } } }));
    p.ws.send(JSON.stringify({ type: 'c_action', id: 4, action: null }));
    p.ws.send(JSON.stringify({ type: 'c_chat', channel: 'W', text: 'x', targetRecipient: { a: 1 } }));
    p.ws.send(JSON.stringify({ type: 'c_chat', channel: 'S', text: 'forged system message' }));
    await wait(100);
    await expectAlive(p);
    expect(p.closed()).toBeUndefined();
    expect(p.msgs.some((m) => m.type === 's_chat' && m.message.text === 'forged system message')).toBe(false);
    p.ws.close();
  });

  it('drops messages beyond the per-connection budget instead of processing them all', async () => {
    const p = await join();
    const total = MAX_MESSAGE_BURST * 3;
    for (let i = 0; i < total; i++) p.ws.send(JSON.stringify({ type: 'c_ping', timestamp: 1_000_000 + i }));
    await wait(300);
    ctx.game.stepAll();
    const pongs = p.msgs.filter((m) => m.type === 's_pong' && m.originalTimestamp >= 1_000_000).length;
    expect(pongs).toBeGreaterThan(0);
    expect(pongs).toBeLessThan(total);
    p.ws.close();
  });
});

describe('Rule input validation', () => {
  it('buy_ammo with a non-numeric / fractional pack count cannot corrupt the wallet', async () => {
    const p = await join();
    const st = ctx.game.getSessionState(p.id)!;
    st.character.wallet.scrap = 5000;
    let id = 0;
    const act = async (action: any) => { const n = ++id; p.ws.send(JSON.stringify({ type: 'c_action', id: n, action })); await p.until(() => p.msgs.some((m) => m.type === 's_action_result' && m.id === n)); return p.msgs.find((m) => m.type === 's_action_result' && m.id === n); };
    for (const packs of ['abc', 'NaN', {}, [], 0, -3, 51, null]) expect((await act({ kind: 'buy_ammo', ammo: 'REINFORCED', packs })).ok).toBe(false);
    expect(st.character.wallet.scrap).toBe(5000);
    expect((await act({ kind: 'buy_ammo', ammo: 'REINFORCED', packs: 2 })).ok).toBe(true);
    expect(Number.isFinite(st.character.wallet.scrap)).toBe(true);
    expect(st.character.wallet.scrap).toBeLessThan(5000);
    p.ws.close();
  });

  it('season tiers and affix indices must be integers', () => {
    const ch = C.createCharacter('T');
    ch.season.points = 1_000_000;
    for (const tier of [1.5, 0.5, '1' as any, NaN, Infinity, 2.5]) expect(claimSeasonTier(ch, tier, 1_000_000)).toMatchObject({ ok: false, error: 'bad_tier' });
    expect(ch.season.claimed).toEqual([]);
    const made = C.createItem(ch, 'cannon_t1', 'Rare', new SimRNG(1));
    if (made.ok) {
      ch.wallet.scrap = 1e9; ch.wallet.fragments = 1e9;
      expect(C.rerollAffix(ch, made.item.uid, 0.5, new SimRNG(2))).toMatchObject({ ok: false, error: 'bad_affix_index' });
      expect(made.item.rerolls).toBe(0);
    }
  });
});

describe('REST / admin hardening', () => {
  it('rejects malformed JSON with 400, bad ban durations, and the admin page escapes table cells', async () => {
    expect((await post('/api/guest', '{not json', {}, true)).status).toBe(400);
    expect((await post('/admin/api/ban', { name: 'x', hours: 'abc' })).status).toBe(401);
    const g = (await post('/api/guest', { ageConfirmed: true })).json;
    expect((await post('/admin/api/ban', { name: g.name, hours: 'abc' }, { 'x-admin-token': ADMIN })).status).toBe(400);
    expect((await post('/admin/api/mute', { name: g.name, hours: 'Infinity' }, { 'x-admin-token': ADMIN })).status).toBe(400);
    expect(ctx.accounts.get(g.accountId)!.bannedUntil).toBe(0);
    const html = await (await fetch(`http://127.0.0.1:${port}/admin`)).text();
    expect(html).toContain('const esc=');
    expect(html).not.toMatch(/'<td>'\+\(typeof v==='object'\?JSON\.stringify\(v\):v\)\+'<\/td>'/); // old unescaped cell rendering
  });
});
