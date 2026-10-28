import express from 'express';
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { AccountService } from './accounts.ts';
import { SocialRepo } from './social.ts';
import { AllianceRepo, ClanStorageRepo } from './clanStorage.ts';
import { MarketRepo, PremiumWallet } from './market.ts';
import { backupDatabase, openDatabase, SqliteArenaRepo, SqliteWarRepo, SqliteAccountRepo, SqliteChatRepo, SqliteProfileRepo } from './db.ts';
import { GameServer, log } from './gameServer.ts';
import { computeAnalytics, FeedbackRepo, TelemetryRepo } from './telemetry.ts';
import { TUTORIAL_STEPS } from '../shared/data/quests.ts';
import { FailureBackoff, normalizeIp } from './throttle.ts';

export interface AppOptions { backupDir?: string; dbPath?: string; staticDir?: string; adminToken?: string; clock?: { nowMs(): number } }

const hits = new Map<string, number[]>();
let lastPrune = 0;
/** Tiny per-IP rate limiter for the REST endpoints. */
function rateLimit(max: number, windowMs: number): express.RequestHandler {
  return (req, res, next) => {
    if (process.env.LOAD_TEST === '1') return next();
    const key = `${normalizeIp(req.ip ?? '')}:${req.path}`;
    const now = Date.now();
    if (now - lastPrune > 60_000) { // keep the map from growing with every IP ever seen
      lastPrune = now;
      for (const [k, v] of hits) if (v.length === 0 || now - v[v.length - 1] > 3600_000) hits.delete(k);
    }
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
  const clanStorage = new ClanStorageRepo(db, opts.clock ? () => opts.clock!.nowMs() : undefined);
  const alliances = new AllianceRepo(db, opts.clock ? () => opts.clock!.nowMs() : undefined);
  const arena = new SqliteArenaRepo(db);
  const war = new SqliteWarRepo(db);
  const nowSec = () => Math.floor((opts.clock ? opts.clock.nowMs() : Date.now()) / 1000);
  const telemetry = new TelemetryRepo(db, nowSec);
  const feedback = new FeedbackRepo(db, telemetry, nowSec);
  const market = new MarketRepo(db);
  const premium = new PremiumWallet(db);
  const app = express();
  // Behind Caddy/nginx every request comes from the proxy's address, so the per-IP REST limits would be shared by all players.
  // Opt in with TRUST_PROXY=1 (number of proxy hops) so X-Forwarded-For is used.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  app.use(express.json({ limit: '8kb' }));
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => { // malformed / oversized JSON bodies
    if (err?.status && err.status < 500) return void res.status(err.status).json({ error: 'bad_request' });
    next(err);
  });
  const server = http.createServer(app);
  const game = new GameServer({ accounts, profiles, chat, service, social, clanStorage, alliances, arena, war, telemetry, feedback, market, premium, adminToken: opts.adminToken, clock: opts.clock, onDaily: opts.backupDir ? () => { const f = backupDatabase(db, opts.backupDir!); log('info', 'backup', { file: f }); } : undefined }, server);

  app.get('/health', (_req, res) => res.json({ ok: true, players: game.playerCount(), instances: game.instanceInfo().length }));
  app.get('/metrics', (_req, res) => {
    res.type('text/plain').send(
      [`treadfront_players ${game.playerCount()}`, `treadfront_ticks_total ${game.metrics.ticks}`, `treadfront_tick_ms_avg ${game.metrics.avgTickMs.toFixed(3)}`,
        `treadfront_tick_ms_max ${game.metrics.maxTickMs.toFixed(3)}`, `treadfront_teleport_corrections_total ${game.plausibility.moveCorrections}`, `treadfront_shots_dropped_total ${game.plausibility.shotsDropped}`, `treadfront_max_move_ratio ${game.plausibility.maxMoveRatio.toFixed(3)}`, `treadfront_instances_quarantined_total ${game.quarantined.length}`, `treadfront_bytes_out_total ${game.metrics.bytesOut}`,
        ...game.instanceInfo().map((i) => `treadfront_instance_players{id="${i.id}",map="${i.mapId}"} ${i.players}`)].join('\n') + '\n'
    );
  });

  /** Account creation per IP: 30 free per hour (schools, cafes), then 30 s doubling up to 1 h. */
  const createBackoff = new FailureBackoff({ free: 30, baseMs: 30_000, maxMs: 3600_000, decayMs: 3600_000 });
  app.post('/api/guest', rateLimit(10, 60_000), (req, res) => {
    if (process.env.LOAD_TEST !== '1') {
      const wait = createBackoff.blockedFor(normalizeIp(req.ip ?? ''), Date.now());
      if (wait > 0) return void res.status(429).set('Retry-After', String(Math.ceil(wait / 1000))).json({ error: 'rate_limited', retryAfterSeconds: Math.ceil(wait / 1000) });
      createBackoff.fail(normalizeIp(req.ip ?? ''), Date.now());
    }
    const r = service.createGuest(req.body?.ageConfirmed === true, ['coastal', 'highland', 'steppe'].includes(req.body?.faction) ? req.body.faction : 'coastal');
    if (!r.ok) return void res.status(400).json({ error: r.error });
    telemetry.log('account_created', r.cred.accountId);
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
    telemetry.forget(id);
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
  admin.get('/tickstats', (req, res) => { const out = game.tickWindowStats(); if (req.query.reset === '1') game.resetTickWindow(); res.json(out); });
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
    if (!Number.isFinite(hours)) return void res.status(400).json({ error: 'bad_hours' });
    accounts.setBan(a.id, hours <= 0 ? 0 : Date.now() + hours * 3600_000);
    game.kick(a.id, 'banned'); social.audit('admin', 'ban', `${a.name} ${hours}h`);
    res.json({ ok: true });
  });
  admin.post('/mute', (req, res) => {
    const a = findByName(req.body?.name); if (!a) return void res.status(404).json({ error: 'unknown_player' });
    const hours = Number(req.body?.hours ?? 1);
    if (!Number.isFinite(hours)) return void res.status(400).json({ error: 'bad_hours' });
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
    game.kick(a.id, 'deleted'); telemetry.forget(a.id); accounts.delete(a.id); social.audit('admin', 'delete', a.name);
    res.json({ ok: true });
  });
  admin.post('/announce', (req, res) => { const t = String(req.body?.text ?? '').trim(); if (!t) return void res.status(400).json({ error: 'empty' }); game.announce(t); social.audit('admin', 'announce', t); res.json({ ok: true }); });
  admin.get('/reports', (_req, res) => res.json(social.openReports()));
  admin.post('/reports/close', (req, res) => { social.closeReport(Number(req.body?.id)); res.json({ ok: true }); });
  admin.get('/analytics', (_req, res) => res.json(computeAnalytics(telemetry.rows(), nowSec(), TUTORIAL_STEPS)));
  admin.get('/feedback', (_req, res) => res.json(feedback.list(200)));
  admin.post('/feedback/close', (req, res) => { feedback.close(Number(req.body?.id)); res.json({ ok: true }); });
  admin.get('/audit', (_req, res) => res.json(social.auditLog()));
  app.use('/admin/api', admin);
  app.get('/admin', (_req, res) => res.type('html').send(ADMIN_HTML));

  if (opts.staticDir) app.use(express.static(opts.staticDir));

  return { app, server, game, db, accounts, profiles, chat, service, social, clanStorage, alliances, arena, war, telemetry, feedback, market, premium };
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
<h2>Analytics (beta)</h2><div id=an_sum></div><div id=an_conc></div><div id=an_funnel></div>
<h2>Player feedback</h2><div id=fb></div>
<h2>Open reports</h2><div id=reports></div>
<h2>Audit log</h2><div id=audit></div>
<script>
const $=id=>document.getElementById(id);
const call=async(p,body)=>{const r=await fetch('/admin/api/'+p,{method:body?'POST':'GET',headers:{'x-admin-token':$('tok').value,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok){$('err').textContent=r.status;throw 0}$('err').textContent='';return r.json()};
const esc=v=>String(v).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
const tbl=(rows)=>'<table><tr>'+Object.keys(rows[0]||{}).map(k=>'<th>'+esc(k)+'</th>').join('')+'</tr>'+rows.map(r=>'<tr>'+Object.values(r).map(v=>'<td>'+esc(v!==null&&typeof v==='object'?JSON.stringify(v):v)+'</td>').join('')+'</tr>').join('')+'</table>';
async function load(){const s=await call('stats');$('stats').textContent=JSON.stringify({accounts:s.accounts,online:s.online,instances:s.instances,tickAvgMs:s.metrics.avgTickMs.toFixed(2)},null,1);
$('online').innerHTML=tbl(await call('online'));const rp=await call('reports');$('reports').innerHTML=tbl(rp)+rp.map(r=>'<button onclick="closeR('+r.id+')">close #'+r.id+'</button>').join('');$('audit').innerHTML=tbl(await call('audit'));loadAnalytics()}
const bars=(vals,labels,w,h,fmt)=>{const max=Math.max(1,...vals);const bw=w/vals.length;return '<svg viewBox="0 0 '+w+' '+(h+34)+'" width="100%" style="max-width:'+w+'px;background:#101830;border-radius:8px">'+vals.map((v,i)=>{const bh=Math.round(v/max*h);return '<rect x="'+(i*bw+2)+'" y="'+(h-bh+8)+'" width="'+(bw-4)+'" height="'+bh+'" fill="#f97316"><title>'+esc(labels[i])+': '+esc(fmt(v))+'</title></rect><text x="'+(i*bw+bw/2)+'" y="'+(h+24)+'" font-size="9" fill="#9fb0d8" text-anchor="middle">'+esc(labels[i])+'</text>'}).join('')+'</svg>'};
const pct=v=>v==null?'-':Math.round(v*100)+' %';
async function loadAnalytics(){const a=await call('analytics');
$('an_sum').innerHTML=tbl([{accounts:a.accounts,'D1':pct(a.retention.d1.rate)+' ('+a.retention.d1.retained+'/'+a.retention.d1.eligible+')','D7':pct(a.retention.d7.rate)+' ('+a.retention.d7.retained+'/'+a.retention.d7.eligible+')','D30':pct(a.retention.d30.rate)+' ('+a.retention.d30.retained+'/'+a.retention.d30.eligible+')',sessions:a.sessions.count,'avg session':a.sessions.avgSeconds==null?'-':Math.round(a.sessions.avgSeconds/60)+' min','peak concurrent (24 h)':a.peakConcurrent}]);
$('an_conc').innerHTML='<h3>Players per hour (UTC, last 24 h)</h3>'+bars(a.concurrentByHour.map(c=>c.players),a.concurrentByHour.map(c=>new Date(c.hourStart*1000).getUTCHours()),720,90,v=>v+' players');
$('an_funnel').innerHTML='<h3>Tutorial funnel (players who reached each step)</h3>'+bars(a.funnel.map(f=>f.players),a.funnel.map(f=>f.step),720,90,v=>v+' players')+tbl(a.funnel.map(f=>({step:f.step,players:f.players,'of signups':pct(f.ofSignups),'of previous':pct(f.ofPrevious)})))+'<h3>Milestones (distinct players)</h3>'+tbl([a.milestones]);
const fb=await call('feedback');$('fb').innerHTML=tbl(fb.map(f=>({id:f.id,when:new Date(f.ts*1000).toISOString().slice(0,16),kind:f.kind,status:f.status,text:f.text,state:f.state})))+fb.filter(f=>f.status==='open').map(f=>'<button onclick="closeF('+f.id+')">close #'+f.id+'</button>').join('')}
async function closeF(id){await call('feedback/close',{id});load()}
async function act(a){await call(a,{name:$('pn').value,hours:+$('ph').value,newName:$('nn').value});load()}
async function announce(){await call('announce',{text:$('an').value});load()}
async function closeR(id){await call('reports/close',{id});load()}
</script>`;
