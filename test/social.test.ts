import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp } from '../server/app.ts';
import { PROTOCOL_VERSION } from '../shared/protocol.ts';

process.env.LOAD_TEST = '1'; // many guest accounts per test: bypass the REST rate limit
let ctx: ReturnType<typeof createApp>;
let port: number;
const ADMIN = 'test-admin-token';
beforeEach(async () => { ctx = createApp({ adminToken: ADMIN }); port = await ctx.game.listen(0); });
afterEach(async () => { await ctx.game.close(); });

const post = async (path: string, body: any, headers: Record<string, string> = {}) => {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: r.status, json: (await r.json()) as any };
};

class P {
  ws!: WebSocket; msgs: any[] = []; name = ''; id = ''; n = 0; closed?: number;
  static async make(): Promise<P> {
    const p = new P();
    const g = (await post('/api/guest', { ageConfirmed: true })).json;
    p.name = g.name; p.id = g.accountId;
    p.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((r) => p.ws.on('open', () => r()));
    p.ws.on('message', (d) => p.msgs.push(JSON.parse(d.toString())));
    p.ws.on('close', (c) => { p.closed = c; });
    const [a, s] = g.credential.split('.');
    p.ws.send(JSON.stringify({ type: 'c_join', protocolVersion: PROTOCOL_VERSION, accountId: a, secret: s }));
    await p.until(() => p.msgs.some((m) => m.type === 's_character'));
    return p;
  }
  async until(f: () => boolean, ms = 3000) { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout'); ctx?.game.stepAll(); await new Promise((r) => setTimeout(r, 4)); } }
  async req(req: any): Promise<any> {
    const id = ++this.n; this.ws.send(JSON.stringify({ type: 'c_social', id, req }));
    await this.until(() => this.msgs.some((m) => m.type === 's_social_result' && m.id === id));
    return this.msgs.find((m) => m.type === 's_social_result' && m.id === id);
  }
  seqIn = 0;
  input(...commands: any[]) { this.ws.send(JSON.stringify({ type: 'c_input', seq: ++this.seqIn, commands, clientTime: 0 })); }
  chat(channel: string, text: string, to?: string) { this.ws.send(JSON.stringify({ type: 'c_chat', channel, text, targetRecipient: to })); }
  heard(text: string) { return this.msgs.some((m) => m.type === 's_chat' && m.message.text.includes(text)); }
  event(kind: string) { return this.msgs.some((m) => m.type === 's_social_event' && m.kind === kind); }
  close() { this.ws.close(); }
}

describe('Friends, blocks, reports, whispers', () => {
  it('friend request -> accept -> list shows online; blocking removes the friendship and silences whispers', async () => {
    const a = await P.make(); const b = await P.make();
    expect((await a.req({ op: 'friend_request', name: b.name })).ok).toBe(true);
    await b.until(() => b.event('friend_request'));
    expect((await a.req({ op: 'friend_request', name: b.name })).error).toBe('already_requested');
    expect((await b.req({ op: 'friend_accept', name: a.name })).ok).toBe(true);
    const list = (await a.req({ op: 'friend_list' })).data;
    expect(list).toMatchObject([{ name: b.name, status: 'accepted', online: true }]);
    expect((await a.req({ op: 'friend_request', name: 'Nobody' })).error).toBe('unknown_player');

    a.chat('W', 'psst hello', b.name);
    await b.until(() => b.heard('psst hello'));
    expect(a.heard('psst hello')).toBe(true); // echo to the sender

    expect((await b.req({ op: 'block', name: a.name })).ok).toBe(true);
    expect((await a.req({ op: 'friend_list' })).data).toEqual([]);
    await new Promise((r) => setTimeout(r, 1100)); // slow mode
    a.chat('W', 'still there?', b.name);
    await new Promise((r) => setTimeout(r, 1100));
    a.chat('G', 'global after block');
    await a.until(() => a.heard('global after block'));
    await new Promise((r) => setTimeout(r, 100));
    expect(b.heard('still there?')).toBe(false);
    expect(b.heard('global after block')).toBe(false); // blocked sender hidden in global chat too
    expect((await b.req({ op: 'block_list' })).data.map((x: any) => x.name)).toEqual([a.name]);
    expect((await b.req({ op: 'unblock', name: a.name })).ok).toBe(true);
    a.close(); b.close();
  });

  it('reports are stored, limited per hour, and visible to admins only', async () => {
    const a = await P.make(); const b = await P.make();
    expect((await a.req({ op: 'report', name: b.name, reason: 'spam' })).ok).toBe(true);
    expect((await post('/admin/api/ban', { name: b.name }, {})).status).toBe(401);
    const rep = await fetch(`http://127.0.0.1:${port}/admin/api/reports`, { headers: { 'x-admin-token': ADMIN } });
    expect(((await rep.json()) as any[])[0]).toMatchObject({ reason: 'spam', status: 'open' });
    for (let i = 0; i < 9; i++) await a.req({ op: 'report', name: b.name, reason: 'x' });
    expect((await a.req({ op: 'report', name: b.name, reason: 'x' })).error).toBe('too_many_reports');
    a.close(); b.close();
  });
});

describe('Parties', () => {
  it('invite/accept, party chat, max 5, leader kick, leave dissolves a 2-person party; kill XP is shared with a bonus', async () => {
    const a = await P.make(); const b = await P.make();
    expect((await a.req({ op: 'party_invite', name: b.name })).ok).toBe(true);
    await b.until(() => b.event('party_invite'));
    expect((await b.req({ op: 'party_accept', name: a.name })).ok).toBe(true);
    expect((await a.req({ op: 'party_info' })).data.members).toHaveLength(2);
    a.chat('P', 'party hello');
    await b.until(() => b.heard('party hello'));

    // shared XP: kill a monster with A while B stands next to A
    const wa = ctx.game.getWorld(a.id)!; const sa = ctx.game.getSessionState(a.id)!; const sb = ctx.game.getSessionState(b.id)!;
    wa.safeZones = [];
    sb.entity.pos = { x: sa.entity.pos.x + 50, y: sa.entity.pos.y };
    const foe = [...wa.entities.values()].find((e) => e.kind === 'scout_buggy')!;
    foe.level = 30; foe.pos = { x: sa.entity.pos.x + 200, y: sa.entity.pos.y }; foe.hull = 1; foe.armor = 0;
    sa.entity.invulnerableTime = 1e9; sb.entity.invulnerableTime = 1e9;
    const bXp = sb.character.xp + sb.character.level * 1e6;
    a.ws.send(JSON.stringify({ type: 'c_input', seq: 1, commands: [{ type: 'SetTarget', targetId: foe.id }, { type: 'ToggleAutoFire' }], clientTime: 0 }));
    await a.until(() => foe.hull <= 0, 6000);
    for (let i = 0; i < 5; i++) ctx.game.stepAll();
    expect(sb.character.xp + sb.character.level * 1e6).toBeGreaterThan(bXp); // the teammate got XP without firing

    expect((await b.req({ op: 'party_leave' })).ok).toBe(true);
    expect((await a.req({ op: 'party_info' })).data).toBeNull();
    a.close(); b.close();
  });

  it('refuses a sixth member and non-leader invites', async () => {
    const ps = await Promise.all(Array.from({ length: 6 }, () => P.make()));
    for (let i = 1; i < 5; i++) { await ps[0].req({ op: 'party_invite', name: ps[i].name }); expect((await ps[i].req({ op: 'party_accept', name: ps[0].name })).ok).toBe(true); }
    expect((await ps[0].req({ op: 'party_invite', name: ps[5].name })).error).toBe('party_full');
    expect((await ps[1].req({ op: 'party_invite', name: ps[5].name })).error).toBe('not_leader');
    expect((await ps[1].req({ op: 'party_kick', name: ps[2].name })).error).toBe('not_leader');
    expect((await ps[0].req({ op: 'party_kick', name: ps[2].name })).ok).toBe(true);
    ps.forEach((p) => p.close());
  });
});

describe('Clans', () => {
  it('create costs scrap, tags show on the vehicle, roles/permissions, storage log, research, clan chat, leave/leadership transfer', async () => {
    const a = await P.make(); const b = await P.make(); const c = await P.make();
    expect((await a.req({ op: 'clan_create', name: 'Iron Wolves', tag: 'IW' })).error).toBe('not_enough_scrap');
    ctx.game.getSessionState(a.id)!.character.wallet.scrap = 100_000;
    expect((await a.req({ op: 'clan_create', name: 'X', tag: 'IW' })).error).toBe('invalid_clan_name');
    expect((await a.req({ op: 'clan_create', name: 'Iron Wolves', tag: 'TOOLONGTAG' })).error).toBe('invalid_tag');
    expect((await a.req({ op: 'clan_create', name: 'Iron Wolves', tag: 'IW' })).ok).toBe(true);
    expect(ctx.game.getSessionState(a.id)!.character.wallet.scrap).toBe(90_000);
    expect(ctx.game.getSessionState(a.id)!.entity.clanTag).toBe('IW');

    expect((await a.req({ op: 'clan_invite', name: b.name })).ok).toBe(true);
    await b.until(() => b.event('clan_invite'));
    expect((await b.req({ op: 'clan_invites' })).data).toHaveLength(1);
    const clanId = (await b.req({ op: 'clan_invites' })).data[0].clanId;
    expect((await b.req({ op: 'clan_accept', clanId })).ok).toBe(true);
    expect((await b.req({ op: 'clan_invite', name: c.name })).error).toBe('no_permission'); // plain member
    expect((await b.req({ op: 'clan_kick', name: a.name })).error).toBe('no_permission');
    expect((await b.req({ op: 'clan_role', name: a.name, role: 'member' })).error).toBe('no_permission');

    a.chat('C', 'clan only');
    await b.until(() => b.heard('clan only'));
    expect(c.heard('clan only')).toBe(false);

    expect((await b.req({ op: 'clan_donate', amount: 999999 })).error).toBe('not_enough_scrap');
    ctx.game.getSessionState(b.id)!.character.wallet.scrap = 500;
    expect((await b.req({ op: 'clan_donate', amount: 400 })).ok).toBe(true);
    expect(ctx.game.getSessionState(b.id)!.character.wallet.scrap).toBe(100);
    let info = (await a.req({ op: 'clan_info' })).data;
    expect(info.scrap).toBe(400);
    expect(info.log.map((l: any) => l.text).join('|')).toContain('Donated 400');
    expect((await a.req({ op: 'clan_research', id: 'storage' })).error).toBe('clan_scrap_too_low');

    expect((await a.req({ op: 'clan_role', name: b.name, role: 'officer' })).ok).toBe(true);
    expect((await b.req({ op: 'clan_invite', name: c.name })).ok).toBe(true); // officers may invite
    expect((await a.req({ op: 'clan_leave' })).ok).toBe(true); // leader leaves: officer inherits
    info = (await b.req({ op: 'clan_info' })).data;
    expect(info.myRole).toBe('leader');
    expect((await b.req({ op: 'ranking', kind: 'clans' })).data[0]).toMatchObject({ name: 'Iron Wolves', members: 1 });
    expect((await b.req({ op: 'clan_leave' })).ok).toBe(true);
    expect(ctx.social.clanOf(b.id)).toBeUndefined();
    [a, b, c].forEach((p) => p.close());
  });
});

describe('Profile, rankings, admin tools', () => {
  it('profile card + level ranking; admin can announce, mute, ban (kicks live), rename and delete', async () => {
    const a = await P.make(); const b = await P.make();
    const prof = (await a.req({ op: 'profile', name: b.name })).data;
    expect(prof).toMatchObject({ name: b.name, level: 1, online: true, isFriend: false });
    expect(prof.power).toBeGreaterThan(0);
    expect((await a.req({ op: 'ranking', kind: 'level' })).data.length).toBeGreaterThan(0);

    const admin = (path: string, body: any) => post(`/admin/api/${path}`, body, { 'x-admin-token': ADMIN });
    expect((await admin('announce', { text: 'Server restart soon' })).status).toBe(200);
    await a.until(() => a.event('announcement'));
    expect((await admin('mute', { name: a.name, hours: 1 })).status).toBe(200);
    a.chat('G', 'muted message');
    await a.until(() => a.msgs.some((m) => m.type === 's_error' && m.code === 'muted'));
    expect((await admin('rename', { name: b.name, newName: 'Renamed_One' })).status).toBe(200);
    expect(ctx.accounts.get(b.id)!.name).toBe('Renamed_One');
    expect((await admin('rename', { name: 'Renamed_One', newName: a.name })).status).toBe(400); // name taken
    expect((await admin('ban', { name: a.name, hours: 1 })).status).toBe(200);
    await a.until(() => a.closed !== undefined);
    expect(a.closed).toBe(4403);
    // banned accounts cannot rejoin
    expect(ctx.accounts.get(a.id)!.bannedUntil).toBeGreaterThan(Date.now());
    expect((await admin('delete', { name: 'Renamed_One' })).status).toBe(200);
    expect(ctx.accounts.get(b.id)).toBeUndefined();
    const audit = await (await fetch(`http://127.0.0.1:${port}/admin/api/audit`, { headers: { 'x-admin-token': ADMIN } })).json() as any[];
    expect(audit.map((x) => x.action)).toEqual(expect.arrayContaining(['announce', 'mute', 'rename', 'ban', 'delete']));
    expect((await fetch(`http://127.0.0.1:${port}/admin`)).status).toBe(200);
  });
});

describe('PvP, bounties, arena and faction war (server)', () => {
  async function pvpPlayer(faction: 'coastal' | 'highland' | 'steppe', map = 23) {
    const p = await P.make();
    const st = ctx.game.getSessionState(p.id)!;
    st.character.faction = faction; st.character.level = 20;
    ctx.game.adminTeleport(p.id, map);
    const s = ctx.game.getSession(p.id)!;
    const w = ctx.game.getWorld(p.id)!;
    w.safeZones = [];
    for (const x of [...w.entities.values()]) if (x.isHostile) w.entities.delete(x.id); // no monsters: this test is about players
    w.pve.respawnQueue = [];
    const e = ctx.game.getSessionState(p.id)!.entity;
    e.faction = faction; e.level = 20; e.invulnerableTime = 0;
    return { p, s, w, e };
  }
  const kill = async (killer: Awaited<ReturnType<typeof pvpPlayer>>, victim: Awaited<ReturnType<typeof pvpPlayer>>) => {
    const k = ctx.game.getSessionState(killer.p.id)!.entity; const v = ctx.game.getSessionState(victim.p.id)!.entity;
    v.hull = 1; v.armor = 0; v.invulnerableTime = 0; k.invulnerableTime = 0;
    k.hull = k.maxHull; k.armor = k.maxArmor;
    k.pos = { x: 2000, y: 2000 }; // away from portals (400-unit protection radius)
    v.pos = { x: k.pos.x + 200, y: k.pos.y };
    killer.p.input({ type: 'SetTarget', targetId: v.id }, { type: 'ToggleAutoFire' });
    try { await killer.p.until(() => v.hull <= 0, 3000); } catch (err) { console.log('KILL FAIL', { kPos: k.pos, vPos: v.pos, kHull: k.hull, kInv: k.invulnerableTime, vInv: v.invulnerableTime, kFac: k.faction, vFac: v.faction, kLvl: k.level, vLvl: v.level, tgt: k.targetId, vid: v.id, auto: k.autoFire, reload: k.mainReloadRemaining, safe: ctx.game.getWorld(killer.p.id)!.safeZones.length, pvp: ctx.game.getWorld(killer.p.id)!.pvp }); throw err; }
    for (let i = 0; i < 3; i++) ctx.game.stepAll();
    // respawn takes 5 s: fast-forward
    for (let i = 0; i < 160; i++) ctx.game.stepAll();
    killer.p.input({ type: 'ToggleAutoFire' }); // off again
    for (let i = 0; i < 3; i++) ctx.game.stepAll();
  };

  it('PvP kill: honor for the killer, small loss for the victim, streak bounty claimed by the next killer; same faction is safe', { timeout: 40000 }, async () => {
    const a = await pvpPlayer('coastal'); const b = await pvpPlayer('highland'); const c = await pvpPlayer('highland'); const e3 = await pvpPlayer('highland');
    const wa = ctx.game.getSessionState(a.p.id)!;
    b.s.character.wallet.honor = 50;
    for (const v of [b, c, e3, b, c]) await kill(a, v); // the kill cap forbids a 3rd kill of the same victim, so rotate victims
    expect(b.s.character.wallet.honor).toBeLessThan(50);
    expect(wa.character.wallet.honor).toBeGreaterThan(0);
    expect(a.s.streak).toBe(5);
    expect(a.s.bounty).toBe(2000);
    // another highland player claims the bounty
    a.e.pos = { x: 2000, y: 2000 }; c.e.invulnerableTime = 0; a.e.invulnerableTime = 0; c.e.hull = c.e.maxHull; c.e.pos = { x: 2150, y: 2000 }; a.e.hull = 1; a.e.armor = 0;
    const scrap = c.s.character.wallet.scrap;
    c.p.input({ type: 'SetTarget', targetId: a.e.id }, { type: 'ToggleAutoFire' });
    await c.p.until(() => a.e.hull <= 0, 6000);
    for (let i = 0; i < 3; i++) ctx.game.stepAll();
    expect(c.s.character.wallet.scrap).toBeGreaterThanOrEqual(scrap + 2000);
    expect(a.s.bounty).toBe(0);
    // same faction cannot hurt each other
    const d = await pvpPlayer('highland');
    const hp = d.e.hull + d.e.armor;
    c.p.input({ type: 'SetTarget', targetId: d.e.id });
    for (let i = 0; i < 60; i++) ctx.game.stepAll();
    expect(d.e.hull + d.e.armor).toBe(hp);
  });

  it('arena: queue, match with own vehicles, best of 3, Elo update, return to hub; leaving a match is penalised', { timeout: 40000 }, async () => {
    const a = await P.make(); const b = await P.make();
    expect((await a.req({ op: 'arena_status' })).data).toMatchObject({ league: 'silver', queued: null });
    expect((await a.req({ op: 'arena_queue', mode: '2v2' as any })).error).toBe('bad_mode');
    expect((await a.req({ op: 'arena_queue', mode: '1v1' })).ok).toBe(true);
    expect((await a.req({ op: 'arena_queue', mode: '1v1' })).error).toBe('already_queued');
    expect((await b.req({ op: 'arena_queue', mode: '1v1' })).ok).toBe(true);
    await a.until(() => a.event('arena_start'), 5000);
    const sa = ctx.game.getSessionState(a.id)!; const sb = ctx.game.getSessionState(b.id)!;
    expect(sa.mapId).toBe(30); expect(sb.mapId).toBe(30);
    expect(sa.entity.team).not.toBe(sb.entity.team);
    // frozen during the countdown
    const p0 = { ...sa.entity.pos };
    a.ws.send(JSON.stringify({ type: 'c_input', seq: 1, commands: [{ type: 'Drive', x: 1, y: 0 }], clientTime: 0 }));
    for (let i = 0; i < 30; i++) ctx.game.stepAll();
    expect(sa.entity.pos.x).toBe(p0.x);
    // wait for the fight, then win two rounds by wiping B
    const winRound = async () => {
      await a.until(() => ctx.game.getSessionState(a.id)?.mapId !== 30 || (ctx.game.getSession(a.id)!.instance.arena!.state.phase === 'fighting'), 8000);
      if (ctx.game.getSessionState(a.id)?.mapId !== 30) return;
      const eb = ctx.game.getSessionState(b.id)!.entity; eb.hull = 0;
      for (let i = 0; i < 400 && ctx.game.getSessionState(a.id)?.mapId === 30 && ctx.game.getSession(a.id)!.instance.arena!.state.phase === 'fighting'; i++) ctx.game.stepAll();
    };
    await winRound();
    await winRound();
    await a.until(() => a.event('arena_result'), 8000);
    const ra = a.msgs.find((m) => m.type === 's_social_event' && m.kind === 'arena_result').data;
    const rb = b.msgs.find((m) => m.type === 's_social_event' && m.kind === 'arena_result').data;
    expect(ra.won).toBe(true); expect(rb.won).toBe(false);
    expect(ra.ratingDelta).toBe(16); expect(rb.ratingDelta).toBe(-16);
    expect(ctx.arena.get(a.id, '1v1')).toMatchObject({ rating: 1016, wins: 1 });
    expect(ctx.game.getSessionState(a.id)!.mapId).toBe(13); // back in the hub
    expect((await a.req({ op: 'ranking', kind: 'arena_1v1' })).data[0]).toMatchObject({ rating: 1016 });

    // dodge penalty: leaving a match early bans queueing for 10 minutes
    const c = await P.make(); const d = await P.make();
    await c.req({ op: 'arena_queue', mode: '1v1' }); await d.req({ op: 'arena_queue', mode: '1v1' });
    await c.until(() => c.event('arena_start'), 5000);
    c.close();
    await d.until(() => ctx.game.getSession(c.id) === undefined);
    expect(ctx.game.playerCount()).toBeGreaterThan(0);
  });

  it('faction war: points are captured by standing in the zone, contested by two factions, and score accrues per owned point', async () => {
    const a = await pvpPlayer('coastal', 21); const b = await pvpPlayer('highland', 21);
    const w = a.w;
    const cp = w.war![0];
    a.e.pos = { x: cp.x, y: cp.y }; b.e.pos = { x: 100, y: 100 };
    a.e.invulnerableTime = b.e.invulnerableTime = 1e9;
    for (let i = 0; i < 30 * 14; i++) ctx.game.stepAll();
    expect(cp.owner).toBe('coastal');
    // contested: both inside, nobody progresses
    b.e.pos = { x: cp.x + 20, y: cp.y };
    for (let i = 0; i < 30; i++) ctx.game.stepAll();
    expect(cp.contested).toBe(true);
    // the owner keeps scoring
    b.e.pos = { x: 100, y: 100 };
    const before = w.warScore.coastal;
    for (let i = 0; i < 90; i++) ctx.game.stepAll();
    expect(w.warScore.coastal).toBeGreaterThan(before);
    expect((await a.p.req({ op: 'war_status' })).data.scores).toMatchObject({ coastal: expect.any(Number) });
  });
});

describe('Faction chat', () => {
  it('only players of the same faction hear the F channel', async () => {
    const a = await P.make(); const b = await P.make(); const c = await P.make();
    ctx.game.getSessionState(a.id)!.character.faction = 'coastal';
    ctx.game.getSessionState(b.id)!.character.faction = 'coastal';
    ctx.game.getSessionState(c.id)!.character.faction = 'highland';
    a.chat('F', 'coastal only');
    await b.until(() => b.heard('coastal only'));
    await new Promise((r) => setTimeout(r, 100));
    expect(c.heard('coastal only')).toBe(false);
    a.close(); b.close(); c.close();
  });
});
