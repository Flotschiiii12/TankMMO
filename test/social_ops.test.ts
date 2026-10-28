import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp } from '../server/app.ts';
import { PROTOCOL_VERSION } from '../shared/protocol.ts';

let ctx: ReturnType<typeof createApp>; let port: number; let seq = 0;
beforeEach(async () => { ctx = createApp({ adminToken: 'x' }); port = await ctx.game.listen(0); });
afterEach(async () => { await ctx.game.close(); });

async function join() {
  const g = (await (await fetch(`http://127.0.0.1:${port}/api/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ageConfirmed: true }) })).json()) as any;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); const msgs: any[] = [];
  await new Promise<void>((r) => ws.on('open', () => r()));
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
  const [a, s] = g.credential.split('.');
  ws.send(JSON.stringify({ type: 'c_join', protocolVersion: PROTOCOL_VERSION, accountId: a, secret: s }));
  for (let i = 0; i < 500 && !msgs.some((m) => m.type === 's_character'); i++) { ctx.game.stepAll(); await new Promise((r) => setTimeout(r, 4)); }
  return { id: g.accountId as string, name: g.name as string, ws, msgs };
}
const social = async (p: Awaited<ReturnType<typeof join>>, req: any) => {
  const id = ++seq; p.ws.send(JSON.stringify({ type: 'c_social', id, req }));
  for (let i = 0; i < 300; i++) { ctx.game.stepAll(); const m = p.msgs.find((x) => x.type === 's_social_result' && x.id === id); if (m) return m; await new Promise((r) => setTimeout(r, 4)); }
  throw new Error('no reply');
};

describe('read-only social ops added for the social suite', () => {
  it('players_nearby lists the others on the same map with public fields only, never myself or blocked players', async () => {
    const a = await join(); const b = await join(); const c = await join();
    const r = await social(a, { op: 'players_nearby' }); expect(r.ok).toBe(true);
    const names = r.data.map((x: any) => x.name); expect(names).toEqual(expect.arrayContaining([b.name, c.name])); expect(names).not.toContain(a.name);
    expect(Object.keys(r.data[0]).sort()).toEqual(['clanTag', 'faction', 'friend', 'inParty', 'level', 'name', 'sameParty']);
    await social(a, { op: 'block', name: c.name });
    const r2 = await social(a, { op: 'players_nearby' }); expect(r2.data.map((x: any) => x.name)).not.toContain(c.name);
    const r3 = await social(c, { op: 'players_nearby' }); expect(r3.data.map((x: any) => x.name)).not.toContain(a.name); // blocking hides both ways
    for (const p of [a, b, c]) p.ws.close();
  });
  it('ranking_me gives my position, null when unranked, and rejects a missing kind', async () => {
    const a = await join(); const b = await join();
    ctx.game.getSessionState(b.id)!.character.level = 12; ctx.game.save(ctx.game.getSession(b.id)!); // b is ahead of a
    ctx.game.save(ctx.game.getSession(a.id)!);
    const ra = await social(a, { op: 'ranking_me', kind: 'level' }); expect(ra.data).toMatchObject({ rank: 2, total: 2, value: 1 });
    const rb = await social(b, { op: 'ranking_me', kind: 'level' }); expect(rb.data).toMatchObject({ rank: 1, total: 2, value: 12 });
    expect((await social(a, { op: 'ranking_me', kind: 'honor' })).data).toBeNull();
    ctx.game.getSessionState(a.id)!.character.wallet.honor = 500; ctx.game.save(ctx.game.getSession(a.id)!);
    expect((await social(a, { op: 'ranking_me', kind: 'honor' })).data).toMatchObject({ rank: 1, total: 1, value: 500 });
    expect((await social(a, { op: 'ranking_me', kind: 'arena_1v1' })).data).toBeNull(); expect((await social(a, { op: 'ranking_me', kind: 'clans' })).data).toBeNull();
    expect((await social(a, { op: 'ranking_me' })).ok).toBe(false);
    a.ws.close(); b.ws.close();
  });
  it('the public profile now carries honor, faction and achievement count, still no private data', async () => {
    const a = await join(); const b = await join();
    const r = await social(a, { op: 'profile', name: b.name }); expect(r.ok).toBe(true);
    expect(Object.keys(r.data).sort()).toEqual(['achievements', 'activeSkin', 'blocked', 'clan', 'faction', 'honor', 'isFriend', 'level', 'name', 'online', 'power', 'titles', 'vehicle']);
    expect(JSON.stringify(r.data)).not.toMatch(/scrap|wallet|inventory|secret/i);
    a.ws.close(); b.ws.close();
  });
});
