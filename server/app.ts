import express from 'express';
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { AccountService } from './accounts.ts';
import { SocialRepo } from './social.ts';
import { MarketRepo, PremiumWallet } from './market.ts';
import { openDatabase, SqliteArenaRepo, SqliteWarRepo, SqliteAccountRepo, SqliteChatRepo, SqliteProfileRepo } from './db.ts';
import { GameServer } from './gameServer.ts';

export interface AppOptions { dbPath?: string; staticDir?: string; adminToken?: string; clock?: { nowMs(): number } }

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
  const social = new SocialRepo(db);
  const arena = new SqliteArenaRepo(db);
  const war = new SqliteWarRepo(db);
  const market = new MarketRepo(db);
  const premium = new PremiumWallet(db);
  const app = express();
  app.use(express.json({ limit: '8kb' }));
  const server = http.createServer(app);
  const game = new GameServer({ accounts, profiles, chat, service, social, arena, war, market, premium, adminToken: opts.adminToken, clock: opts.clock }, server);

  app.get('/health', (_req, res) => res.json({ ok: true, players: game.playerCount(), instances: game.instanceInfo().length }));
  app.get('/metrics', (_req, res) => {
    res.type('text/plain').send(
      [`treadfront_players ${game.playerCount()}`, `treadfront_ticks_total ${game.metrics.ticks}`, `treadfront_tick_ms_avg ${game.metrics.avgTickMs.toFixed(3)}`,
        `treadfront_tick_ms_max ${game.metrics.maxTickMs.toFixed(3)}`, `treadfront_bytes_out_total ${game.metrics.bytesOut}`,
        ...game.instanceInfo().map((i) => `treadfront_instance_players{id="${i.id}",map="${i.mapId}"} ${i.players}`)].join('\n') + '\n'
    );
  });

  app.post('/api/guest', rateLimit(10, 60_000), (req, res) => {
    const r = service.createGuest(req.body?.ageConfirmed === true, ['coastal', 'highland', 'steppe'].includes(req.body?.faction) ? req.body.faction : 'coastal');
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

  // ------------------------------------------------------------ admin (token protected)
  const adminOk: express.RequestHandler = (req, res, next) => {
    const given = String(req.header('x-admin-token') ?? '');
    const want = opts.adminToken ?? '';
    const a = Buffer.from(given); const b = Buffer.from(want);
    if (!want || a.length !== b.length || !timingSafeEqual(a, b)) return void res.status(401).json({ error: 'unauthorized' });
    next();
  };
  const findByName = (name: unknown) => accounts.getByName(String(name ?? ''));
  const admin = express.Router();
  admin.use(adminOk);
  admin.get('/stats', (_req, res) => res.json({ accounts: accounts.count(), online: game.playerCount(), instances: game.instanceInfo(), metrics: game.metrics }));
  admin.get('/flagged', (_req, res) => res.json(game.antiCheat.flagged(Date.now())));
  admin.get('/online', (_req, res) => res.json(game.onlineNames()));
  admin.get('/players', (req, res) => {
    const q = String(req.query.q ?? '').toLowerCase();
    const rows = profiles.topByLevel(500).filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 50);
    res.json(rows.map((p) => ({ ...p, account: accounts.get(p.accountId) && { createdAt: accounts.get(p.accountId)!.createdAt, bannedUntil: accounts.get(p.accountId)!.bannedUntil, mutedUntil: accounts.get(p.accountId)!.mutedUntil } })));
  });
  admin.post('/ban', (req, res) => {
    const a = findByName(req.body?.name); if (!a) return void res.status(404).json({ error: 'unknown_player' });
    const hours = Number(req.body?.hours ?? 24);
    accounts.setBan(a.id, hours <= 0 ? 0 : Date.now() + hours * 3600_000);
    game.kick(a.id, 'banned'); social.audit('admin', 'ban', `${a.name} ${hours}h`);
    res.json({ ok: true });
  });
  admin.post('/mute', (req, res) => {
    const a = findByName(req.body?.name); if (!a) return void res.status(404).json({ error: 'unknown_player' });
    const hours = Number(req.body?.hours ?? 1);
    accounts.setMute(a.id, hours <= 0 ? 0 : Date.now() + hours * 3600_000); social.audit('admin', 'mute', `${a.name} ${hours}h`);
    res.json({ ok: true });
  });
  admin.post('/kick', (req, res) => {
    const a = findByName(req.body?.name); if (!a) return void res.status(404).json({ error: 'unknown_player' });
    social.audit('admin', 'kick', a.name); res.json({ ok: game.kick(a.id) });
  });
  admin.post('/rename', (req, res) => {
    const a = findByName(req.body?.name); if (!a) return void res.status(404).json({ error: 'unknown_player' });
    const r = service.rename(a.id, String(req.body?.newName ?? ''));
    if (r.ok) social.audit('admin', 'rename', `${a.name} -> ${req.body?.newName}`);
    res.status(r.ok ? 200 : 400).json(r.ok ? { ok: true } : { error: r.error });
  });
  admin.post('/delete', (req, res) => {
    const a = findByName(req.body?.name); if (!a) return void res.status(404).json({ error: 'unknown_player' });
    game.kick(a.id, 'deleted'); accounts.delete(a.id); social.audit('admin', 'delete', a.name);
    res.json({ ok: true });
  });
  admin.post('/announce', (req, res) => { const t = String(req.body?.text ?? '').trim(); if (!t) return void res.status(400).json({ error: 'empty' }); game.announce(t); social.audit('admin', 'announce', t); res.json({ ok: true }); });
  admin.get('/reports', (_req, res) => res.json(social.openReports()));
  admin.post('/reports/close', (req, res) => { social.closeReport(Number(req.body?.id)); res.json({ ok: true }); });
  admin.get('/audit', (_req, res) => res.json(social.auditLog()));
  app.use('/admin/api', admin);
  app.get('/admin', (_req, res) => res.type('html').send(ADMIN_HTML));

  if (opts.staticDir) app.use(express.static(opts.staticDir));

  return { app, server, game, db, accounts, profiles, chat, service, social, arena, war, market, premium };
}

const ADMIN_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Treadfront admin</title>
<style>body{font:14px system-ui;background:#0b1020;color:#dbe4ff;margin:0;padding:16px}input,button,textarea{font:inherit;padding:6px 8px;margin:2px;border-radius:6px;border:1px solid #334}button{background:#f97316;border:0;cursor:pointer}
table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border-bottom:1px solid #223;padding:4px 6px;text-align:left}h2{margin:18px 0 4px}pre{white-space:pre-wrap}</style>
<h1>Treadfront admin</h1>
<input id=tok type=password placeholder="Admin token"><button onclick="load()">Load</button> <span id=err style="color:#f87171"></span>
<h2>Server</h2><pre id=stats></pre>
<h2>Online</h2><div id=online></div>
<h2>Player action</h2>
<input id=pn placeholder="player name"><input id=ph size=4 value=24 title="hours"><button onclick="act('ban')">Ban</button><button onclick="act('mute')">Mute</button><button onclick="act('kick')">Kick</button><button onclick="act('delete')">Delete</button>
<input id=nn placeholder="new name"><button onclick="act('rename')">Rename</button>
<h2>Announcement</h2><input id=an size=50><button onclick="announce()">Send</button>
<h2>Open reports</h2><div id=reports></div>
<h2>Audit log</h2><div id=audit></div>
<script>
const $=id=>document.getElementById(id);
const call=async(p,body)=>{const r=await fetch('/admin/api/'+p,{method:body?'POST':'GET',headers:{'x-admin-token':$('tok').value,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok){$('err').textContent=r.status;throw 0}$('err').textContent='';return r.json()};
const tbl=(rows)=>'<table><tr>'+Object.keys(rows[0]||{}).map(k=>'<th>'+k+'</th>').join('')+'</tr>'+rows.map(r=>'<tr>'+Object.values(r).map(v=>'<td>'+(typeof v==='object'?JSON.stringify(v):v)+'</td>').join('')+'</tr>').join('')+'</table>';
async function load(){const s=await call('stats');$('stats').textContent=JSON.stringify({accounts:s.accounts,online:s.online,instances:s.instances,tickAvgMs:s.metrics.avgTickMs.toFixed(2)},null,1);
$('online').innerHTML=tbl(await call('online'));const rp=await call('reports');$('reports').innerHTML=tbl(rp)+rp.map(r=>'<button onclick="closeR('+r.id+')">close #'+r.id+'</button>').join('');$('audit').innerHTML=tbl(await call('audit'))}
async function act(a){await call(a,{name:$('pn').value,hours:+$('ph').value,newName:$('nn').value});load()}
async function announce(){await call('announce',{text:$('an').value});load()}
async function closeR(id){await call('reports/close',{id});load()}
</script>`;
