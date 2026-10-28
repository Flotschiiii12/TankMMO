import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp } from '../server/app.ts';
import { PROTOCOL_VERSION } from '../shared/protocol.ts';
import { TUTORIAL_STEPS } from '../shared/data/quests.ts';
import { openDatabase } from '../server/db.ts';
import { computeAnalytics, DETAIL_PATTERN, FeedbackRepo, sanitizeState, TelemetryRepo, TELEMETRY_KINDS, type TelemetryRow } from '../server/telemetry.ts';

const DAY = 86400;
const T0 = 20_000 * DAY; // a Wednesday-ish midnight, the exact weekday does not matter here
const row = (ts: number, kind: string, who: string, detail = ''): TelemetryRow => ({ ts, kind, who, detail });

describe('analytics maths', () => {
  it('retention counts only players whose day N is over, and only a start on exactly day N', () => {
    const rows = [
      row(T0 + 100, 'account_created', 'a'), row(T0 + 100, 'session_start', 'a'), row(T0 + DAY + 50, 'session_start', 'a'), row(T0 + 7 * DAY + 5, 'session_start', 'a'),
      row(T0 + 200, 'account_created', 'b'), row(T0 + 200, 'session_start', 'b'), row(T0 + 2 * DAY, 'session_start', 'b'), // b skipped day 1
      row(T0 + 5 * DAY, 'account_created', 'c'), row(T0 + 5 * DAY, 'session_start', 'c'), // too young for D7
    ];
    const a = computeAnalytics(rows, T0 + 8 * DAY + 100, TUTORIAL_STEPS);
    expect(a.accounts).toBe(3);
    expect(a.retention.d1).toEqual({ eligible: 3, retained: 1, rate: 1 / 3 }); // only a came back on day 1 (b skipped it, c has no second day)
    expect(a.retention.d7).toEqual({ eligible: 2, retained: 1, rate: 0.5 }); // c is too young: its day 7 has not ended
    expect(computeAnalytics(rows, T0 + 7 * DAY + 100, TUTORIAL_STEPS).retention.d7.eligible).toBe(0); // day 7 of a and b is still running
    expect(a.retention.d30.rate).toBeNull();
  });
  it('funnel counts distinct players per step, conversion against signups and the previous step', () => {
    const rows = [row(T0, 'account_created', 'a'), row(T0, 'account_created', 'b'), row(T0, 'account_created', 'c'), row(T0, 'account_created', 'd'),
      row(T0 + 1, 'tutorial_step', 'a', 'drive'), row(T0 + 1, 'tutorial_step', 'b', 'drive'), row(T0 + 1, 'tutorial_step', 'c', 'drive'), row(T0 + 2, 'tutorial_step', 'a', 'drive'),
      row(T0 + 3, 'tutorial_step', 'a', 'lock'), row(T0 + 3, 'tutorial_step', 'b', 'lock')];
    const a = computeAnalytics(rows, T0 + 100, TUTORIAL_STEPS);
    expect(a.funnel[0]).toMatchObject({ step: 'drive', players: 3, ofSignups: 0.75, ofPrevious: 0.75 });
    expect(a.funnel[1]).toMatchObject({ step: 'lock', players: 2, ofSignups: 0.5 });
    expect(a.funnel[1].ofPrevious).toBeCloseTo(2 / 3);
    expect(a.funnel[2]).toMatchObject({ players: 0, ofPrevious: 0 });
  });
  it('average session length, per-hour concurrency and crash recovery (a start without end closes at the next start)', () => {
    const h = Math.floor((T0 + 10 * 3600) / 3600) * 3600;
    const rows = [row(h - 3600 + 600, 'session_start', 'a'), row(h + 600, 'session_end', 'a', '3600'), // a: 10 min before to 10 min into the current hour
      row(h + 100, 'session_start', 'b'), row(h + 200, 'session_start', 'b'), row(h + 300, 'session_end', 'b', '100'), // b crashed once
      row(h + 100, 'session_end', 'c', '-5'), row(h + 100, 'session_end', 'd', 'abc')];
    const a = computeAnalytics(rows, h + 1000, TUTORIAL_STEPS);
    expect(a.sessions).toEqual({ count: 2, avgSeconds: 1850 }); // bad lengths are ignored
    const last = a.concurrentByHour[23]; const prev = a.concurrentByHour[22];
    expect(last.hourStart).toBe(h); expect(last.players).toBe(2); expect(prev.players).toBe(1);
    expect(a.peakConcurrent).toBe(2);
  });
  it('empty input gives nulls, not NaN', () => {
    const a = computeAnalytics([], T0, TUTORIAL_STEPS);
    expect(a.retention.d1.rate).toBeNull(); expect(a.sessions.avgSeconds).toBeNull(); expect(a.funnel.every((f) => f.ofSignups === null)).toBe(true);
    expect(JSON.stringify(a)).not.toContain('NaN');
  });
});

describe('privacy rules', () => {
  it('only listed kinds and short machine tokens are accepted; names, sentences and ids with spaces are refused', () => {
    const t = new TelemetryRepo(openDatabase(':memory:'));
    expect(t.log('level', 'acc1', '10')).toBe(true);
    for (const bad of ['Hello World', 'Max Mustermann', 'a'.repeat(40), 'x@y.de', '192.168.0.1 ', 'ä']) expect(t.log('tutorial_step', 'acc1', bad), bad).toBe(false);
    expect(t.log('chat' as any, 'acc1', 'x')).toBe(false);
    expect(DETAIL_PATTERN.test('gate_1')).toBe(true);
    expect(TELEMETRY_KINDS).not.toContain('chat' as any);
  });
  it('milestones are stored once per player, sessions repeat, the hash is salted and not the account id', () => {
    const db = openDatabase(':memory:'); const t = new TelemetryRepo(db);
    expect(t.log('first_kill', 'acc-secret-1')).toBe(true); expect(t.log('first_kill', 'acc-secret-1')).toBe(false);
    t.log('session_start', 'acc-secret-1'); t.log('session_start', 'acc-secret-1');
    const rows = t.rows();
    expect(rows.filter((r) => r.kind === 'first_kill')).toHaveLength(1); expect(rows.filter((r) => r.kind === 'session_start')).toHaveLength(2);
    expect(rows.every((r) => !r.who.includes('acc-secret-1') && r.who.length === 16)).toBe(true);
    const other = new TelemetryRepo(openDatabase(':memory:'));
    expect(other.hash('acc-secret-1')).not.toBe(t.hash('acc-secret-1')); // a different database has a different salt
    expect(new TelemetryRepo(db).hash('acc-secret-1')).toBe(t.hash('acc-secret-1')); // the salt persists
  });
  it('the table has exactly the columns the privacy text promises', () => {
    const db = openDatabase(':memory:');
    const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as any[]).map((c) => c.name).sort();
    expect(cols('telemetry')).toEqual(['detail', 'id', 'kind', 'ts', 'who']);
    expect(cols('feedback')).toEqual(['id', 'kind', 'state_json', 'status', 'text', 'ts', 'who']);
  });
  it('forget() removes events and feedback of one player and prune() old events', () => {
    let now = T0; const db = openDatabase(':memory:'); const t = new TelemetryRepo(db, () => now); const f = new FeedbackRepo(db, t, () => now);
    t.log('first_kill', 'a'); t.log('first_kill', 'b'); f.submit('a', 'bug', 'broken thing', {});
    t.forget('a');
    expect(t.rows().map((r) => r.who)).toEqual([t.hash('b')]); expect(f.list()).toHaveLength(0);
    now = T0 + 181 * DAY; expect(t.prune(180)).toBe(1); expect(t.rows()).toHaveLength(0);
  });
});

describe('feedback', () => {
  it('rate limits to 3 per hour per account, trims text, falls back to "other" and keeps only whitelisted state', () => {
    let now = T0; const db = openDatabase(':memory:'); const f = new FeedbackRepo(db, new TelemetryRepo(db, () => now), () => now);
    expect(f.submit('a', 'bug', 'x', {}).error).toBe('too_short');
    for (let i = 0; i < 3; i++) expect(f.submit('a', 'weird', 'a'.repeat(5000), {}).ok).toBe(true);
    expect(f.submit('a', 'bug', 'one more', {}).error).toBe('rate_limited');
    expect(f.submit('b', 'bug', 'other player', {}).ok).toBe(true);
    now += 3601; expect(f.submit('a', 'bug', 'later', {}).ok).toBe(true);
    const list = f.list(); expect(list.find((x) => x.text.length > 900)!.text).toHaveLength(1000); expect(list.find((x) => x.kind === 'other')).toBeTruthy();
  });
  it('the state dump keeps map, level, version and the last 20 error codes and nothing else', () => {
    const errs = Array.from({ length: 30 }, (_, i) => `err_${i}`);
    const s = sanitizeState({ map: 5, level: 12.7, version: '1.1.0', name: 'Max', email: 'a@b.de', chat: 'hi', map2: 1 }, [...errs, 'Has Space', 'x'.repeat(50)]);
    expect(s).toEqual({ map: 5, level: 12, version: '1.1.0', errors: errs.slice(-20) });
    expect(sanitizeState({ map: 'x', version: '<script>' }, [])).toEqual({ errors: [] });
  });
});

describe('through the real server', () => {
  let ctx: ReturnType<typeof createApp>; let port: number;
  beforeEach(async () => { ctx = createApp({ adminToken: 'tok' }); port = await ctx.game.listen(0); });
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
  let socialSeq = 0;
  const social = async (p: Awaited<ReturnType<typeof join>>, req: any) => {
    const id = ++socialSeq; p.ws.send(JSON.stringify({ type: 'c_social', id, req }));
    for (let i = 0; i < 300; i++) { ctx.game.stepAll(); const m = p.msgs.find((x) => x.type === 's_social_result' && x.id === id); if (m) return m; await new Promise((r) => setTimeout(r, 4)); }
    throw new Error('no reply');
  };

  it('logs account, session and milestones with hashed ids only, and the admin endpoint returns them', async () => {
    const p = await join();
    const st = ctx.game.getSessionState(p.id)!; st.character.level = 10; st.character.stats['kills'] = 3; st.character.stats['tut_drive'] = 1; st.character.stats['crafted'] = 1;
    ctx.game.save(ctx.game.getSession(p.id)!);
    p.ws.close(); await new Promise((r) => setTimeout(r, 50));
    const rows = ctx.telemetry.rows();
    const kinds = rows.map((r) => `${r.kind}:${r.detail}`);
    for (const k of ['account_created:', 'session_start:', 'first_kill:', 'first_craft:', 'tutorial_step:drive', 'level:5', 'level:10']) expect(kinds, k).toContain(k);
    expect(kinds).not.toContain('level:20');
    expect(kinds.some((k) => k.startsWith('session_end:'))).toBe(true);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(p.id); expect(dump).not.toContain(p.name);
    const r = await fetch(`http://127.0.0.1:${port}/admin/api/analytics`, { headers: { 'x-admin-token': 'tok' } });
    expect(r.status).toBe(200);
    const a = (await r.json()) as any; expect(a.accounts).toBe(1); expect(a.milestones.first_kill).toBe(1);
    expect((await fetch(`http://127.0.0.1:${port}/admin/api/analytics`)).status).toBe(401);
  });

  it('a feedback report stores map, level and the last error codes server-side and ignores client-claimed state', async () => {
    const p = await join();
    const bad = await social(p, { op: 'feedback', kind: 'bug', text: 'hi' }); expect(bad).toMatchObject({ ok: false, error: 'too_short' });
    const ok = await social(p, { op: 'feedback', kind: 'bug', text: 'The gate did not open', version: '1.1.0', level: 99, map: 77 });
    expect(ok.ok).toBe(true);
    const fb = ctx.feedback.list();
    expect(fb).toHaveLength(1);
    expect(fb[0].state.level).toBe(ctx.game.getSessionState(p.id)!.character.level); // not the 99 the client claimed
    expect(fb[0].state.map).not.toBe(77);
    expect(fb[0].state.errors).toContain('too_short'); // the failed first attempt
    expect(JSON.stringify(fb)).not.toContain(p.id);
    const r = await fetch(`http://127.0.0.1:${port}/admin/api/feedback`, { headers: { 'x-admin-token': 'tok' } });
    expect(((await r.json()) as any[])[0].text).toBe('The gate did not open');
    p.ws.close();
  });
});
