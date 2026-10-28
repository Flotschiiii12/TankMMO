import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { AntiCheat } from '../server/anticheat.ts';
import { createApp } from '../server/app.ts';
import { PROTOCOL_VERSION } from '../shared/protocol.ts';
import { WORLD_BOSS_MAPS, activeEvents, worldBossSlot } from '../shared/sim/events.ts';

process.env.LOAD_TEST = '1';
let ctx: ReturnType<typeof createApp> | undefined;
afterEach(async () => { await ctx?.game.close(); ctx = undefined; });

describe('Anti-cheat heuristics', () => {
  it('flags machine-regular input timing, floods and marathon sessions; normal play stays clean', () => {
    const ac = new AntiCheat();
    ac.join('bot', 'Bot', 0); ac.join('human', 'Human', 0);
    let t = 0;
    for (let i = 0; i < 150; i++) { t += 100; ac.input('bot', t); }
    let h = 0; let seed = 7;
    for (let i = 0; i < 150; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; h += 80 + (seed % 120); ac.input('human', h); }
    expect(ac.report('bot', t)!.reasons).toContain('machine-regular input timing');
    expect(ac.report('human', h)!.score).toBe(0);
    for (let i = 0; i < 6; i++) ac.rejected('human', 'flood');
    expect(ac.report('human', 0)!.reasons).toContain('input flooding');
    expect(ac.report('bot', 21 * 3600_000)!.reasons).toContain('session longer than 20 h');
    expect(ac.flagged(t).map((r) => r.accountId)).toEqual(['bot']);
    ac.leave('bot');
    expect(ac.report('bot', t)).toBeUndefined();
  });
});

describe('Scheduler', () => {
  it('rotates daily quests at the day change, announces the faction-war result at the week change, forwards world messages as chat', async () => {
    let now = 20000 * 86400_000 + 3600_000; // a fixed day, 01:00
    ctx = createApp({ clock: { nowMs: () => now }, adminToken: 'x' });
    const port = await ctx.game.listen(0);
    const g = await (await fetch(`http://127.0.0.1:${port}/api/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ageConfirmed: true }) })).json() as any;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const msgs: any[] = [];
    await new Promise<void>((r) => ws.on('open', () => r()));
    ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
    const [a, s] = g.credential.split('.');
    ws.send(JSON.stringify({ type: 'c_join', protocolVersion: PROTOCOL_VERSION, accountId: a, secret: s }));
    const until = async (f: () => boolean) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > 3000) throw new Error('timeout'); ctx!.game.stepAll(); await new Promise((r) => setTimeout(r, 4)); } };
    await until(() => msgs.some((m) => m.type === 's_character'));
    const st = ctx.game.getSessionState(a)!;
    const day1 = [...st.character.quests.dailyIds];
    expect(day1).toHaveLength(5);

    ctx.game.runScheduler(); // same day: nothing changes
    expect(st.character.quests.dailyIds).toEqual(day1);
    now += 24 * 3600_000;
    ctx.game.runScheduler();
    expect(st.character.quests.dailyIds).not.toEqual(day1);
    await until(() => msgs.filter((m) => m.type === 's_character').length > 1); // the player was sent the new quests

    // week change: war result announcement
    now += 7 * 24 * 3600_000;
    ctx.game.runScheduler(); now += 7 * 24 * 3600_000; ctx.game.runScheduler();
    await until(() => msgs.some((m) => m.type === 's_social_event' && m.kind === 'war_result'));
    expect(msgs.some((m) => m.type === 's_social_event' && m.kind === 'announcement' && /Faction war/.test(m.data.text))).toBe(true);

    // world messages (e.g. an event start) reach players as system chat
    const world = ctx.game.getWorld(a)!;
    world.clockOffset = 0; // the invasion window is active at clock 0 on home maps
    world.time = 0;
    for (let i = 0; i < 40; i++) ctx.game.stepAll();
    await until(() => msgs.some((m) => m.type === 's_chat' && m.message.channel === 'S' && /Event started/.test(m.message.text)));
    ws.close();
  });

  it('event schedule and world-boss rotation are consistent with the design (2 h slots on maps 19 and 27)', () => {
    expect(WORLD_BOSS_MAPS).toEqual([19, 27]);
    const slots = [0, 1, 2, 3].map((i) => worldBossSlot(i * 7200).mapId);
    expect(slots).toEqual([19, 27, 19, 27]);
    expect(activeEvents(10).map((e) => e.kind)).toContain('invasion');
  });

  it('admin endpoint lists flagged accounts; metrics expose tick timing', async () => {
    ctx = createApp({ adminToken: 'tok' });
    const port = await ctx.game.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/admin/api/flagged`, { headers: { 'x-admin-token': 'tok' } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([]);
    expect((await fetch(`http://127.0.0.1:${port}/admin/api/flagged`)).status).toBe(401);
    expect(await (await fetch(`http://127.0.0.1:${port}/metrics`)).text()).toContain('treadfront_tick_ms_max');
  });
});

describe('Daily database backup', () => {
  it('creates a restorable backup and keeps only the newest ones', async () => {
    const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
    const { backupDatabase, openDatabase } = await import('../server/db.ts');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfb-'));
    const db = openDatabase(':memory:');
    db.exec("INSERT INTO accounts (id, name, secret_hash, created_at) VALUES ('a','Alice','h',1)");
    for (let i = 0; i < 4; i++) backupDatabase(db, dir, 2, new Date(2026, 0, 1, 0, 0, i));
    const files = fs.readdirSync(dir).sort();
    expect(files).toHaveLength(2);
    const restored = openDatabase(path.join(dir, files[1]));
    expect((restored.prepare('SELECT name FROM accounts').get() as any).name).toBe('Alice');
  });
});
