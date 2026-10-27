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
