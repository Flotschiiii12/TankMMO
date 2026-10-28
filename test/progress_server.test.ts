import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp } from '../server/app.ts';
import { ACHIEVEMENTS_CATALOG } from '../shared/data/achievements.ts';
import { DUNGEONS } from '../shared/data/dungeons.ts';
import { PROTOCOL_VERSION } from '../shared/protocol.ts';
import * as C from '../shared/rules/character.ts';
import * as A from '../shared/rules/achievements.ts';

process.env.LOAD_TEST = '1';
let ctx: ReturnType<typeof createApp>; let port: number;
beforeEach(async () => { ctx = createApp({}); port = await ctx.game.listen(0); });
afterEach(async () => { await ctx.game.close(); });

class P {
  ws!: WebSocket; msgs: any[] = []; id = ''; n = 0; seqIn = 0;
  static async make(): Promise<P> {
    const p = new P();
    const g = await (await fetch(`http://127.0.0.1:${port}/api/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ageConfirmed: true }) })).json() as any;
    p.id = g.accountId;
    p.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((r) => p.ws.on('open', () => r()));
    p.ws.on('message', (d) => p.msgs.push(JSON.parse(d.toString())));
    const [a, s] = g.credential.split('.');
    p.ws.send(JSON.stringify({ type: 'c_join', protocolVersion: PROTOCOL_VERSION, accountId: a, secret: s }));
    await p.until(() => p.msgs.some((m) => m.type === 's_character'));
    return p;
  }
  async until(f: () => boolean, ms = 4000) { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout'); ctx.game.stepAll(); await new Promise((r) => setTimeout(r, 2)); } }
  async req(req: any): Promise<any> {
    const id = ++this.n; this.ws.send(JSON.stringify({ type: 'c_social', id, req }));
    await this.until(() => this.msgs.some((m) => m.type === 's_social_result' && m.id === id));
    return this.msgs.find((m) => m.type === 's_social_result' && m.id === id);
  }
  st() { return ctx.game.getSessionState(this.id)!; }
  event(kind: string) { return this.msgs.find((m) => m.type === 's_social_event' && m.kind === kind); }
}

describe('Achievements and codex (rules)', () => {
  it('every achievement has a data source, counters complete them once, rewards are paid once, titles recorded', () => {
    const ch = C.createCharacter('A');
    for (const a of ACHIEVEMENTS_CATALOG) expect(A.progressOf(ch, a.id) >= 0, a.id).toBe(true);
    expect(A.checkAchievements(ch)).toEqual([]);
    A.bump(ch, 'kills', 1);
    expect(A.checkAchievements(ch)).toEqual(['ach_first_blood']);
    const scrap = ch.wallet.scrap;
    expect(A.checkAchievements(ch)).toEqual([]); // not paid twice
    expect(ch.wallet.scrap).toBe(scrap);
    A.bump(ch, 'kills', 60);
    expect(A.checkAchievements(ch)).toContain('ach_kills_50');
    ch.level = 100;
    expect(A.checkAchievements(ch)).toEqual(expect.arrayContaining(['ach_reach_level_10', 'ach_reach_level_100']));
    ch.wallet.honor = 1e9;
    expect(A.checkAchievements(ch)).toEqual(expect.arrayContaining(['ach_honor_rank_captain', 'ach_honor_rank_general']));
    expect(A.codexAdd(ch, 'enemy', 'scout_buggy')).toBe(true);
    expect(A.codexAdd(ch, 'enemy', 'scout_buggy')).toBe(false);
    expect(A.codexProgress(ch).enemy.have).toBe(1);
  });
});

describe('Server: dungeons, achievements, explorer secrets', () => {
  it('a gate run: keys (3 free/day), waves, boss, rewards + first-clear bonus, return to the map; no keys -> refused', async () => {
    const p = await P.make();
    const ch = p.st().character; ch.level = 12;
    const def = DUNGEONS[0];
    expect((await p.req({ op: 'dungeon_list' })).data.freeKeysLeft).toBe(3);
    ch.level = 5;
    expect((await p.req({ op: 'dungeon_enter', dungeonId: def.id })).error).toBe('level_too_low');
    ch.level = 12;
    const scrap0 = ch.wallet.scrap;
    const r = await p.req({ op: 'dungeon_enter', dungeonId: def.id });
    expect(r.ok).toBe(true);
    expect((await p.req({ op: 'dungeon_list' })).data.freeKeysLeft).toBe(2);
    const inst = ctx.game.getSession(p.id)!.instance;
    expect(inst.world.dungeon).toBeDefined();
    const me = inst.world.entities.get(ctx.game.getSession(p.id)!.entityId)!;
    me.invulnerableTime = 1e9;
    for (let i = 0; i < 20000 && inst.world.dungeon!.status === 'running'; i++) {
      for (const e of inst.world.entities.values()) if (e.isHostile && e.hull > 0) { e.hull = 0; }
      ctx.game.stepAll();
    }
    await p.until(() => !!p.event('dungeon') && p.msgs.some((m) => m.kind === 'dungeon' && m.data.result));
    expect(p.msgs.find((m) => m.kind === 'dungeon' && m.data.result).data).toMatchObject({ result: 'cleared', first: true });
    expect(ch.wallet.scrap).toBeGreaterThanOrEqual(scrap0 + def.rewards.scrap + def.firstClearBonus.scrap);
    expect(ch.wallet.gateKeys).toBe(def.firstClearBonus.keys);
    expect(ch.stats['gates_cleared']).toBe(1);
    expect(ctx.game.getSession(p.id)!.instance.world.dungeon).toBeUndefined(); // back on a normal map
    // use up the free keys, then the earned key, then refuse
    for (let i = 0; i < 2; i++) { expect((await p.req({ op: 'dungeon_enter', dungeonId: def.id })).ok).toBe(true); await p.req({ op: 'dungeon_leave' }); }
    expect((await p.req({ op: 'dungeon_enter', dungeonId: def.id })).ok).toBe(true); // the earned gate key
    await p.req({ op: 'dungeon_leave' });
    expect((await p.req({ op: 'dungeon_enter', dungeonId: def.id })).error).toBe('no_keys');
  });

  it('a wipe fails the run and returns the player; achievements fire from server events and are sent to the client', async () => {
    const p = await P.make();
    p.st().character.level = 12;
    await p.req({ op: 'dungeon_enter', dungeonId: DUNGEONS[0].id });
    const inst = ctx.game.getSession(p.id)!.instance;
    for (let i = 0; i < 60; i++) ctx.game.stepAll();
    ctx.game.getSession(p.id)!.instance.world.entities.get(ctx.game.getSession(p.id)!.entityId)!.hull = 0;
    for (let i = 0; i < 10; i++) ctx.game.stepAll();
    expect(inst.world.dungeon!.status).toBe('failed');
    expect(ctx.game.getSession(p.id)!.instance.world.dungeon).toBeUndefined();
    p.st().character.stats['kills'] = 0;
    A.bump(p.st().character, 'kills');
    ctx.game.adminTeleport(p.id, 13); // sendCharacter -> achievement check
    await p.until(() => p.msgs.some((m) => m.kind === 'achievement' && m.data.id === 'ach_first_blood'));
  });

  it('standing on a map secret discovers it once (explorer quest credit, landmark counter, codex)', async () => {
    const p = await P.make();
    const sess = ctx.game.getSession(p.id)!;
    const secret = sess.instance.map.secrets![0];
    sess.instance.world.entities.get(sess.entityId)!.pos = { x: secret.x, y: secret.y };
    ctx.game.forgetPositions();
    const ch = p.st().character; ch.level = 100;
    ctx.game.getWorld(p.id)!.safeZones = [];
    for (let i = 0; i < 70; i++) ctx.game.stepAll();
    expect(ch.stats['landmarks']).toBe(1);
    for (let i = 0; i < 70; i++) ctx.game.stepAll();
    expect(ch.stats['landmarks']).toBe(1); // only once
    expect(ch.codex.secret).toContain(`${sess.instance.mapId}:${secret.id}`);
  });
});
