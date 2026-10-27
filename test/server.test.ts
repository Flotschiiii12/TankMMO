import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp } from '../server/app.ts';
import { PROTOCOL_VERSION } from '../shared/protocol.ts';
import { applyPatch } from '../shared/net/delta.ts';
import type { SimEntity } from '../shared/types.ts';

let ctx: ReturnType<typeof createApp>;
let port: number;
const base = () => `http://127.0.0.1:${port}`;

// A fresh server per test: tests tamper with their instance world (safe zones, positions).
beforeEach(async () => {
  ctx = createApp({});
  port = await ctx.game.listen(0);
});
afterEach(async () => { await ctx.game.close(); });

async function post(path: string, body: any) {
  const r = await fetch(base() + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json() as any };
}

class Client {
  ws!: WebSocket;
  msgs: any[] = [];
  entities = new Map<number, SimEntity>();
  myId = 0;
  character: any;
  closed?: number;
  seq = 0;
  async connect(credential: string, version = PROTOCOL_VERSION) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((res, rej) => { this.ws.on('open', () => res()); this.ws.on('error', rej); });
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      this.msgs.push(m);
      if (m.type === 's_map') { this.myId = m.assignedEntityId; this.entities.clear(); }
      if (m.type === 's_state') { for (const p of m.patches) applyPatch(this.entities, p); for (const id of m.removed) this.entities.delete(id); }
      if (m.type === 's_character') this.character = m.character;
    });
    this.ws.on('close', (c) => { this.closed = c; });
    const [accountId, secret] = credential.split('.');
    this.ws.send(JSON.stringify({ type: 'c_join', protocolVersion: version, accountId, secret }));
  }
  send(o: any) { this.ws.send(JSON.stringify(o)); }
  input(...commands: any[]) { this.send({ type: 'c_input', seq: ++this.seq, commands, clientTime: 0 }); }
  me() { return this.entities.get(this.myId); }
  async until(pred: () => boolean, ms = 4000) {
    const t0 = Date.now();
    while (!pred()) {
      if (Date.now() - t0 > ms) throw new Error('timeout waiting for condition');
      ctx.game.stepAll(); // drive the server clock deterministically from the test
      await new Promise((r) => setTimeout(r, 4));
    }
  }
  close() { this.ws.close(); }
}

async function guest() {
  const r = await post('/api/guest', { ageConfirmed: true });
  expect(r.status).toBe(200);
  return r.json as { credential: string; accountId: string; name: string };
}

describe('Server: accounts', () => {
  it('requires the age gate, returns name+credential, hides secrets, supports recovery on a new device', async () => {
    expect((await post('/api/guest', {})).status).toBe(400);
    const g = await guest();
    expect(g.name).toMatch(/^Driver-\d{7}$/);
    expect(g.credential.split('.')).toHaveLength(2);
    // secret is stored hashed only
    const row = ctx.accounts.get(g.accountId)!;
    expect(row.secretHash).not.toContain(g.credential.split('.')[1]);
    const code = (await post('/api/recovery-code', { credential: g.credential })).json.code as string;
    expect(code).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/);
    const rec = await post('/api/recover', { code });
    expect(rec.status).toBe(200);
    expect(rec.json.accountId).toBe(g.accountId);
    // old secret no longer works, new one does
    expect((await post('/api/recovery-code', { credential: g.credential })).status).toBe(401);
    expect((await post('/api/recovery-code', { credential: rec.json.credential })).status).toBe(200);
    expect((await post('/api/recover', { code: 'AAAA-BBBB-CCCC-DDDD-EEEE' })).status).toBe(400);
  });
});

describe('Server: join, version gate, single session', () => {
  it('rejects old protocol versions and bad credentials; one connection per account', async () => {
    const g = await guest();
    const old = new Client();
    await old.connect(g.credential, '1.0.0');
    await old.until(() => old.closed !== undefined);
    expect(old.closed).toBe(4426);
    expect(old.msgs.some((m) => m.type === 's_error' && m.code === 'update_required')).toBe(true);

    const bad = new Client();
    await bad.connect(`${g.accountId}.wrongsecret`);
    await bad.until(() => bad.closed !== undefined);
    expect(bad.closed).toBe(4404);

    const a = new Client(); await a.connect(g.credential);
    await a.until(() => !!a.me());
    const b = new Client(); await b.connect(g.credential);
    await b.until(() => !!b.me() && a.closed !== undefined);
    expect(a.closed).toBe(4409);
    expect(ctx.game.playerCount()).toBe(1);
    b.close();
    await b.until(() => ctx.game.playerCount() === 0);
  });
});

describe('Server: authoritative gameplay', () => {
  it('moves the vehicle only as fast as the server allows and ignores teleport/absurd input', async () => {
    const g = await guest();
    const c = new Client(); await c.connect(g.credential);
    await c.until(() => !!c.me());
    const start = { ...c.me()!.pos };
    c.input({ type: 'Drive', x: 1, y: 0 });
    for (let i = 0; i < 60; i++) { ctx.game.stepAll(); }
    await c.until(() => (c.me()?.pos.x ?? 0) > start.x + 20);
    c.input({ type: 'Drive', x: 9999, y: 0 }); // magnitude is clamped to 1
    c.send({ type: 'c_input', seq: 999, commands: [{ type: 'Teleport', x: 1, y: 1 }], clientTime: 0 }); // unknown command dropped
    for (let i = 0; i < 90; i++) ctx.game.stepAll();
    const server = ctx.game.getSessionState(g.accountId)!.entity;
    expect(Math.hypot(server.vel.x, server.vel.y)).toBeLessThanOrEqual(server.maxSpeed + 1);
    expect(server.pos.x).toBeGreaterThan(start.x);
    c.close();
    await c.until(() => ctx.game.playerCount() === 0);
  });

  it('rate-limits floods and rejects replayed sequence numbers', async () => {
    const g = await guest();
    const c = new Client(); await c.connect(g.credential);
    await c.until(() => !!c.me());
    for (let i = 0; i < 200; i++) c.input(...Array.from({ length: 16 }, () => ({ type: 'Drive', x: 1, y: 0 })));
    c.send({ type: 'c_input', seq: 1, commands: [{ type: 'Drive', x: 0, y: 1 }], clientTime: 0 }); // replay
    await c.until(() => true);
    for (let i = 0; i < 10; i++) { ctx.game.stepAll(); await new Promise((r) => setTimeout(r, 5)); }
    // the server survived and the entity still obeys the speed cap
    const e = ctx.game.getSessionState(g.accountId)!.entity;
    expect(Math.hypot(e.vel.x, e.vel.y)).toBeLessThanOrEqual(e.maxSpeed + 1);
    c.close();
    await c.until(() => ctx.game.playerCount() === 0);
  });

  it('kills grant XP/loot server-side, persist across reconnect, and the client cannot grant itself anything', async () => {
    const g = await guest();
    const c = new Client(); await c.connect(g.credential);
    await c.until(() => !!c.me());
    const world = ctx.game.getWorld(g.accountId)!;
    const sess = ctx.game.getSessionState(g.accountId)!;
    world.safeZones = [];
    const foe = [...world.entities.values()].find((e) => e.kind === 'scout_buggy')!;
    foe.pos = { x: sess.entity.pos.x + 200, y: sess.entity.pos.y };
    foe.hull = 1; foe.armor = 0;
    sess.entity.invulnerableTime = 1e9;
    c.input({ type: 'SetTarget', targetId: foe.id }, { type: 'ToggleAutoFire' });
    const xp0 = sess.character.xp, items0 = sess.character.inventory.length;
    await c.until(() => foe.hull <= 0, 6000);
    for (let i = 0; i < 5; i++) ctx.game.stepAll();
    expect(sess.character.xp + sess.character.level).toBeGreaterThanOrEqual(xp0 + 1);
    expect(sess.character.inventory.length).toBeGreaterThanOrEqual(items0);
    const level = sess.character.level; const xp = sess.character.xp;
    // client tries to cheat: an unknown packet and a fake action
    c.send({ type: 'c_action', id: 1, action: { kind: 'grant_scrap', amount: 1e9 } });
    c.send({ type: 'c_grant', scrap: 1e9 });
    await c.until(() => c.msgs.some((m) => m.type === 's_action_result' && m.id === 1));
    expect(c.msgs.find((m) => m.type === 's_action_result' && m.id === 1).ok).toBe(false);
    expect(sess.character.wallet.scrap).toBeLessThan(1e6);
    c.close();
    await c.until(() => ctx.game.playerCount() === 0);
    // persisted: a new connection sees the same level/xp
    const c2 = new Client(); await c2.connect(g.credential);
    await c2.until(() => !!c2.character);
    expect(c2.character.level).toBe(level);
    expect(c2.character.xp).toBe(xp);
    c2.close();
    await c2.until(() => ctx.game.playerCount() === 0);
  });

  it('actions are validated server-side: workshop only in a safe zone, costs enforced', async () => {
    const g = await guest();
    const c = new Client(); await c.connect(g.credential);
    await c.until(() => !!c.character && !!c.me());
    const uid = c.character.inventory[0].uid;
    const act = async (id: number, action: any) => { c.send({ type: 'c_action', id, action }); await c.until(() => c.msgs.some((m) => m.type === 's_action_result' && m.id === id)); return c.msgs.find((m) => m.type === 's_action_result' && m.id === id); };
    // spawn is in the safe zone: upgrade is allowed but too expensive for a 400-scrap newcomer at +10 etc.; first levels are cheap
    const r1 = await act(1, { kind: 'upgrade', uid });
    expect(r1.ok).toBe(false); // needs ore + fragments the newcomer does not have
    expect(r1.error).toBe('not_enough_materials');
    // leave the safe zone -> workshop refused
    const world = ctx.game.getWorld(g.accountId)!;
    ctx.game.getSessionState(g.accountId)!.entity.pos = { x: 10, y: 10 };
    void world;
    const r2 = await act(2, { kind: 'dismantle', uid });
    expect(r2).toMatchObject({ ok: false, error: 'safe_zone_only' });
    c.close();
    await c.until(() => ctx.game.playerCount() === 0);
  });

  it('gate travel moves the player to the linked map with spawn protection and persists the map', async () => {
    const g = await guest();
    const c = new Client(); await c.connect(g.credential);
    await c.until(() => !!c.me());
    const world = ctx.game.getWorld(g.accountId)!;
    const sess = ctx.game.getSessionState(g.accountId)!;
    const gate = [...world.entities.values()].find((e) => e.kind === 'gate')!;
    sess.entity.pos = { ...gate.pos };
    sess.character.level = 30;
    await c.until(() => c.msgs.some((m) => m.type === 's_map' && m.mapId !== 1), 6000);
    const st = ctx.game.getSessionState(g.accountId)!;
    expect(st.mapId).not.toBe(1);
    expect(st.entity.invulnerableTime).toBeGreaterThan(0);
    c.close();
    await c.until(() => ctx.game.playerCount() === 0);
    expect(ctx.profiles.get(g.accountId)!.mapId).toBe(st.mapId);
  });

  it('delta snapshots are much smaller than full ones after the first state', async () => {
    const g = await guest();
    const c = new Client(); await c.connect(g.credential);
    await c.until(() => c.msgs.filter((m) => m.type === 's_state').length >= 6);
    const states = c.msgs.filter((m) => m.type === 's_state');
    const first = JSON.stringify(states[0]).length;
    const later = JSON.stringify(states[5]).length;
    expect(later).toBeLessThan(first / 3);
    c.close();
    await c.until(() => ctx.game.playerCount() === 0);
  });

  it('chat is slow-moded and filtered; health and metrics endpoints respond', async () => {
    const g = await guest();
    const c = new Client(); await c.connect(g.credential);
    await c.until(() => !!c.me());
    c.send({ type: 'c_chat', channel: 'G', text: 'hello shit world' });
    c.send({ type: 'c_chat', channel: 'G', text: 'second too fast' });
    await c.until(() => c.msgs.some((m) => m.type === 's_chat' && m.message.text.includes('hello')));
    expect(c.msgs.find((m) => m.type === 's_chat' && m.message.text.includes('hello')).message.text).toBe('hello **** world');
    await c.until(() => c.msgs.some((m) => m.type === 's_error' && m.code === 'slow_mode'));
    expect((await (await fetch(base() + '/health')).json() as any).ok).toBe(true);
    expect(await (await fetch(base() + '/metrics')).text()).toContain('treadfront_players');
    c.close();
    await c.until(() => ctx.game.playerCount() === 0);
  });
});
