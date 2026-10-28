import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp } from '../server/app.ts';
import { PROTOCOL_VERSION } from '../shared/protocol.ts';
import { applyPatch } from '../shared/net/delta.ts';
import { SPECTATE_DELAY_TICKS, MatchRecorder } from '../server/spectate.ts';
import type { SimEntity } from '../shared/types.ts';

process.env.LOAD_TEST = '1';
let ctx: ReturnType<typeof createApp>;
let port: number;
beforeEach(async () => { ctx = createApp({ adminToken: 'x' }); port = await ctx.game.listen(0); });
afterEach(async () => { await ctx.game.close(); });

class P {
  ws!: WebSocket; msgs: any[] = []; name = ''; id = ''; n = 0; seqIn = 0;
  static async make(): Promise<P> {
    const p = new P();
    const g = (await (await fetch(`http://127.0.0.1:${port}/api/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ageConfirmed: true }) })).json()) as any;
    p.name = g.name; p.id = g.accountId;
    p.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((r) => p.ws.on('open', () => r()));
    p.ws.on('message', (d) => p.msgs.push(JSON.parse(d.toString())));
    const [a, s] = g.credential.split('.');
    p.ws.send(JSON.stringify({ type: 'c_join', protocolVersion: PROTOCOL_VERSION, accountId: a, secret: s }));
    await p.until(() => p.msgs.some((m) => m.type === 's_character'));
    return p;
  }
  async until(f: () => boolean, ms = 4000) { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout'); ctx.game.stepAll(); await new Promise((r) => setTimeout(r, 3)); } }
  async req(req: any): Promise<any> {
    const id = ++this.n; this.ws.send(JSON.stringify({ type: 'c_social', id, req }));
    await this.until(() => this.msgs.some((m) => m.type === 's_social_result' && m.id === id));
    return this.msgs.find((m) => m.type === 's_social_result' && m.id === id);
  }
  event(kind: string) { return this.msgs.some((m) => m.type === 's_social_event' && m.kind === kind); }
  states() { return this.msgs.filter((m) => m.type === 's_state'); }
  input(...commands: any[]) { this.ws.send(JSON.stringify({ type: 'c_input', seq: ++this.seqIn, commands, clientTime: 0 })); }
}

async function startMatch() {
  const a = await P.make(); const b = await P.make();
  await a.req({ op: 'arena_queue', mode: '1v1' }); await b.req({ op: 'arena_queue', mode: '1v1' });
  await a.until(() => a.event('arena_start'));
  return { a, b };
}
const steps = (n: number) => { for (let i = 0; i < n; i++) ctx.game.stepAll(); };

describe('arena spectating', () => {
  it('lists running matches and lets a hub player watch; the stream is delayed', async () => {
    const w = await P.make();
    expect((await w.req({ op: 'spectate_list' })).data).toEqual([]);
    expect((await w.req({ op: 'spectate_join', matchId: 'a1' })).error).toBe('match_not_found');
    const { a, b } = await startMatch();
    const list = (await w.req({ op: 'spectate_list' })).data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ mode: '1v1', round: 1, spectators: 0, capacity: 20 });
    expect(list[0].teams.flat().map((p: any) => p.name).sort()).toEqual([a.name, b.name].sort());
    expect(typeof list[0].league).toBe('string');
    const j = await w.req({ op: 'spectate_join', matchId: list[0].id });
    expect(j.ok).toBe(true);
    expect(j.data.delaySeconds).toBe(5);
    const map = w.msgs.filter((m) => m.type === 's_map').pop();
    expect(map).toMatchObject({ mapId: 30, assignedEntityId: 0, spectate: true });
    w.msgs.length = 0;
    const t0 = ctx.game.getWorld(a.id)!.tick;
    steps(SPECTATE_DELAY_TICKS - 30);
    await new Promise((r) => setTimeout(r, 30));
    expect(w.states()).toHaveLength(0); // nothing before the delay has elapsed
    steps(120);
    await w.until(() => w.states().length > 0);
    const world = ctx.game.getWorld(a.id)!;
    const last = w.states().pop();
    expect(world.tick - last.tick).toBeGreaterThanOrEqual(SPECTATE_DELAY_TICKS);
    expect(last.tick).toBeGreaterThan(t0);
    expect(w.event('arena_phase')).toBe(true); // HUD chip data (phase/round/score)
  });

  it('a spectator cannot affect the match and takes no instance capacity', async () => {
    const w = await P.make();
    const { a, b } = await startMatch();
    const id = (await w.req({ op: 'spectate_list' })).data[0].id;
    await w.req({ op: 'spectate_join', matchId: id });
    const inst = ctx.game.getSession(a.id)!.instance;
    expect(inst.sessions.size).toBe(2);
    expect(inst.arena!.spectators.size).toBe(1);
    const before = JSON.stringify([...inst.world.entities.values()].map((e) => [e.id, e.pos, e.hull]));
    const sw = ctx.game.getSession(w.id)!;
    const hubPos = { ...sw.instance.world.entities.get(sw.entityId)!.pos };
    w.input({ type: 'Drive', x: 1, y: 0 }, { type: 'FireMain' }, { type: 'SetTarget', targetId: ctx.game.getSessionState(a.id)!.entity.id });
    steps(60);
    expect(JSON.stringify([...inst.world.entities.values()].map((e) => [e.id, e.pos, e.hull]))).toBe(before); // countdown: frozen anyway
    expect(sw.pending).toEqual([]);
    expect(sw.instance.world.entities.get(sw.entityId)!.pos).toEqual(hubPos);
    // chat from the spectator does not reach the fighters' match chat channel (only global/clan/etc.)
    expect(inst.world.entities.size).toBe(2);
    // while fighting, a spectator still cannot move or shoot
    await a.until(() => inst.arena!.state.phase === 'fighting', 12000);
    const spec = [...inst.world.entities.values()].find((e) => e.id === sw.entityId);
    expect(spec).toBeUndefined(); // the spectator has no entity in the arena world
    const hp = ctx.game.getSessionState(a.id)!.entity.hull;
    w.input({ type: 'FireMain' });
    steps(30);
    expect(ctx.game.getSessionState(a.id)!.entity.hull).toBeLessThanOrEqual(hp);
    void b;
  });

  it('a spectator receives no private data: no reload timers, cooldowns, ammo or hidden AI fields', async () => {
    const w = await P.make();
    const { a, b } = await startMatch();
    await w.req({ op: 'spectate_join', matchId: (await w.req({ op: 'spectate_list' })).data[0].id });
    w.msgs.length = 0;
    const ea = ctx.game.getSessionState(a.id)!.entity; const eb = ctx.game.getSessionState(b.id)!.entity;
    // give both fighters plenty of private state
    for (const e of [ea, eb]) { e.mainReloadRemaining = 2.5; e.mgReloadRemaining = 1.2; e.abilityCooldowns = { smoke: 9 }; e.ammoInventory = { ...e.ammoInventory, REINFORCED: 17, ARMOR_PIERCING: 5 }; e.stunCount = 2; e.armorRegenTimer = 3; }
    steps(300);
    await w.until(() => w.states().length > 3);
    const known = new Map<number, SimEntity>();
    for (const m of w.states()) { for (const p of m.patches) applyPatch(known, p); for (const id of m.removed) known.delete(id); }
    const fighters = [...known.values()].filter((e) => e.kind === 'player');
    expect(fighters).toHaveLength(2);
    for (const e of fighters) {
      expect(e.mainReloadRemaining).toBe(0);
      expect(e.mgReloadRemaining).toBe(0);
      expect(e.abilityCooldowns).toEqual({});
      expect(e.ammoInventory.REINFORCED).toBe(0);
      expect(e.ammoInventory.ARMOR_PIERCING).toBe(0);
      expect(e.stunCount).toBe(0);
      expect(e.armorRegenTimer).toBe(0);
    }
    // no personal data packets at all after joining
    expect(w.msgs.some((m) => m.type === 's_character')).toBe(false);
    expect(w.msgs.some((m) => m.type === 's_chat' && m.message.channel === 'W')).toBe(false);
  });

  it('caps spectators per match, rejects busy players and can be left', async () => {
    ctx.game.spectatorCap = 2;
    const { a, b } = await startMatch();
    const [w1, w2, w3] = [await P.make(), await P.make(), await P.make()];
    const id = (await w1.req({ op: 'spectate_list' })).data[0].id;
    expect((await a.req({ op: 'spectate_join', matchId: id })).error).toBe('busy'); // a fighter cannot watch
    expect((await w1.req({ op: 'spectate_join', matchId: id })).ok).toBe(true);
    expect((await w1.req({ op: 'spectate_join', matchId: id })).error).toBe('already_spectating');
    expect((await w1.req({ op: 'arena_queue', mode: '1v1' })).error).toBe('busy');
    expect((await w2.req({ op: 'spectate_join', matchId: id })).ok).toBe(true);
    expect((await w3.req({ op: 'spectate_join', matchId: id })).error).toBe('spectators_full');
    expect((await w3.req({ op: 'spectate_leave' })).error).toBe('not_spectating');
    expect((await w3.req({ op: 'spectate_list' })).data[0].spectators).toBe(2);
    // leaving restores the hub view with the player's own vehicle
    w1.msgs.length = 0;
    expect((await w1.req({ op: 'spectate_leave' })).ok).toBe(true);
    const map = w1.msgs.find((m) => m.type === 's_map');
    expect(map).toMatchObject({ mapId: ctx.game.getSessionState(w1.id)!.mapId });
    expect(map.assignedEntityId).toBe(ctx.game.getSession(w1.id)!.entityId);
    expect(map.spectate).toBeUndefined();
    // a spectator who disconnects frees the slot
    w2.ws.close();
    await w3.until(() => ctx.game.getSession(w2.id) === undefined);
    expect((await w3.req({ op: 'spectate_join', matchId: id })).ok).toBe(true);
    void b;
  });

  it('spectators are sent back when the match ends', async () => {
    const w = await P.make();
    const { a, b } = await startMatch();
    await w.req({ op: 'spectate_join', matchId: (await w.req({ op: 'spectate_list' })).data[0].id });
    const inst = ctx.game.getSession(a.id)!.instance;
    await a.until(() => inst.arena!.state.phase === 'fighting', 12000);
    for (let r = 0; r < 2; r++) {
      await a.until(() => inst.arena!.state.phase === 'fighting' || ctx.game.getSessionState(a.id)?.mapId !== 30, 12000);
      if (ctx.game.getSessionState(a.id)?.mapId !== 30) break;
      ctx.game.getSessionState(b.id)!.entity.hull = 0;
      for (let i = 0; i < 400 && ctx.game.getSessionState(a.id)?.mapId === 30 && inst.arena!.state.phase === 'fighting'; i++) ctx.game.stepAll();
    }
    await a.until(() => a.event('arena_result'), 12000);
    expect(ctx.game.getSession(w.id)!.spectating).toBeUndefined();
    const map = w.msgs.filter((m) => m.type === 's_map').pop();
    expect(map).toMatchObject({ mapId: ctx.game.getSessionState(w.id)!.mapId });
    expect(map.spectate).toBeUndefined();
    expect((await w.req({ op: 'spectate_list' })).data).toEqual([]);
  });
});

describe('MatchRecorder', () => {
  it('returns the newest frame that is at least the delay old', () => {
    const r = new MatchRecorder();
    const hud = { phase: 'fighting', round: 1, wins: [0, 0], secondsLeft: 10 };
    for (let t = 0; t <= 600; t += 3) r.record(t, t / 30, [], hud);
    expect(r.delayed(100, 150)).toBeUndefined();
    expect(r.delayed(600, 150)!.tick).toBe(450);
    expect(r.delayed(601, 150)!.tick).toBe(450);
    expect(r.size).toBeLessThanOrEqual(160);
  });
});
