import express from 'express';
import http from 'node:http';
import { AccountService } from './accounts.ts';
import { openDatabase, SqliteAccountRepo, SqliteChatRepo, SqliteProfileRepo } from './db.ts';
import { GameServer } from './gameServer.ts';

export interface AppOptions { dbPath?: string; staticDir?: string; adminToken?: string }

const hits = new Map<string, number[]>();
/** Tiny per-IP rate limiter for the REST endpoints. */
function rateLimit(max: number, windowMs: number): express.RequestHandler {
  return (req, res, next) => {
    if (process.env.LOAD_TEST === '1') return next();
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= max) return void res.status(429).json({ error: 'rate_limited' });
    list.push(now);
    hits.set(key, list);
    next();
  };
}

export function createApp(opts: AppOptions = {}) {
  const db = openDatabase(opts.dbPath ?? ':memory:');
  const accounts = new SqliteAccountRepo(db);
  const profiles = new SqliteProfileRepo(db);
  const chat = new SqliteChatRepo(db);
  const service = new AccountService(accounts);
  const app = express();
  app.use(express.json({ limit: '8kb' }));
  const server = http.createServer(app);
  const game = new GameServer({ accounts, profiles, chat, service, adminToken: opts.adminToken }, server);

  app.get('/health', (_req, res) => res.json({ ok: true, players: game.playerCount(), instances: game.instanceInfo().length }));
  app.get('/metrics', (_req, res) => {
    res.type('text/plain').send(
      [`treadfront_players ${game.playerCount()}`, `treadfront_ticks_total ${game.metrics.ticks}`, `treadfront_tick_ms_avg ${game.metrics.avgTickMs.toFixed(3)}`,
        `treadfront_tick_ms_max ${game.metrics.maxTickMs.toFixed(3)}`, `treadfront_bytes_out_total ${game.metrics.bytesOut}`,
        ...game.instanceInfo().map((i) => `treadfront_instance_players{id="${i.id}",map="${i.mapId}"} ${i.players}`)].join('\n') + '\n'
    );
  });

  app.post('/api/guest', rateLimit(10, 60_000), (req, res) => {
    const r = service.createGuest(req.body?.ageConfirmed === true);
    if (!r.ok) return void res.status(400).json({ error: r.error });
    res.json({ credential: r.cred.credential, accountId: r.cred.accountId, name: r.cred.name });
  });

  app.post('/api/recovery-code', rateLimit(5, 60_000), (req, res) => {
    const [id, secret] = String(req.body?.credential ?? '').split('.');
    const v = service.verify(id ?? '', secret ?? '');
    if (!v.ok) return void res.status(401).json({ error: v.error });
    res.json({ code: service.createRecoveryCode(id) });
  });

  app.post('/api/recover', rateLimit(10, 60_000), (req, res) => {
    const r = service.signInWithRecovery(String(req.body?.code ?? ''));
    if (!r.ok) return void res.status(400).json({ error: r.error });
    res.json({ credential: r.cred.credential, accountId: r.cred.accountId, name: r.cred.name });
  });

  app.post('/api/rename', rateLimit(5, 60_000), (req, res) => {
    const [id, secret] = String(req.body?.credential ?? '').split('.');
    const v = service.verify(id ?? '', secret ?? '');
    if (!v.ok) return void res.status(401).json({ error: v.error });
    const r = service.rename(id, String(req.body?.name ?? ''));
    return r.ok ? void res.json({ ok: true }) : void res.status(400).json({ error: r.error });
  });

  app.get('/api/time', (_req, res) => res.json({ now: Date.now() }));
  app.get('/api/leaderboard', (_req, res) => res.json({ top: profiles.topByLevel(20).map((p) => ({ name: p.name, level: p.level })) }));

  /** Data export (GDPR) and account deletion, both authenticated with the account credential. */
  app.post('/api/export', rateLimit(3, 60_000), (req, res) => {
    const [id, secret] = String(req.body?.credential ?? '').split('.');
    const v = service.verify(id ?? '', secret ?? '');
    if (!v.ok) return void res.status(401).json({ error: v.error });
    res.json({ account: { id: v.account.id, name: v.account.name, createdAt: v.account.createdAt }, profile: profiles.get(id) ?? null });
  });
  app.post('/api/delete-account', rateLimit(3, 60_000), (req, res) => {
    const [id, secret] = String(req.body?.credential ?? '').split('.');
    const v = service.verify(id ?? '', secret ?? '');
    if (!v.ok) return void res.status(401).json({ error: v.error });
    accounts.delete(id);
    res.json({ ok: true });
  });

  if (opts.staticDir) app.use(express.static(opts.staticDir));

  return { app, server, game, db, accounts, profiles, chat, service };
}
