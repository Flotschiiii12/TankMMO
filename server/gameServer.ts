/**
 * Authoritative game server: map instances at 30 Hz, delta snapshots at 10 Hz, server-side validation of every
 * command and action, rewards computed here (the client never sends damage, loot or currency).
 */
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { getAllMaps, getMapById } from '../shared/data/maps.ts';
import { rollLoot } from '../shared/data/loot.ts';
import { compactEntity, DeltaEncoder, viewFor } from '../shared/net/delta.ts';
import { MIN_PROTOCOL_VERSION, PROTOCOL_VERSION, ClientActionPacket, ClientMessage, ClientSocialPacket, ServerMessage } from '../shared/protocol.ts';
import { SimRNG } from '../shared/prng.ts';
import { ITEM_BY_ID } from '../shared/data/items.ts';
import * as C from '../shared/rules/character.ts';
import { AMMO_PRICES, ammoCost, executeAction } from '../shared/rules/actions.ts';
import { calculateKillXP } from '../shared/rules/progression.ts';
import * as Q from '../shared/rules/quests.ts';
import { FeedbackRepo, LEVEL_MILESTONES, sanitizeState, TelemetryRepo } from './telemetry.ts';
import { TUTORIAL_STEPS } from '../shared/data/quests.ts';
import { canEngage, BOUNTY_SCRAP_PER_STREAK, BOUNTY_STREAK, HONOR_LOSS_ON_DEATH, HONOR_REPEAT_SECONDS, honorOutcome, KILL_CAP_COUNT, KILL_CAP_IMMUNITY_SECONDS, KILL_CAP_WINDOW_SECONDS, PVP_DAMAGE_MULT, PVP_LEVEL_WINDOW, PVP_MIN_LEVEL, registerPvpKill } from '../shared/sim/pvp.ts';
import { refreshPlayerStats, spawnPlayerFromCharacter } from '../shared/sim/playerEntity.ts';
import { createWorld, stepWorld, World } from '../shared/sim/world.ts';
import { weeklyWinner } from '../shared/sim/war.ts';
import { AbilityId, AmmoType, MapDef, SimCommand, SimEntity, SimEvent, SIM_TIMESTEP } from '../shared/types.ts';
import { AccountService } from './accounts.ts';
import { AccountRepo, ChatRepo, ProfileRepo } from './db.ts';
import { CLAN_CREATE_COST, SocialRepo } from './social.ts';
import { MatchRecorder, MAX_SPECTATORS_PER_MATCH, SPECTATE_DELAY_TICKS, SpectateHud, SpectateMatchInfo } from './spectate.ts';
import { CAPTURE_SECONDS, contributesTo, WAR_CLAIM_MIN_SECONDS, WAR_REWARD } from '../shared/sim/war.ts';
import { invasionReward, isWeekendXp, WEEKEND_XP_MULTIPLIER } from '../shared/sim/events.ts';
import { NEWBIE_PROTECTION_LEVEL } from '../shared/rules/hints.ts';
import { AllianceRepo, ClanStorageRepo, STORAGE_DAILY_WITHDRAW } from './clanStorage.ts';
import { allianceKey } from '../shared/sim/pvp.ts';
import { SqliteArenaRepo, SqliteWarRepo } from './db.ts';
import { AntiCheat } from './anticheat.ts';
import { bump, checkAchievements, codexAdd } from '../shared/rules/achievements.ts';
import { DUNGEONS, getDungeon, DUNGEON_FREE_KEYS_PER_DAY } from '../shared/data/dungeons.ts';
import { createDungeonWorld, dungeonEntryPoint } from '../shared/sim/dungeon.ts';
import { FailureBackoff, clientIp } from './throttle.ts';
import { checkShot, movementBound, teleportCorrection, type PlausibilityStats } from './plausibility.ts';
import { allowedAbilities } from '../shared/rules/abilities.ts';
import { auctionTax, AUCTION_MAX_LISTINGS, DAILY_TRADE_VOLUME_CAP, MarketRepo, PremiumWallet, rejectingValidator, ReceiptValidator, SHOP_CATALOG, INVENTORY_FREE } from './market.ts';
import { FLAGS } from '../shared/flags.ts';
import { MAP_CONNECTIONS } from '../shared/data/maps.ts';
import { WAR_WINNER_MARKET_DISCOUNT } from '../shared/sim/war.ts';
import * as AR from '../shared/rules/arena.ts';
import { createStarterCharacterForServer, DEFAULT_AMMO } from './starter.ts';

export const TICK_HZ = 30;
export const SNAPSHOT_EVERY_TICKS = 3; // 10 Hz
export const INSTANCE_CAPACITY = 100;
export const INTEREST_RADIUS = 1500;
/** Entities beyond this distance are updated at half rate (5 Hz). */
export const NEAR_RADIUS = 700;
export const MAX_COMMANDS_PER_SECOND = 90;
export const MAX_COMMANDS_PER_PACKET = 16;
export const RESPAWN_SECONDS = 5;
export const AUTOSAVE_SECONDS = 30;
const AUTOSAVE_PER_TICK = 6;
/** The JSON of a patch is cached on the patch itself (symbol key, ignored by JSON.stringify): no WeakMap, see shared/net/delta.ts. */
const PATCH_JSON = Symbol('json');
/** Per-connection inbound message budget: sustained rate and burst. Real clients send ~30 input packets/s plus a few requests. */
export const MAX_MESSAGES_PER_SECOND = 120;
export const MAX_MESSAGE_BURST = 240;
/** Connections that never authenticate are dropped after this many bad messages / failed joins. */
export const MAX_BAD_MESSAGES = 10;
/** Trades need both players in a safe zone, or in the same instance within this distance. */
export const TRADE_MAX_DISTANCE = 500;
export const CHAT_MIN_INTERVAL_MS = 1000;
export const CHAT_BURST = { count: 5, windowMs: 10_000 };

export interface Clock { nowMs(): number }
const AMMO_IDS: string[] = ['STANDARD', 'REINFORCED', 'ARMOR_PIERCING', 'SHAPED_CHARGE', 'EXPLOSIVE'];

/** Social ops that act on another player and therefore need a `name`. */
const NAME_OPS = new Set(['friend_request', 'friend_accept', 'friend_remove', 'block', 'unblock', 'report', 'party_invite', 'party_accept', 'party_kick', 'clan_invite', 'clan_kick', 'clan_role', 'profile', 'trade_open']);

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
/**
 * Requests and actions are flat records of strings, finite numbers, booleans, null and short arrays of those.
 * Anything else (nested objects, NaN/Infinity from `1e999`, prototype keys, huge strings) is rejected before it can reach
 * the rules, SQL parameters or `String()` conversions.
 */
export function isFlatPayload(o: unknown, maxArray = 50, maxString = 2000): boolean {
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return false;
  const okScalar = (v: unknown): boolean => (typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' ? v.length <= maxString : typeof v === 'boolean' || v === null);
  for (const [k, v] of Object.entries(o)) {
    if (FORBIDDEN_KEYS.has(k)) return false;
    if (Array.isArray(v)) { if (v.length > maxArray || !v.every(okScalar)) return false; }
    else if (!okScalar(v)) return false;
  }
  return true;
}

/** Structured JSON log line (one object per line) for log shippers. */
export function log(level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown> = {}): void {
  if (process.env.LOG_QUIET === '1' || process.env.VITEST) return;
  console.log(JSON.stringify({ t: new Date().toISOString(), level, event, ...data }));
}
const realClock: Clock = { nowMs: () => Date.now() };

interface Instance {
  id: string;
  mapId: number;
  map: MapDef;
  world: World;
  sessions: Set<Session>;
  chatSent: number;
  arena?: { state: AR.MatchState; teams: [Session[], Session[]]; forfeits: Set<string>; mode: AR.ArenaMode; ratings: Map<string, number>; returnTo: Map<string, { mapId: number }>; lastPhase?: string; league: string; rec: MatchRecorder; spectators: Set<Session>; };
}

interface Session {
  /** telemetry milestones already sent this session, and the last server error codes (for bug reports) */
  teleSeen?: Set<string>;
  errors?: string[];
  connectedAt?: number;
  ws: WebSocket;
  accountId: string;
  name: string;
  character: C.CharacterState;
  ammo: Record<string, number>;
  instance: Instance;
  entityId: number;
  encoder: DeltaEncoder;
  pending: SimCommand[];
  lastSeq: number;
  cmdBudget: number;
  cmdBudgetRefill: number;
  respawnAt?: number;
  dirty: boolean;
  lastSave: number;
  chatTimes: number[];
  pendingEvents: SimEvent[];
  suspicious: number;
  rng: SimRNG;
  streak: number;
  bounty: number;
  arenaFree?: boolean;
  /** watching an arena match (delayed stream); the session itself stays in its hub instance but gets no hub snapshots */
  spectating?: { inst: Instance; lastFrameTick: number; lastHud: string };
  returnMap?: number;
  lastHonorAt: Map<number, number>;
  partyId?: number;
  clanId?: number;
  clanTag?: string;
  clanEmblem?: string;
  /** plausibility: where the vehicle was at the end of the previous tick, and when it last fired the main gun (sim time) */
  lastPos?: { x: number; y: number };
  lastShotAt?: number;
  /** raiders destroyed during the running invasion on this map (reward when it ends) */
  invasionKills?: number;
  /** seconds fighting for an own-faction control point since the last flush to the database */
  warSeconds?: number;
}

interface Party { id: number; leader: string; members: Set<string> }
export const PARTY_MAX = 5;
export const PARTY_XP_BONUS_PER_EXTRA = 0.1;
const PARTY_SHARE_RADIUS = 1500;

export interface ServerDeps {
  accounts: AccountRepo;
  profiles: ProfileRepo;
  chat: ChatRepo;
  service: AccountService;
  clock?: Clock;
  adminToken?: string;
  /** called once per day by the scheduler (daily database backup) */
  onDaily?: () => void;
  social: SocialRepo;
  clanStorage: ClanStorageRepo;
  alliances: AllianceRepo;
  arena: SqliteArenaRepo;
  war: SqliteWarRepo;
  telemetry: TelemetryRepo;
  feedback: FeedbackRepo;
  market: MarketRepo;
  premium: PremiumWallet;
  receipts?: ReceiptValidator;
}

interface TradeSession { a: string; b: string; offers: Record<string, { items: string[]; scrap: number }>; confirmed: Set<string> }

export class GameServer {
  readonly http: http.Server;
  private wss: WebSocketServer;
  private instances = new Map<number, Instance[]>();
  private sessions = new Map<string, Session>(); // by accountId
  private tick = 0;
  private timer?: NodeJS.Timeout;
  private lastStep = 0;
  private acc = 0;
  private clock: Clock;
  /** Inbound message budget per connection; tests and fuzzers may raise it. */
  /** Spectators per arena match; tests lower it. */
  spectatorCap = MAX_SPECTATORS_PER_MATCH;
  inboundLimit = { perSecond: MAX_MESSAGES_PER_SECOND, burst: MAX_MESSAGE_BURST };
  readonly metrics = { ticks: 0, maxTickMs: 0, avgTickMs: 0, bytesOut: 0, msgsIn: 0 };
  /** Windowed tick statistics for load tests (reset after warm-up); costs one array push per tick. */
  private tickWindow = { samples: [] as number[], phases: {} as Record<string, number>, bytes0: 0, startedAt: 0, players: 0 };
  resetTickWindow(): void { this.tickWindow = { samples: [], phases: {}, bytes0: this.metrics.bytesOut, startedAt: performance.now(), players: 0 }; }
  tickWindowStats() {
    const w = this.tickWindow; const s = [...w.samples].sort((a, b) => a - b);
    const pct = (p: number) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0);
    const sum = s.reduce((a, b) => a + b, 0);
    const seconds = Math.max(0.001, (performance.now() - w.startedAt) / 1000);
    const phases = Object.fromEntries(Object.entries(w.phases).map(([k, v]) => [k, Math.round((v / Math.max(1, s.length)) * 1000) / 1000]));
    return { ticks: s.length, seconds: Math.round(seconds * 10) / 10, avgMs: s.length ? sum / s.length : 0, p50Ms: pct(0.5), p95Ms: pct(0.95), p99Ms: pct(0.99), maxMs: s[s.length - 1] ?? 0,
      busyPercent: Math.round((sum / (seconds * 1000)) * 1000) / 10, kbPerSecOut: Math.round((this.metrics.bytesOut - w.bytes0) / 1024 / seconds * 10) / 10, players: this.sessions.size, avgPhaseMs: phases };
  }
  private instanceCounter = 0;
  /** allied clan-tag pairs, one Set shared by every world (mutated in place by refreshAlliances) */
  private allianceSet = new Set<string>();
  private arenaInstances = new Set<Instance>();
  private dungeonInstances = new Set<Instance>();
  private dungeonCounter = 0;
  private arenaQueue: AR.QueueEntry[] = [];
  private arenaBans = new Map<string, number>(); // accountId -> until (ms)
  private arenaSeq = 0;
  readonly antiCheat = new AntiCheat();
  private lastDay = '';
  private lastWeek = '';
  private trades = new Map<string, TradeSession>(); // by accountId (both sides point to the same session)
  private parties = new Map<number, Party>();
  private partyCounter = 0;
  private partyInvites = new Map<string, { from: string; party: number; exp: number }>();

  constructor(private deps: ServerDeps, httpServer?: http.Server) {
    this.clock = deps.clock ?? realClock;
    this.http = httpServer ?? http.createServer();
    this.wss = new WebSocketServer({ server: this.http, path: '/ws', maxPayload: 64 * 1024 });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, clientIp(req)));
    this.refreshAlliances();
  }

  // ---------------------------------------------------------------- lifecycle

  listen(port: number): Promise<number> {
    return new Promise((resolve) => this.http.listen(port, () => resolve((this.http.address() as any).port)));
  }

  start(): void {
    this.lastStep = performance.now();
    this.timer = setInterval(() => this.loop(), 1000 / TICK_HZ / 2);
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    for (const s of this.sessions.values()) { this.save(s); s.ws.close(1001, 'server_shutdown'); }
    for (const c of this.wss.clients) c.terminate();
    await new Promise<void>((r) => this.wss.close(() => r()));
    await new Promise<void>((r) => this.http.close(() => r()));
  }

  private loop(): void {
    const now = performance.now();
    this.acc += (now - this.lastStep) / 1000;
    this.lastStep = now;
    let steps = 0;
    while (this.acc >= SIM_TIMESTEP && steps < 3) { this.stepAll(); this.acc -= SIM_TIMESTEP; steps++; }
    if (this.acc > 0.5) this.acc = 0; // fell behind: drop the backlog instead of spiralling
  }

  /** Public for tests: advance every instance one tick. */
  stepAll(): void {
    const t0 = performance.now();
    const lap: Record<string, number> = {};
    let mark = t0;
    const took = (name: string) => { const n = performance.now(); lap[name] = (lap[name] ?? 0) + (n - mark); mark = n; };
    this.tick++;
    const all: Instance[] = [...[...this.instances.values()].flat(), ...this.arenaInstances, ...this.dungeonInstances];
    {
      for (const inst of all) {
        if (inst.sessions.size === 0) continue;
        try {
          this.testFault?.(inst);
          const cmds = new Map<number, SimCommand[]>();
          for (const s of inst.sessions) {
            if (s.pending.length) { cmds.set(s.entityId, s.pending); s.pending = []; }
            s.cmdBudget = Math.min(MAX_COMMANDS_PER_SECOND, s.cmdBudget + MAX_COMMANDS_PER_SECOND / TICK_HZ);
          }
          took('prep');
          stepWorld(inst.world, cmds);
          took('sim');
          this.checkPlausibility(inst);
          this.processEvents(inst);
          took('events');
          this.handleRespawns(inst);
          if (inst.arena) this.stepArena(inst);
          this.rememberPositions(inst);
          took('respawns');
          if (this.tick % SNAPSHOT_EVERY_TICKS === 0) this.sendSnapshots(inst);
          took('snapshots');
        } catch (err) {
          this.onInstanceFailure(inst, err);
        }
      }
    }
    this.guarded('periodic', () => { if (this.tick % TICK_HZ === 0) { this.runMatchmaking(); this.checkSecrets(); this.accrueWar(); } });
    took('every_second');
    this.guarded('war_scores', () => { if (this.tick % (TICK_HZ * 30) === 0) this.flushWarScores(); });
    took('war_scores');
    this.guarded('minute_jobs', () => { if (this.tick % (TICK_HZ * 60) === 0) { this.sweepAuctions(); this.runScheduler(); } });
    took('minute_jobs');
    this.guarded('autosave', () => this.autosaveSome());
    took('autosave');
    const ms = performance.now() - t0;
    if (ms > 60) log('warn', 'slow_tick', { ms: Math.round(ms), players: this.sessions.size, ...Object.fromEntries(Object.entries(lap).map(([k, v]) => [k, Math.round(v)])) });
    this.metrics.ticks++;
    this.metrics.maxTickMs = Math.max(this.metrics.maxTickMs, ms);
    this.metrics.avgTickMs += (ms - this.metrics.avgTickMs) / Math.min(this.metrics.ticks, 300);
    if (this.tickWindow.samples.length < 100_000) {
      this.tickWindow.samples.push(ms);
      for (const [k, v] of Object.entries(lap)) this.tickWindow.phases[k] = (this.tickWindow.phases[k] ?? 0) + v;
    }
  }

  // ---------------------------------------------------------------- plausibility (second line of defence)

  readonly plausibility: PlausibilityStats = { moveCorrections: 0, shotsDropped: 0, maxMoveRatio: 0 };

  private checkPlausibility(inst: Instance): void {
    const w = inst.world;
    for (const s of inst.sessions) {
      const e = w.entities.get(s.entityId);
      if (!e) continue;
      if (s.lastPos) this.plausibility.maxMoveRatio = Math.max(this.plausibility.maxMoveRatio, Math.hypot(e.pos.x - s.lastPos.x, e.pos.y - s.lastPos.y) / movementBound(e));
      const back = teleportCorrection(e, s.lastPos);
      if (back) {
        log('warn', 'teleport_corrected', { account: s.accountId, from: s.lastPos, to: { x: Math.round(e.pos.x), y: Math.round(e.pos.y) } });
        e.pos = { ...back }; e.vel = { x: 0, y: 0 };
        this.plausibility.moveCorrections++;
        this.antiCheat.rejected(s.accountId, 'invalid');
        s.suspicious++;
      }
    }
    for (const ev of w.events) {
      if (ev.type !== 'projectile_fired') continue;
      const s = [...inst.sessions].find((x) => x.entityId === ev.shooterId);
      if (!s) continue; // NPC shots are not player input
      const verdict = checkShot(ev, w.entities.get(ev.shooterId), s.lastShotAt ?? -Infinity, w.time);
      if (verdict.ok) { if (!ev.isSecondary) s.lastShotAt = w.time; continue; }
      for (const [id, p] of w.entities) {
        if (p.kind === 'projectile' && (p as any).sourceEntityId === ev.shooterId && (p as any).distanceTraveled <= ev.speed * SIM_TIMESTEP * 2 + 1 && Math.hypot(p.pos.x - ev.pos.x, p.pos.y - ev.pos.y) <= ev.speed * SIM_TIMESTEP * 2 + 1) { w.entities.delete(id); break; }
      }
      log('warn', 'shot_dropped', { account: s.accountId, reason: verdict.reason });
      this.plausibility.shotsDropped++;
      this.antiCheat.rejected(s.accountId, 'invalid');
      s.suspicious++;
    }
  }

  /** Test/admin hook: treat all current positions as legitimate (after code moved entities directly). */
  forgetPositions(): void { for (const s of this.sessions.values()) s.lastPos = undefined; }

  private rememberPositions(inst: Instance): void {
    for (const s of inst.sessions) { const e = inst.world.entities.get(s.entityId); s.lastPos = e ? { x: e.pos.x, y: e.pos.y } : undefined; }
  }

  // ---------------------------------------------------------------- failure isolation

  /** Test hook: called at the start of every instance step (lets tests simulate a crashing world). */
  testFault?: (inst: Instance) => void;
  private instanceFailures = new Map<Instance, { count: number; lastTick: number }>();
  readonly quarantined: string[] = [];

  /** A non-instance job of the tick must never take the loop down. */
  private guarded(name: string, fn: () => void): void {
    try { fn(); } catch (err) { log('error', 'tick_job_failed', { job: name, error: String((err as Error)?.stack ?? err).slice(0, 600) }); }
  }

  /** One failing instance is logged; the third failure within ~10 s quarantines it and moves its players to a fresh instance. */
  private onInstanceFailure(inst: Instance, err: unknown): void {
    log('error', 'instance_step_failed', { instance: inst.id, map: inst.mapId, players: inst.sessions.size, error: String((err as Error)?.stack ?? err).slice(0, 800) });
    const rec = this.instanceFailures.get(inst);
    if (!rec || this.tick - rec.lastTick > TICK_HZ * 10) this.instanceFailures.set(inst, { count: 1, lastTick: this.tick });
    else { rec.count++; rec.lastTick = this.tick; }
    if ((this.instanceFailures.get(inst)?.count ?? 0) >= 3) this.quarantine(inst);
  }

  private quarantine(inst: Instance): void {
    log('error', 'instance_quarantined', { instance: inst.id, map: inst.mapId, players: inst.sessions.size });
    this.quarantined.push(inst.id);
    this.instanceFailures.delete(inst);
    const list = this.instances.get(inst.mapId);
    if (list) this.instances.set(inst.mapId, list.filter((i) => i !== inst));
    for (const sp of [...(inst.arena?.spectators ?? [])]) this.stopSpectating(sp, true);
    this.arenaInstances.delete(inst);
    this.dungeonInstances.delete(inst);
    const players = [...inst.sessions];
    inst.sessions.clear();
    for (const s of players) {
      try {
        const special = !!inst.arena || !!inst.world?.dungeon;
        const target = special ? C.HOME_MAP_BY_FACTION[s.character.faction] : inst.mapId;
        this.enter(s, target); // the old instance is no longer listed, so this creates/joins a healthy one
        this.send(s, { type: 's_error', code: 'instance_recovered', message: 'The area was restarted' });
      } catch (err) {
        log('error', 'quarantine_move_failed', { account: s.accountId, error: String((err as Error)?.message ?? err) });
        s.ws.close(1011, 'instance_failure');
      }
    }
  }

  // ---------------------------------------------------------------- instances

  private getInstanceFor(mapId: number, preferInstanceOf?: Session): Instance {
    const list = this.instances.get(mapId) ?? [];
    this.instances.set(mapId, list);
    const open = list.find((i) => i.sessions.size < INSTANCE_CAPACITY);
    if (open) return open;
    const map = getMapById(mapId) as MapDef;
    const n = ++this.instanceCounter;
    const world = createWorld({ map, seed: mapId * 7919 + n, clockOffset: Math.floor(this.clock.nowMs() / 1000) });
    world.alliances = this.allianceSet;
    const inst: Instance = { id: `i${mapId}-${n}`, mapId, map, world, sessions: new Set(), chatSent: world.chat.length };
    list.push(inst);
    void preferInstanceOf;
    return inst;
  }

  instanceInfo(): Array<{ id: string; mapId: number; players: number; entities: number }> {
    return [...this.instances.values()].flat().map((i) => ({ id: i.id, mapId: i.mapId, players: i.sessions.size, entities: i.world.entities.size }));
  }

  playerCount(): number { return this.sessions.size; }

  onlineNames(): Array<{ id: string; name: string; level: number; mapId: number; suspicious: number; botScore: number }> {
    const now = this.clock.nowMs();
    return [...this.sessions.values()].map((s) => ({ id: s.accountId, name: s.name, level: s.character.level, mapId: s.instance.mapId, suspicious: s.suspicious, botScore: this.antiCheat.report(s.accountId, now)?.score ?? 0 }));
  }

  /** Admin: disconnect a player (saves first). */
  kick(accountId: string, reason = 'kicked'): boolean {
    const s = this.sessions.get(accountId);
    if (!s) return false;
    this.send(s, { type: 's_error', code: reason, message: 'You were removed from the game', critical: true });
    s.ws.close(4403, reason);
    return true;
  }

  /** Admin/test tool: move a connected player to a map (spawn point of that map). */
  adminTeleport(accountId: string, mapId: number): boolean {
    const s = this.sessions.get(accountId);
    if (!s || s.instance.arena) return false;
    this.leave(s);
    this.enter(s, mapId);
    return true;
  }

  announce(text: string): void {
    this.deps.social.addAnnouncement(text);
    for (const s of this.sessions.values()) this.send(s, { type: 's_social_event', kind: 'announcement', data: { ts: this.clock.nowMs(), text } });
  }

  /** Test hook. */
  getSessionState(accountId: string): { character: C.CharacterState; entity: SimEntity; instanceId: string; mapId: number; world: World } | undefined {
    const s = this.sessions.get(accountId);
    if (!s) return undefined;
    return { character: s.character, entity: s.instance.world.entities.get(s.entityId)!, instanceId: s.instance.id, mapId: s.instance.mapId, world: s.instance.world };
  }

  getWorld(accountId: string): World | undefined { return this.sessions.get(accountId)?.instance.world; }

  private spawnPos(inst: Instance): { x: number; y: number } {
    const z = inst.map.safeZones[0];
    return z ? { x: z.x, y: z.y } : { x: inst.map.width / 2, y: inst.map.height / 2 };
  }

  private enter(s: Session, mapId: number, at?: { x: number; y: number }): void {
    this.enterInstance(s, this.getInstanceFor(mapId, s), at);
  }

  private enterInstance(s: Session, inst: Instance, at?: { x: number; y: number }): void {
    const mapId = inst.mapId;
    const pos = at ?? this.spawnPos(inst);
    const ent = spawnPlayerFromCharacter(inst.world, s.character, pos, s.ammo);
    if (s.spectating) this.stopSpectating(s, false);
    s.instance = inst;
    s.entityId = ent.id;
    if (!inst.arena && !s.character.visitedMaps.includes(mapId)) s.character.visitedMaps.push(mapId);
    if (!inst.arena && !inst.world.dungeon) codexAdd(s.character, 'map', String(mapId));
    s.encoder.reset();
    s.pending = [];
    s.lastPos = undefined; s.lastShotAt = undefined; // a map change is a legitimate teleport
    inst.sessions.add(s);
    this.send(s, { type: 's_map', mapId, instanceId: inst.id, assignedEntityId: ent.id });
    this.sendCharacter(s);
  }

  private leave(s: Session): void {
    if (s.instance?.arena && !s.instance.arena.forfeits.has(s.accountId) && s.instance.arena.state.phase !== 'finished') {
      s.instance.arena.forfeits.add(s.accountId);
      this.arenaBans.set(s.accountId, this.clock.nowMs() + AR.DODGE_PENALTY_SECONDS * 1000);
    }
    const ent = s.instance.world.entities.get(s.entityId);
    if (ent) { for (const k of Object.keys(s.ammo)) if (k !== 'STANDARD') s.ammo[k] = ent.ammoInventory[k as AmmoType] ?? s.ammo[k]; }
    s.instance.world.entities.delete(s.entityId);
    s.instance.sessions.delete(s);
  }

  // ---------------------------------------------------------------- connection handling

  private onConnection(ws: WebSocket, ip: string): void {
    let session: Session | undefined;
    const joinTimeout = setTimeout(() => { if (!session) ws.close(4408, 'join_timeout'); }, 10_000);
    let tokens = this.inboundLimit.burst; let lastRefill = this.clock.nowMs(); let bad = 0;
    const reject = (code: string, message: string) => {
      this.sendRaw(ws, { type: 's_error', code, message });
      if (++bad >= MAX_BAD_MESSAGES) { if (!session) this.joinThrottle.fail(ip, this.clock.nowMs()); ws.close(4400, 'too_many_bad_messages'); }
    };
    ws.on('message', (data) => {
      this.metrics.msgsIn++;
      const now = this.clock.nowMs();
      tokens = Math.min(this.inboundLimit.burst, tokens + ((now - lastRefill) / 1000) * this.inboundLimit.perSecond);
      lastRefill = now;
      if (tokens < 1) { if (session) this.antiCheat.rejected(session.accountId, 'flood'); return; } // over budget: drop silently
      tokens--;
      try {
        let msg: ClientMessage;
        try { msg = JSON.parse(data.toString()); } catch { return reject('bad_json', 'Invalid message'); }
        // JSON.parse also yields null, numbers, arrays...: only objects with a string type are messages.
        if (typeof msg !== 'object' || msg === null || Array.isArray(msg) || typeof (msg as any).type !== 'string') return reject('bad_message', 'Invalid message');
        if (!session) {
          if (msg.type !== 'c_join') return reject('join_first', 'Send c_join first');
          session = this.handleJoin(ws, msg, ip) ?? undefined;
          return;
        }
        this.handleMessage(session, msg);
      } catch (err) {
        // A malformed packet must never take the whole server down.
        log('warn', 'message_error', { account: session?.accountId, error: String((err as Error)?.message ?? err), at: String((err as Error)?.stack ?? '').split('\n')[1]?.trim() });
        reject('bad_message', 'Invalid message');
      }
    });
    ws.on('close', () => {
      clearTimeout(joinTimeout);
      if (session && this.sessions.get(session.accountId) === session) {
        this.leaveParty(session);
        const tr = this.trades.get(session.accountId); if (tr) this.endTrade(tr, 'partner_left');
        this.arenaQueue = this.arenaQueue.filter((e) => e.id !== session!.accountId);
        if (session.spectating) this.stopSpectating(session, false);
        this.leave(session);
        this.save(session);
        if (this.deps.accounts.get(session.accountId)) this.deps.telemetry.log('session_end', session.accountId, String(Math.max(0, Math.round((this.clock.nowMs() - (session.connectedAt ?? this.clock.nowMs())) / 1000))));
        this.antiCheat.leave(session.accountId);
        this.sessions.delete(session.accountId);
      }
    });
    ws.on('error', () => ws.close());
  }

  private versionOk(v: string): boolean {
    const a = v.split('.').map(Number); const b = MIN_PROTOCOL_VERSION.split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((a[i] ?? 0) > (b[i] ?? 0)) return true; if ((a[i] ?? 0) < (b[i] ?? 0)) return false; }
    return true;
  }

  /** Failed joins per IP: free allowance for shared NATs, then exponential back-off. Accounts that already logged in from this IP are never blocked by it. */
  readonly joinThrottle = new FailureBackoff({ free: 20, baseMs: 1000, maxMs: 15 * 60_000, decayMs: 10 * 60_000 });
  private trustedLogins = new Map<string, Set<string>>();

  private handleJoin(ws: WebSocket, msg: Extract<ClientMessage, { type: 'c_join' }>, ip = 'unknown'): Session | null {
    const nowMs = this.clock.nowMs();
    const known = typeof msg.accountId === 'string' && this.trustedLogins.get(ip)?.has(msg.accountId);
    if (!known && this.joinThrottle.blockedFor(ip, nowMs) > 0) {
      this.sendRaw(ws, { type: 's_error', code: 'rate_limited', message: 'Too many failed logins, try again later', critical: true });
      ws.close(4429, 'rate_limited');
      return null;
    }
    if (!this.versionOk(typeof msg.protocolVersion === 'string' ? msg.protocolVersion : '0.0.0')) {
      this.sendRaw(ws, { type: 's_error', code: 'update_required', message: `Please update the game (need protocol ${MIN_PROTOCOL_VERSION})`, critical: true });
      ws.close(4426, 'update_required');
      return null;
    }
    if (typeof msg.accountId !== 'string' || typeof msg.secret !== 'string' || msg.accountId.length > 64 || msg.secret.length > 128) {
      this.joinThrottle.fail(ip, nowMs);
      this.sendRaw(ws, { type: 's_error', code: 'bad_credentials', message: 'Unknown account', critical: true });
      ws.close(4404, 'bad_credentials');
      return null;
    }
    const auth = this.deps.service.verify(msg.accountId, msg.secret);
    if (!auth.ok) {
      if (auth.error !== 'banned') this.joinThrottle.fail(ip, nowMs);
      this.sendRaw(ws, { type: 's_error', code: auth.error, message: auth.error === 'banned' ? 'This account is banned' : 'Unknown account', critical: true });
      ws.close(auth.error === 'banned' ? 4403 : 4404, auth.error);
      return null;
    }
    { let set = this.trustedLogins.get(ip); if (!set) this.trustedLogins.set(ip, set = new Set()); if (set.size < 500) set.add(auth.account.id); }
    // One active connection per account: the new login kicks the old one.
    const existing = this.sessions.get(auth.account.id);
    if (existing) {
      this.leave(existing);
      this.save(existing);
      this.sessions.delete(existing.accountId);
      this.sendRaw(existing.ws, { type: 's_error', code: 'logged_in_elsewhere', message: 'Signed in from another device', critical: true });
      existing.ws.close(4409, 'logged_in_elsewhere');
    }
    const row = this.deps.profiles.get(auth.account.id);
    const character = row?.character ?? createStarterCharacterForServer(auth.account.name, auth.account.startFaction as C.PlayerFaction);
    character.name = auth.account.name;
    const mapId = row?.mapId ?? C.HOME_MAP_BY_FACTION[character.faction];
    C.talentPointsAvailable(character);
    const s: Session = {
      ws, accountId: auth.account.id, name: auth.account.name, character, ammo: { ...DEFAULT_AMMO, ...(row?.ammo ?? {}) },
      instance: undefined as any, entityId: 0, encoder: new DeltaEncoder(), pending: [], lastSeq: 0,
      cmdBudget: MAX_COMMANDS_PER_SECOND, cmdBudgetRefill: 0, dirty: true, lastSave: this.clock.nowMs(), chatTimes: [], pendingEvents: [], suspicious: 0, streak: 0, bounty: 0, lastHonorAt: new Map(),
      rng: new SimRNG((this.clock.nowMs() ^ auth.account.id.length) >>> 0),
    };
    this.sessions.set(s.accountId, s);
    s.connectedAt = this.clock.nowMs();
    if (!row) this.deps.telemetry.log('account_created', s.accountId);
    this.deps.telemetry.log('session_start', s.accountId);
    this.antiCheat.join(s.accountId, s.name, this.clock.nowMs());
    this.deps.accounts.touch(s.accountId, this.clock.nowMs());
    Q.refreshQuests(character, Math.floor(this.clock.nowMs() / 1000));
    this.send(s, { type: 's_welcome', protocolVersion: PROTOCOL_VERSION, assignedEntityId: 0, mapId: String(mapId), serverTick: this.tick });
    this.enter(s, mapId);
    this.applyClanTag(s);
    if (!row) this.save(s); // new accounts appear in rankings right away
    for (const a of this.deps.social.latestAnnouncements(1)) this.send(s, { type: 's_social_event', kind: 'announcement', data: a });
    for (const m of this.deps.chat.recent('G', 20)) this.send(s, { type: 's_chat', message: { id: `h${m.ts}`, sender: m.sender, channel: 'G', text: m.text, timestamp: m.ts } });
    return s;
  }

  private handleMessage(s: Session, msg: ClientMessage): void {
    switch (msg.type) {
      case 'c_input': return this.handleInput(s, msg);
      case 'c_chat': return this.handleChat(s, msg);
      case 'c_action': {
        const id = Number.isFinite((msg as any).id) ? (msg as any).id : 0;
        if (!isFlatPayload(msg.action) || typeof (msg.action as any).kind !== 'string') return this.send(s, { type: 's_action_result', id, ok: false, error: 'bad_request' });
        return this.handleAction(s, { ...msg, id });
      }
      case 'c_social': {
        const id = Number.isFinite((msg as any).id) ? (msg as any).id : 0;
        if (!isFlatPayload(msg.req) || typeof (msg.req as any).op !== 'string') return this.send(s, { type: 's_social_result', id, ok: false, error: 'bad_request' });
        return this.handleSocial(s, { ...msg, id });
      }
      case 'c_ping': return this.send(s, { type: 's_pong', originalTimestamp: Number.isFinite(msg.timestamp) ? msg.timestamp : 0, serverTimestamp: this.clock.nowMs() });
      default: return;
    }
  }

  // ---------------------------------------------------------------- input validation

  private handleInput(s: Session, msg: Extract<ClientMessage, { type: 'c_input' }>): void {
    if (s.spectating) return; // spectators cannot send commands
    if (!Array.isArray(msg.commands) || typeof msg.seq !== 'number' || !Number.isFinite(msg.seq)) return;
    if (msg.seq <= s.lastSeq) { s.suspicious++; this.antiCheat.rejected(s.accountId, 'replay'); return; } // replayed or out-of-order
    this.antiCheat.input(s.accountId, this.clock.nowMs());
    s.lastSeq = msg.seq;
    const ent = s.instance.world.entities.get(s.entityId);
    if (!ent || ent.hull <= 0) return;
    if (s.instance.arena && s.instance.arena.state.phase !== 'fighting') return; // frozen during countdown/break
    for (const raw of msg.commands.slice(0, MAX_COMMANDS_PER_PACKET)) {
      if (s.cmdBudget < 1) { s.suspicious++; this.antiCheat.rejected(s.accountId, 'flood'); break; }
      s.cmdBudget--;
      const cmd = this.sanitize(s, raw);
      if (cmd) s.pending.push(cmd); else this.antiCheat.rejected(s.accountId, 'invalid');
    }
  }

  private sanitize(s: Session, c: SimCommand): SimCommand | undefined {
    if (typeof c !== 'object' || c === null) return undefined;
    switch (c.type) {
      case 'Drive': {
        if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) return undefined;
        const len = Math.hypot(c.x, c.y);
        return len > 1 ? { type: 'Drive', x: c.x / len, y: c.y / len } : { type: 'Drive', x: c.x, y: c.y };
      }
      case 'SetTarget': {
        if (c.targetId === null || c.targetId === undefined) return { type: 'SetTarget', targetId: null };
        if (typeof c.targetId !== 'number') return undefined;
        const t = s.instance.world.entities.get(c.targetId);
        const me = s.instance.world.entities.get(s.entityId);
        return t && me && t.hull > 0 && canEngage(s.instance.world, me, t) ? { type: 'SetTarget', targetId: c.targetId } : undefined;
      }
      case 'ToggleAutoFire': return { type: 'ToggleAutoFire' };
      case 'FireMain': return { type: 'FireMain' };
      case 'UseAbility': {
        if (typeof c.abilityId !== 'string' || !allowedAbilities(s.character).has(c.abilityId as AbilityId)) return undefined;
        this.tutorialStep(s, 'ability');
        return { type: 'UseAbility', abilityId: c.abilityId };
      }
      case 'SelectAmmo': {
        if (typeof c.ammo !== 'string' || !AMMO_IDS.includes(c.ammo)) return undefined;
        const ent = s.instance.world.entities.get(s.entityId);
        const stock = ent?.ammoInventory[c.ammo];
        if (!(ent && stock !== undefined && (stock === -1 || stock > 0))) return undefined;
        if (c.ammo !== 'STANDARD') this.tutorialStep(s, 'ammo');
        return { type: 'SelectAmmo', ammo: c.ammo };
      }
      default: return undefined; // EnterGate/Interact are server-driven
    }
  }

  /** Guided-start progress that the server can see itself; only talks to the client when a step just became claimable. */
  private tutorialStep(s: Session, step: string): void {
    if (s.character.stats[Q.tutorialFlag(step)] === 1) return;
    const ready = Q.onQuestEvent(s.character, { type: 'tutorial', step });
    s.dirty = true;
    if (ready.length) this.sendCharacter(s);
  }

  // ---------------------------------------------------------------- chat

  private handleChat(s: Session, msg: Extract<ClientMessage, { type: 'c_chat' }>): void {
    if (typeof msg.text !== 'string' || (msg.targetRecipient !== undefined && typeof msg.targetRecipient !== 'string')) return;
    const text = msg.text.trim().slice(0, 200);
    if (!text) return;
    const acct = this.deps.accounts.get(s.accountId);
    if (acct && acct.mutedUntil > this.clock.nowMs()) return this.send(s, { type: 's_error', code: 'muted', message: 'You are muted' });
    const now = this.clock.nowMs();
    s.chatTimes = s.chatTimes.filter((t) => now - t < CHAT_BURST.windowMs);
    const last = s.chatTimes[s.chatTimes.length - 1];
    if ((last !== undefined && now - last < CHAT_MIN_INTERVAL_MS) || s.chatTimes.length >= CHAT_BURST.count) return this.send(s, { type: 's_error', code: 'slow_mode', message: 'Slow down' });
    s.chatTimes.push(now);
    const clean = text.replace(/\b(fuck|shit|nazi)\w*/gi, (m) => '*'.repeat(m.length));
    const channel = msg.channel;
    const out: ServerMessage = { type: 's_chat', message: { id: `m${now}${s.accountId.slice(0, 4)}`, sender: s.name, clanTag: s.clanTag, clanEmblem: s.clanEmblem, channel: channel as any, text: clean, timestamp: now } };
    const blockedMe = new Set(this.deps.social.blockedBy(s.accountId)); // recipients who blocked the sender never see it
    const deliver = (o: Session) => { if (!blockedMe.has(o.accountId)) this.send(o, out); };
    switch (channel) {
      case 'G': case 'T':
        if (channel === 'G') this.deps.chat.add('G', s.name, clean, now);
        for (const o of this.sessions.values()) deliver(o);
        return;
      case 'M': for (const o of s.instance.sessions) deliver(o); return;
      case 'F': for (const o of this.sessions.values()) if (o.character.faction === s.character.faction) deliver(o); return;
      case 'C': {
        if (!s.clanId) return this.send(s, { type: 's_error', code: 'no_clan', message: 'You are not in a clan' });
        for (const o of this.sessions.values()) if (o.clanId === s.clanId) deliver(o);
        return;
      }
      case 'A': { // clan + allied clans
        if (!s.clanId) return this.send(s, { type: 's_error', code: 'no_clan', message: 'You are not in a clan' });
        const allies = new Set([s.clanId, ...this.deps.alliances.allyIds(s.clanId)]);
        for (const o of this.sessions.values()) if (o.clanId !== undefined && allies.has(o.clanId)) deliver(o);
        return;
      }
      case 'P': {
        const party = s.partyId ? this.parties.get(s.partyId) : undefined;
        if (!party) return this.send(s, { type: 's_error', code: 'no_party', message: 'You are not in a party' });
        for (const id of party.members) { const o = this.sessions.get(id); if (o) deliver(o); }
        return;
      }
      case 'W': {
        const target = msg.targetRecipient ? this.deps.accounts.getByName(msg.targetRecipient) : undefined;
        const o = target ? this.sessions.get(target.id) : undefined;
        if (!o) return this.send(s, { type: 's_error', code: 'player_offline', message: 'That player is not online' });
        if (this.deps.social.isBlocked(o.accountId, s.accountId)) return; // silently dropped
        this.send(o, out);
        this.send(s, out);
        return;
      }
      default: return;
    }
  }

  // ---------------------------------------------------------------- social (friends, parties, clans, profiles)

  private online(name: string): Session | undefined {
    const a = this.deps.accounts.getByName(name);
    return a ? this.sessions.get(a.id) : undefined;
  }

  /** Re-reads the alliance table into the Set shared by all worlds (war-point immunity). Called after every alliance change. */
  private refreshAlliances(): void {
    this.allianceSet.clear();
    for (const [a, b] of this.deps.alliances.activeTagPairs()) this.allianceSet.add(allianceKey(a, b));
  }

  private handleClanExtras(s: Session, req: any, reply: (r: { ok: boolean; error?: string; data?: any }) => void): void {
    const clan = this.deps.social.clanOf(s.accountId);
    if (!clan) return reply({ ok: false, error: 'no_clan' });
    const storage = this.deps.clanStorage; const alliances = this.deps.alliances;
    const role = clan.role as 'member' | 'officer' | 'leader';
    const storageView = () => ({
      capacity: storage.capacity(clan.id), minRole: storage.getPolicy(clan.id),
      items: storage.list(clan.id).map((x) => ({ id: x.id, item: x.item, by: x.depositedByName, ts: x.ts })),
      log: storage.log(clan.id), withdrawalsLeft: Math.max(0, STORAGE_DAILY_WITHDRAW[role] - storage.withdrawnLast24h(clan.id, s.accountId)),
    });
    const notifyClan = (clanId: number, kind: 'clan_storage' | 'clan_allies') => { for (const o of this.sessions.values()) if (o.clanId === clanId) this.send(o, { type: 's_social_event', kind, data: {} }); };
    const needOfficer = () => (role === 'member' ? 'no_permission' : undefined);
    switch (req.op) {
      case 'clan_storage': return reply({ ok: true, data: storageView() });
      case 'clan_deposit': {
        if (typeof req.uid !== 'string') return reply({ ok: false, error: 'item_not_found' });
        if (!this.inSafeZone(s)) return reply({ ok: false, error: 'safe_zone_only' });
        const ch = s.character;
        const it = C.findItem(ch, req.uid);
        if (it?.bound) return reply({ ok: false, error: 'item_bound' });
        if (it && C.isEquipped(ch, req.uid)) return reply({ ok: false, error: 'item_equipped' });
        const r = storage.deposit(clan.id, s.accountId, role, {
          take: () => { const i = ch.inventory.findIndex((x) => x.uid === req.uid); return i < 0 ? undefined : ch.inventory.splice(i, 1)[0]; },
          giveBack: (item) => { ch.inventory.push(item); },
          persist: () => this.save(s),
        });
        if (r.ok) { this.sendCharacter(s); notifyClan(clan.id, 'clan_storage'); return reply({ ok: true, data: storageView() }); }
        return reply(r);
      }
      case 'clan_withdraw': {
        if (!this.inSafeZone(s)) return reply({ ok: false, error: 'safe_zone_only' });
        const ch = s.character;
        const r = storage.withdraw(clan.id, s.accountId, role, req.id, {
          hasRoom: () => ch.inventory.length < C.inventoryCapacity(ch),
          give: (item) => { ch.inventory.push({ ...item, uid: `i${ch.nextUid++}` }); },
          remove: () => { ch.inventory.pop(); },
          persist: () => this.save(s),
        });
        if (r.ok) { this.sendCharacter(s); notifyClan(clan.id, 'clan_storage'); return reply({ ok: true, data: storageView() }); }
        return reply(r);
      }
      case 'clan_storage_policy': {
        const r = storage.setPolicy(clan.id, role, req.minRole);
        if (r.ok) notifyClan(clan.id, 'clan_storage');
        return reply(r.ok ? { ok: true, data: storageView() } : r);
      }
      case 'clan_allies': return reply({ ok: true, data: alliances.list(clan.id) });
      case 'clan_ally_propose': case 'clan_ally_accept': case 'clan_ally_decline': case 'clan_ally_break': {
        const denied = req.op === 'clan_ally_propose' || req.op === 'clan_ally_decline' ? needOfficer() : role === 'leader' ? undefined : 'no_permission';
        if (denied) return reply({ ok: false, error: denied });
        const r = req.op === 'clan_ally_propose' ? alliances.propose(clan.id, req.tag)
          : req.op === 'clan_ally_accept' ? alliances.accept(clan.id, req.clanId)
          : req.op === 'clan_ally_decline' ? alliances.decline(clan.id, req.clanId)
          : alliances.break(clan.id, req.clanId);
        if (!r.ok) return reply(r);
        this.refreshAlliances();
        const other = 'clanId' in r ? (r as any).clanId : Number(req.clanId);
        notifyClan(clan.id, 'clan_allies'); if (Number.isInteger(other)) notifyClan(other, 'clan_allies');
        return reply({ ok: true, data: alliances.list(clan.id) });
      }
    }
    return reply({ ok: false, error: 'bad_request' });
  }

  private applyClanTag(s: Session): void {
    const c = this.deps.social.clanOf(s.accountId);
    s.clanId = c?.id;
    s.clanTag = c?.tag;
    s.clanEmblem = c?.emblem;
    const e = s.instance?.world.entities.get(s.entityId);
    if (e) e.clanTag = c?.tag ?? 'CMD';
  }

  private socialEvent(accountId: string, kind: any, data: any): void {
    const o = this.sessions.get(accountId);
    if (o) this.send(o, { type: 's_social_event', kind, data });
  }

  private partyInfo(s: Session): any {
    const p = s.partyId ? this.parties.get(s.partyId) : undefined;
    if (!p) return null;
    return { id: p.id, leader: this.deps.accounts.get(p.leader)?.name, members: [...p.members].map((id) => {
      const o = this.sessions.get(id);
      return { name: o?.name ?? this.deps.accounts.get(id)?.name, level: o?.character.level ?? 1, hull: o ? Math.round((o.instance.world.entities.get(o.entityId)?.hull ?? 0)) : 0, mapId: o?.instance.mapId };
    }) };
  }

  private leaveParty(s: Session): void {
    const p = s.partyId ? this.parties.get(s.partyId) : undefined;
    s.partyId = undefined;
    if (!p) return;
    p.members.delete(s.accountId);
    if (p.members.size <= 1) {
      for (const id of p.members) { const o = this.sessions.get(id); if (o) o.partyId = undefined; this.socialEvent(id, 'party_update', null); }
      this.parties.delete(p.id);
      return;
    }
    if (p.leader === s.accountId) p.leader = [...p.members][0];
    for (const id of p.members) { const o = this.sessions.get(id); if (o) this.socialEvent(id, 'party_update', this.partyInfo(o)); }
  }

  private handleSocial(s: Session, p: ClientSocialPacket): void {
    const reply = (r: { ok: boolean; error?: string; data?: any }) => this.send(s, { type: 's_social_result', id: p.id, ok: r.ok, error: r.ok ? undefined : r.error, data: r.data });
    const social = this.deps.social;
    const req = p.req;
    const byName = (name: string) => this.deps.accounts.getByName(String(name ?? ''));
    if (NAME_OPS.has(req.op) && (typeof (req as any).name !== 'string' || !(req as any).name)) return reply({ ok: false, error: 'unknown_player' });
    if (req.op === 'ranking' && typeof req.kind !== 'string') return reply({ ok: false, error: 'bad_request' });
    const needsPlayer = !['clan_create'].includes(req.op) && 'name' in req;
    const target = needsPlayer ? byName((req as any).name) : undefined;
    if (needsPlayer && !target) return reply({ ok: false, error: 'unknown_player' });

    switch (req.op) {
      case 'friend_request': {
        const r = social.requestFriend(s.accountId, target!.id);
        if (r.ok) this.socialEvent(target!.id, r.autoAccepted ? 'friend_accepted' : 'friend_request', { from: s.name });
        return reply(r);
      }
      case 'friend_accept': { const r = social.acceptFriend(s.accountId, target!.id); if (r.ok) this.socialEvent(target!.id, 'friend_accepted', { from: s.name }); return reply(r); }
      case 'friend_remove': return reply(social.removeFriend(s.accountId, target!.id));
      case 'friend_list':
        return reply({ ok: true, data: social.friendList(s.accountId).map((f) => ({ ...f, online: this.sessions.has(f.id), mapId: this.sessions.get(f.id)?.instance.mapId })) });
      case 'block': return reply(social.block(s.accountId, target!.id));
      case 'unblock': return reply(social.unblock(s.accountId, target!.id));
      case 'block_list': return reply({ ok: true, data: social.blockList(s.accountId) });
      case 'report': return reply(social.report(s.accountId, target!.id, String(req.reason ?? '')));

      case 'party_invite': {
        const o = this.sessions.get(target!.id);
        if (!o) return reply({ ok: false, error: 'player_offline' });
        if (o.accountId === s.accountId) return reply({ ok: false, error: 'self' });
        if (o.partyId) return reply({ ok: false, error: 'target_in_party' });
        if (social.isBlocked(o.accountId, s.accountId)) return reply({ ok: false, error: 'blocked' });
        let party = s.partyId ? this.parties.get(s.partyId) : undefined;
        if (party && party.leader !== s.accountId) return reply({ ok: false, error: 'not_leader' });
        if (party && party.members.size >= PARTY_MAX) return reply({ ok: false, error: 'party_full' });
        if (!party) { party = { id: ++this.partyCounter, leader: s.accountId, members: new Set([s.accountId]) }; this.parties.set(party.id, party); s.partyId = party.id; }
        this.partyInvites.set(o.accountId, { from: s.accountId, party: party.id, exp: this.clock.nowMs() + 60_000 });
        this.socialEvent(o.accountId, 'party_invite', { from: s.name });
        return reply({ ok: true });
      }
      case 'party_accept': {
        const inv = this.partyInvites.get(s.accountId);
        const party = inv ? this.parties.get(inv.party) : undefined;
        if (!inv || !party || inv.exp < this.clock.nowMs() || inv.from !== target!.id) return reply({ ok: false, error: 'no_invite' });
        if (party.members.size >= PARTY_MAX) return reply({ ok: false, error: 'party_full' });
        this.partyInvites.delete(s.accountId);
        party.members.add(s.accountId);
        s.partyId = party.id;
        for (const id of party.members) { const o = this.sessions.get(id); if (o) this.socialEvent(id, 'party_update', this.partyInfo(o)); }
        return reply({ ok: true });
      }
      case 'party_leave': this.leaveParty(s); return reply({ ok: true });
      case 'party_kick': {
        const party = s.partyId ? this.parties.get(s.partyId) : undefined;
        if (!party || party.leader !== s.accountId) return reply({ ok: false, error: 'not_leader' });
        const o = this.sessions.get(target!.id);
        if (!o || o.partyId !== party.id || o === s) return reply({ ok: false, error: 'not_in_party' });
        this.leaveParty(o);
        this.socialEvent(o.accountId, 'party_update', null);
        return reply({ ok: true });
      }
      case 'party_info': return reply({ ok: true, data: this.partyInfo(s) });

      case 'clan_create': {
        if (s.character.wallet.scrap < CLAN_CREATE_COST) return reply({ ok: false, error: 'not_enough_scrap' });
        const r = social.createClan(s.accountId, String(req.name ?? ''), String(req.tag ?? ''), req.emblem === undefined || req.emblem === null || req.emblem === '' ? undefined : String(req.emblem));
        if (r.ok) { s.character.wallet.scrap -= CLAN_CREATE_COST; s.dirty = true; this.applyClanTag(s); this.sendCharacter(s); }
        return reply(r);
      }
      case 'clan_emblem': {
        const r = social.setEmblem(s.accountId, String(req.emblem ?? ''));
        if (r.ok) for (const o of this.sessions.values()) if (o.clanId === s.clanId) this.applyClanTag(o);
        return reply(r);
      }
      case 'clan_invite': {
        const r = social.invite(s.accountId, target!.id);
        if (r.ok) this.socialEvent(target!.id, 'clan_invite', { from: s.name, clan: social.clanOf(s.accountId)?.name });
        return reply(r);
      }
      case 'clan_invites': return reply({ ok: true, data: social.invitesFor(s.accountId) });
      case 'clan_accept': { const r = social.acceptInvite(s.accountId, Number(req.clanId)); if (r.ok) this.applyClanTag(s); return reply(r); }
      case 'clan_leave': {
        const c = social.clanOf(s.accountId);
        const lastMember = !!c && social.members(c.id).length === 1;
        const stored = c && lastMember ? this.deps.clanStorage.drain(c.id) : [];
        for (const it of stored) this.mailTo(s.accountId, 'item', it, 'Returned from the dissolved clan storage'); // mailed before the clan row (and its storage) is deleted
        const r = social.leave(s.accountId);
        this.applyClanTag(s);
        this.refreshAlliances();
        return reply(r);
      }
      case 'clan_kick': {
        const r = social.kick(s.accountId, target!.id);
        if (r.ok) { const o = this.sessions.get(target!.id); if (o) this.applyClanTag(o); }
        return reply(r);
      }
      case 'clan_role': { const r = social.setRole(s.accountId, target!.id, req.role); if (r.ok) { const o = this.sessions.get(target!.id); if (o) this.applyClanTag(o); } return reply(r); }
      case 'clan_info': { const c = social.clanOf(s.accountId); return reply(c ? { ok: true, data: { ...social.clanInfo(c.id), myRole: c.role } } : { ok: false, error: 'no_clan' }); }
      case 'clan_donate': {
        const n = Math.floor(Number(req.amount));
        if (!(n > 0) || s.character.wallet.scrap < n) return reply({ ok: false, error: 'not_enough_scrap' });
        const r = social.donate(s.accountId, n);
        if (r.ok) { s.character.wallet.scrap -= n; s.dirty = true; this.sendCharacter(s); }
        return reply(r);
      }
      case 'clan_research': return reply(social.research(s.accountId, String(req.id)));
      case 'clan_storage': case 'clan_deposit': case 'clan_withdraw': case 'clan_storage_policy':
      case 'clan_allies': case 'clan_ally_propose': case 'clan_ally_accept': case 'clan_ally_decline': case 'clan_ally_break':
        return this.handleClanExtras(s, req, reply);

      case 'profile': {
        const live = this.sessions.get(target!.id);
        const row = live ? { character: live.character } : this.deps.profiles.get(target!.id);
        const c = social.clanOf(target!.id);
        const stats = row ? C.computeLoadoutStats(row.character) : undefined;
        return reply({ ok: true, data: {
          name: target!.name, level: row?.character.level ?? 1, clan: c ? { name: c.name, tag: c.tag, emblem: c.emblem ?? null } : null, online: !!live,
          vehicle: row?.character.activeVehicle, power: stats ? Math.round(Math.sqrt(stats.dps * (stats.maxHull + stats.maxArmor))) : 0,
          titles: row?.character.season.titles ?? [], isFriend: social.areFriends(s.accountId, target!.id), blocked: social.isBlocked(s.accountId, target!.id),
        } });
      }
      case 'ranking':
        if (req.kind.startsWith('arena_')) return reply({ ok: true, data: this.deps.arena.top(req.kind.slice(6)) });
        if (req.kind === 'honor') return reply({ ok: true, data: this.deps.profiles.topByHonor(20) });
        return reply({ ok: true, data: req.kind === 'clans' ? social.clanRanking(20) : this.deps.profiles.topByLevel(20) });
      case 'arena_queue': return reply(this.arenaQueueJoin(s, req.mode));
      case 'dungeon_list': case 'dungeon_enter': case 'dungeon_leave': return reply(this.handleDungeon(s, req as any));
      case 'ah_sell': case 'ah_search': case 'ah_mine': case 'ah_recent': case 'ah_buy': case 'ah_cancel': case 'mail_list': case 'mail_claim':
      case 'trade_open': case 'trade_set': case 'trade_confirm': case 'trade_cancel': case 'trade_info':
      case 'fast_travel': case 'shop_list': case 'shop_buy': case 'shop_receipt':
        return this.handleMarket(s, req as any, reply);
      case 'spectate_list': return reply({ ok: true, data: this.spectateList() });
      case 'spectate_join': return reply(this.spectateJoin(s, req.matchId));
      case 'spectate_leave': if (!s.spectating) return reply({ ok: false, error: 'not_spectating' }); this.stopSpectating(s, true); return reply({ ok: true });
      case 'arena_leave': this.arenaQueue = this.arenaQueue.filter((e) => e.id !== s.accountId); return reply({ ok: true });
      case 'arena_status': {
        const ratings = Object.fromEntries((Object.keys(AR.ARENA_MODES) as AR.ArenaMode[]).map((m) => [m, this.deps.arena.get(s.accountId, m)]));
        const stats = C.computeLoadoutStats(s.character);
        const power = stats ? AR.arenaPower(stats.dps, stats.maxHull, stats.maxArmor, stats.flatReduction) : 0;
        return reply({ ok: true, data: { power, league: AR.leagueForPower(power), ratings, queued: this.arenaQueue.find((e) => e.id === s.accountId)?.mode ?? null, inMatch: !!s.instance.arena, banMinutes: Math.ceil(Math.max(0, (this.arenaBans.get(s.accountId) ?? 0) - this.clock.nowMs()) / 60000) } });
      }
      case 'war_status': return reply({ ok: true, data: this.warStatus(s) });
      case 'war_claim': return reply(this.warClaim(s));
      case 'feedback': {
        if (typeof req.text !== 'string' || typeof req.kind !== 'string') return reply({ ok: false, error: 'bad_request' });
        const state = sanitizeState({ map: s.instance?.mapId, level: s.character.level, version: req.version }, s.errors ?? []);
        return reply(this.deps.feedback.submit(s.accountId, req.kind, req.text, state));
      }
    }
  }

  /** Party members near the killer share the XP; the total is boosted by 10 % per extra member (data above). */
  private partyShare(s: Session): Session[] {
    const party = s.partyId ? this.parties.get(s.partyId) : undefined;
    if (!party) return [s];
    const me = s.instance.world.entities.get(s.entityId);
    const near: Session[] = [];
    for (const id of party.members) {
      const o = this.sessions.get(id);
      const e = o?.instance === s.instance ? o.instance.world.entities.get(o.entityId) : undefined;
      if (o && e && me && e.hull > 0 && (e.pos.x - me.pos.x) ** 2 + (e.pos.y - me.pos.y) ** 2 <= PARTY_SHARE_RADIUS ** 2) near.push(o);
    }
    return near.length ? near : [s];
  }

  // ---------------------------------------------------------------- actions (workshop, garage, quests...)

  private handleAction(s: Session, p: ClientActionPacket): void {
    const r = executeAction(s.character, p.action, s.rng, {
      inSafeZone: this.inSafeZone(s),
      nowSeconds: Math.floor(this.clock.nowMs() / 1000),
      buyAmmo: (ammo, packs) => this.buyAmmo(s, ammo, packs),
    });
    this.send(s, { type: 's_action_result', id: p.id, ok: r.ok, error: r.ok ? undefined : (r as any).error });
    if (r.ok) {
      if (p.action.kind.startsWith('buy_')) this.deps.telemetry.log('first_purchase', s.accountId);
      if (p.action.kind === 'buy_ammo') Q.onQuestEvent(s.character, { type: 'tutorial', step: 'ammo' }); // buying special ammo counts for the ammo lesson too
      const ent = s.instance.world.entities.get(s.entityId);
      if (ent) refreshPlayerStats(ent, s.character);
      s.dirty = true;
      this.sendCharacter(s);
      // value-changing operations are persisted immediately, not on the 30 s autosave
      if (['craft', 'upgrade', 'fuse', 'dismantle', 'buy_vehicle', 'sell_item', 'claim_quest', 'claim_season_tier', 'change_faction', 'set_skin'].includes(p.action.kind)) this.save(s);
    }
  }

  private buyAmmo(s: Session, ammo: AmmoType, packs: number): C.Result {
    const price = AMMO_PRICES[ammo];
    const n = Math.floor(Number(packs));
    if (!price || !Number.isInteger(n) || n < 1 || n > 50) return { ok: false, error: 'bad_request' };
    const cost = ammoCost(s.character, ammo, n)!;
    if (s.character.wallet.scrap < cost) return { ok: false, error: 'not_enough_scrap' };
    s.character.wallet.scrap -= cost;
    const ent = s.instance.world.entities.get(s.entityId);
    const have = ent ? ent.ammoInventory[ammo] ?? 0 : s.ammo[ammo] ?? 0;
    if (ent) ent.ammoInventory[ammo] = have + price.pack * n;
    s.ammo[ammo] = have + price.pack * n;
    return { ok: true };
  }

  private inSafeZone(s: Session): boolean {
    const e = s.instance.world.entities.get(s.entityId);
    return !!e && s.instance.world.safeZones.some((z) => (e.pos.x - z.x) ** 2 + (e.pos.y - z.y) ** 2 <= z.radius * z.radius);
  }

  // ---------------------------------------------------------------- game events -> rewards

  private processEvents(inst: Instance): void {
    const world = inst.world;
    const byEntity = new Map<number, Session>();
    for (const s of inst.sessions) byEntity.set(s.entityId, s);

    // World messages (boss alerts, event starts) go out as system chat
    while (inst.chatSent < world.chat.length) {
      const m = world.chat[inst.chatSent++];
      if (m.sender !== 'HQ Commander') for (const s of inst.sessions) this.send(s, { type: 's_chat', message: m });
    }
    for (const ev of world.events) {
      for (const s of inst.sessions) s.pendingEvents.push(ev);
      inst.arena?.rec.addEvent(ev);
      switch (ev.type) {
        case 'event_started': if (ev.kind === 'invasion') for (const s of inst.sessions) s.invasionKills = 0; break;
        case 'event_ended': {
          if (ev.kind !== 'invasion') break;
          for (const s of inst.sessions) {
            const kills = s.invasionKills ?? 0; s.invasionKills = 0;
            const scrap = invasionReward(kills);
            if (scrap <= 0) continue;
            s.character.wallet.scrap += scrap; s.dirty = true; this.sendCharacter(s);
            this.send(s, { type: 's_social_event', kind: 'event_reward', data: { event: 'invasion', scrap, kills } });
          }
          break;
        }
        case 'entity_killed': {
          const killer = ev.killerId !== undefined ? byEntity.get(ev.killerId) : undefined;
          const victim = world.entities.get(ev.victimId);
          if (killer && victim && victim.isHostile) this.rewardKill(killer, victim);
          const victimSession = byEntity.get(ev.victimId);
          if (victimSession && world.pvp) this.pvpDeath(inst, killer, victimSession);
          break;
        }
        case 'loot_collected': {
          const s = byEntity.get(ev.collectorId);
          if (s) this.rewardLoot(s, ev.crateType, ev.amount);
          break;
        }
        case 'boss_rewards': {
          const tierMult = { gold: 1, silver: 0.5, bronze: 0.2 } as const;
          const boss = world.entities.get(ev.bossId);
          for (const r of ev.rewards) {
            const s = byEntity.get(r.entityId);
            if (!s || !boss) continue;
            const m = tierMult[r.tier];
            const scrap = Math.round((2000 + boss.level * 400) * m);
            s.character.wallet.scrap += scrap; bump(s.character, 'scrap_earned', scrap);
            if (r.tier !== 'bronze') { const loot = rollLoot(s.rng, boss.level, 1, true, true, s.character.pityCounter); if (loot.itemId && loot.rarity) C.createItem(s.character, loot.itemId, loot.rarity, s.rng); }
            this.send(s, { type: 's_chat', message: { id: `br${r.entityId}`, sender: 'SYSTEM', channel: 'S', text: `World boss reward (${r.tier}): ${scrap} scrap`, timestamp: this.clock.nowMs() } });
            s.dirty = true; this.sendCharacter(s);
          }
          break;
        }
        case 'dungeon_cleared': { this.finishDungeon(inst, true); break; }
        case 'dungeon_failed': { this.finishDungeon(inst, false); break; }
        case 'player_died': {
          const s = byEntity.get(ev.entityId);
          if (s && !inst.arena && !world.dungeon) { if (s.character.level > NEWBIE_PROTECTION_LEVEL) s.character.wallet.scrap = Math.floor(s.character.wallet.scrap * 0.9); s.respawnAt = world.time + RESPAWN_SECONDS; s.dirty = true; this.sendCharacter(s); }
          break;
        }
        case 'gate_used': {
          const s = byEntity.get(ev.entityId);
          if (s) this.travel(s, ev.gateId, Number(ev.targetMapId));
          break;
        }
      }
    }
  }

  /** A player died on a PvP map: honor, kill cap, streaks and bounties. Killer is undefined for non-player deaths. */
  private pvpDeath(inst: Instance, killer: Session | undefined, victim: Session): void {
    const world = inst.world;
    const vEnt = world.entities.get(victim.entityId);
    const hadBounty = victim.bounty;
    victim.streak = 0;
    victim.bounty = 0;
    if (!killer || killer === victim || !vEnt) return;
    const kEnt = world.entities.get(killer.entityId);
    if (!kEnt || !world.pvp) return;
    registerPvpKill(world, kEnt.id, vEnt.id);
    const outcome = honorOutcome(world, kEnt, vEnt, killer.lastHonorAt, Math.floor(world.time));
    const honor = outcome.honor;
    if (!world.pvp.arena) {
      killer.character.wallet.honor += honor;
      victim.character.wallet.honor = Math.max(0, victim.character.wallet.honor - HONOR_LOSS_ON_DEATH);
    }
    killer.streak++;
    bump(killer.character, 'pvp_kills');
    if (hadBounty > 0) {
      killer.character.wallet.scrap += hadBounty;
      killer.character.wallet.honor += 25;
      this.systemMessage(inst, `${killer.name} claimed the ${hadBounty}-scrap bounty on ${victim.name}!`);
    }
    if (!world.pvp.arena && killer.streak >= BOUNTY_STREAK && killer.bounty === 0) {
      killer.bounty = killer.streak * BOUNTY_SCRAP_PER_STREAK;
      this.systemMessage(inst, `${killer.name} is on a ${killer.streak}-kill streak: bounty ${killer.bounty} scrap!`);
    } else if (killer.bounty > 0) killer.bounty = killer.streak * BOUNTY_SCRAP_PER_STREAK;
    killer.dirty = victim.dirty = true;
    this.sendCharacter(killer);
    this.sendCharacter(victim);
    // plain-language summary after every player kill (rules explained when something was withheld)
    if (!world.pvp.arena) {
      const capHit = (world.pvpImmunity.get(`${kEnt.id}>${vEnt.id}`) ?? 0) > world.time;
      this.send(killer, { type: 's_social_event', kind: 'pvp_summary', data: { role: 'kill', other: victim.name, honor, bounty: hadBounty, streak: killer.streak, reason: outcome.reason, capped: capHit } });
      this.send(victim, { type: 's_social_event', kind: 'pvp_summary', data: { role: 'death', other: killer.name, honor: -HONOR_LOSS_ON_DEATH, bounty: 0, streak: 0 } });
    }
  }

  private systemMessage(inst: Instance, text: string): void {
    const m: ServerMessage = { type: 's_chat', message: { id: `sys${this.clock.nowMs()}`, sender: 'SYSTEM', channel: 'S', text, timestamp: this.clock.nowMs() } };
    for (const o of inst.sessions) this.send(o, m);
  }

  getSession(accountId: string) { return this.sessions.get(accountId); }

  private rewardKill(s: Session, victim: SimEntity): void {
    const ch = s.character;
    const isBoss = victim.kind === 'boss';
    const xp = Math.round(calculateKillXP(ch.level, victim.level, !!victim.isElite, isBoss) * (isWeekendXp(Math.floor(this.clock.nowMs() / 1000)) ? WEEKEND_XP_MULTIPLIER : 1));
    if (victim.fromInvasion) s.invasionKills = (s.invasionKills ?? 0) + 1;
    const before = ch.level;
    const group = this.partyShare(s);
    if (group.length > 1) {
      const each = Math.round((xp * (1 + PARTY_XP_BONUS_PER_EXTRA * (group.length - 1))) / group.length);
      for (const m of group) {
        const mb = m.character.level;
        C.grantXP(m.character, each);
        C.addMasteryXp(m.character, m.character.activeVehicle, Math.round(each / 4));
        Q.onQuestEvent(m.character, { type: 'kill', kind: victim.kind, level: victim.level, isElite: !!victim.isElite, isBoss }); // shared quest credit
        if (m !== s) { m.dirty = true; if (m.character.level !== mb) { const e = m.instance.world.entities.get(m.entityId); if (e) refreshPlayerStats(e, m.character); } this.sendCharacter(m); }
      }
    } else {
      C.grantXP(ch, xp);
      C.addMasteryXp(ch, ch.activeVehicle, Math.round(xp / 4));
    }
    const loot = rollLoot(s.rng, victim.level, 1, !!victim.isElite, isBoss, ch.pityCounter);
    ch.pityCounter = loot.newPityCounter;
    if (loot.itemId && loot.rarity) { if (C.createItem(ch, loot.itemId, loot.rarity, s.rng).ok) codexAdd(ch, 'item', loot.itemId); }
    if (loot.keys > 0) ch.wallet.gateKeys += loot.keys;
    bump(ch, 'kills');
    if (isBoss) bump(ch, 'bosses');
    if (victim.isWorldBoss) bump(ch, 'world_bosses');
    codexAdd(ch, 'enemy', victim.archetypeId || victim.kind);
    if (s.clanId) this.deps.social.addClanProgress(s.clanId, 'clan_hunt', 1);
    if (group.length <= 1) Q.onQuestEvent(ch, { type: 'kill', kind: victim.kind, level: victim.level, isElite: !!victim.isElite, isBoss });
    if (isBoss) Q.onQuestEvent(ch, { type: 'defeat_boss', bossId: victim.archetypeId || 'boss' });
    if (ch.level !== before) {
      const ent = s.instance.world.entities.get(s.entityId);
      if (ent) refreshPlayerStats(ent, ch);
      Q.onQuestEvent(ch, { type: 'tutorial', step: 'levelup' });
      this.save(s);
    }
    s.dirty = true;
    this.sendCharacter(s);
  }

  private rewardLoot(s: Session, crateType: string, amount: number): void {
    const [kind, sub] = crateType.split(':');
    const w = s.character.wallet;
    if (kind === 'scrap') { w.scrap += amount; bump(s.character, 'scrap_earned', amount); bump(s.character, 'crates'); }
    else if (kind === 'parts') w.fragments += amount;
    else if (kind === 'ore' && sub) { bump(s.character, 'mining_nodes'); if (s.clanId) this.deps.social.addClanProgress(s.clanId, 'clan_mine', amount); w.ore[sub as C.OreType] += amount; Q.onQuestEvent(s.character, { type: 'collect_ore', ore: sub, amount }); }
    else if (kind === 'ore') { w.ore.iron += amount; Q.onQuestEvent(s.character, { type: 'collect_ore', ore: 'iron', amount }); }
    else if (kind === 'ammo' && sub) {
      s.ammo[sub] = (s.ammo[sub] ?? 0) + amount;
    } else return;
    Q.onQuestEvent(s.character, { type: 'tutorial', step: 'loot' });
    s.dirty = true;
    this.sendCharacter(s);
  }

  private travel(s: Session, gateId: string, targetMapId: number): void {
    const from = s.instance;
    const gate = from.map.gates.find((g) => g.id === gateId);
    const target = getAllMaps().find((m: any) => m.id === targetMapId) as MapDef | undefined;
    if (!gate || !target) return;
    if (s.character.level < (gate.minLevel ?? 1)) return;
    this.leave(s);
    bump(s.character, 'portal_jumps');
    Q.onQuestEvent(s.character, { type: 'use_portal', mapId: targetMapId });
    Q.onQuestEvent(s.character, { type: 'reach_map', mapId: targetMapId });
    Q.onQuestEvent(s.character, { type: 'tutorial', step: 'portal' });
    this.enter(s, targetMapId, { ...gate.spawnPoint });
    s.dirty = true;
    this.save(s);
  }

  private handleRespawns(inst: Instance): void {
    for (const s of inst.sessions) {
      if (s.respawnAt === undefined || inst.world.time < s.respawnAt) continue;
      const e = inst.world.entities.get(s.entityId);
      if (!e) continue;
      const sp = inst.world.dungeon ? dungeonEntryPoint() : this.spawnPos(inst);
      e.pos = { ...sp }; e.vel = { x: 0, y: 0 };
      e.hull = e.maxHull; e.armor = e.maxArmor;
      e.invulnerableTime = 5; e.isWreck = false; e.wreckTimer = undefined; e.targetId = undefined; e.statusEffects = [];
      s.respawnAt = undefined;
    }
  }

  // ---------------------------------------------------------------- economy: auction house, mail, trade, fast travel, premium shop

  /** Both players inside a safe zone (anywhere), or standing close together in the same instance. */
  private canTradeHere(a: Session, b: Session): boolean {
    if (this.inSafeZone(a) && this.inSafeZone(b)) return true;
    if (a.instance !== b.instance) return false;
    const ea = a.instance.world.entities.get(a.entityId); const eb = b.instance.world.entities.get(b.entityId);
    return !!ea && !!eb && (ea.pos.x - eb.pos.x) ** 2 + (ea.pos.y - eb.pos.y) ** 2 <= TRADE_MAX_DISTANCE ** 2;
  }

  private inHub(s: Session): boolean { return s.instance.mapId === 13 && this.inSafeZone(s); }

  private warDiscount(s: Session): number {
    return this.lastWeekWinner() === s.character.faction ? WAR_WINNER_MARKET_DISCOUNT : 0;
  }

  private givePurchased(s: Session, item: C.ItemInstance): void {
    s.character.inventory.push({ ...item, uid: `i${s.character.nextUid++}` });
  }

  private mailTo(accountId: string, kind: 'item' | 'scrap', payload: any, note: string): void {
    const o = this.sessions.get(accountId);
    if (o && kind === 'scrap') { o.character.wallet.scrap += payload; o.dirty = true; this.sendCharacter(o); this.send(o, { type: 's_social_event', kind: 'mail', data: { note } }); return; }
    if (kind === 'item') this.deps.market.sendItem(accountId, payload, note); else this.deps.market.sendScrap(accountId, payload, note);
    if (o) this.send(o, { type: 's_social_event', kind: 'mail', data: { note } });
  }

  private handleMarket(s: Session, req: any, reply: (r: { ok: boolean; error?: string; data?: any }) => void): void {
    const ch = s.character;
    const market = this.deps.market;
    const nowMs = this.clock.nowMs();
    if (req.op.startsWith('ah_') && !FLAGS.auctionEnabled) return reply({ ok: false, error: 'disabled' });

    switch (req.op) {
      case 'ah_search': return reply({ ok: true, data: market.search({ defId: typeof req.defId === 'string' ? req.defId : undefined, slot: typeof req.slot === 'string' ? req.slot : undefined, maxPrice: typeof req.maxPrice === 'number' ? req.maxPrice : undefined }) });
      case 'ah_mine': return reply({ ok: true, data: market.mine(s.accountId) });
      case 'ah_recent': return reply(typeof req.defId === 'string' && ITEM_BY_ID.has(req.defId) ? { ok: true, data: market.recentSales(req.defId) } : { ok: false, error: 'bad_request' });
      case 'ah_sell': {
        if (!this.inHub(s)) return reply({ ok: false, error: 'hub_only' });
        const item = C.findItem(ch, req.uid);
        if (!item) return reply({ ok: false, error: 'item_not_found' });
        if (C.isEquipped(ch, item.uid)) return reply({ ok: false, error: 'item_equipped' });
        const acct = this.deps.accounts.get(s.accountId)!;
        const r = market.list(s.accountId, acct.createdAt, item, Number(req.price), Number(req.hours));
        if (!r.ok) return reply(r);
        ch.inventory = ch.inventory.filter((i) => i.uid !== item.uid);
        s.dirty = true; this.sendCharacter(s);
        return reply({ ok: true, data: { id: r.id } });
      }
      case 'ah_cancel': {
        const l = market.get(Number(req.id));
        if (!l || l.seller !== s.accountId || l.status !== 'active') return reply({ ok: false, error: 'not_found' });
        if (!market.close(l.id, 'cancelled')) return reply({ ok: false, error: 'not_found' });
        this.mailTo(s.accountId, 'item', l.item, 'Listing cancelled: item returned');
        return reply({ ok: true });
      }
      case 'ah_buy': {
        if (!this.inHub(s)) return reply({ ok: false, error: 'hub_only' });
        const l = market.get(Number(req.id));
        if (!l || l.status !== 'active' || l.expiresAt <= nowMs) return reply({ ok: false, error: 'not_found' });
        if (l.seller === s.accountId) return reply({ ok: false, error: 'own_listing' });
        if (ch.wallet.scrap < l.price) return reply({ ok: false, error: 'not_enough_scrap' });
        if (INVENTORY_FREE(ch) <= 0) return reply({ ok: false, error: 'inventory_full' });
        if (market.volumeToday(s.accountId) + l.price > DAILY_TRADE_VOLUME_CAP) return reply({ ok: false, error: 'daily_trade_cap' });
        if (market.volumeToday(l.seller) + l.price > DAILY_TRADE_VOLUME_CAP) return reply({ ok: false, error: 'seller_trade_cap' });
        if (!market.close(l.id, 'sold')) return reply({ ok: false, error: 'not_found' }); // someone else was faster
        this.deps.telemetry.log('first_purchase', s.accountId);
        const sellerSession = this.sessions.get(l.seller);
        const taxChar = sellerSession?.character ?? this.deps.profiles.get(l.seller)?.character ?? ch;
        const tax = auctionTax(l.price, taxChar, sellerSession ? this.warDiscount(sellerSession) : 0);
        ch.wallet.scrap -= l.price;
        this.givePurchased(s, l.item);
        market.addVolume(s.accountId, l.price); market.addVolume(l.seller, l.price);
        { const ss = this.sessions.get(l.seller); if (ss) bump(ss.character, 'market_sales'); }
        this.mailTo(l.seller, 'scrap', l.price - tax, `Sold an item for ${l.price} scrap (tax ${tax})`);
        s.dirty = true; this.sendCharacter(s); this.save(s);
        return reply({ ok: true, data: { tax } });
      }
      case 'mail_list': return reply({ ok: true, data: market.mail(s.accountId) });
      case 'mail_claim': {
        const m = market.mail(s.accountId).find((x) => x.id === Number(req.id));
        if (!m) return reply({ ok: false, error: 'not_found' });
        if (m.kind === 'item') {
          if (INVENTORY_FREE(ch) <= 0) return reply({ ok: false, error: 'inventory_full' });
          this.givePurchased(s, JSON.parse(m.payload));
        } else ch.wallet.scrap += Number(m.payload);
        market.deleteMail(m.id);
        s.dirty = true; this.sendCharacter(s);
        return reply({ ok: true });
      }

      case 'trade_open': {
        const other = this.online(req.name);
        if (!other || other === s) return reply({ ok: false, error: 'player_offline' });
        const ok = this.deps.social.areFriends(s.accountId, other.accountId) || (s.clanId !== undefined && s.clanId === other.clanId);
        if (!ok) return reply({ ok: false, error: 'friends_or_clan_only' });
        if (!this.canTradeHere(s, other)) return reply({ ok: false, error: 'too_far' });
        if (this.trades.has(s.accountId) || this.trades.has(other.accountId)) return reply({ ok: false, error: 'already_trading' });
        if (this.deps.social.isBlocked(other.accountId, s.accountId)) return reply({ ok: false, error: 'blocked' });
        const t: TradeSession = { a: s.accountId, b: other.accountId, offers: { [s.accountId]: { items: [], scrap: 0 }, [other.accountId]: { items: [], scrap: 0 } }, confirmed: new Set() };
        this.trades.set(s.accountId, t); this.trades.set(other.accountId, t);
        this.send(other, { type: 's_social_event', kind: 'trade_update', data: this.tradeView(t, other.accountId) });
        return reply({ ok: true, data: this.tradeView(t, s.accountId) });
      }
      case 'trade_info': { const t = this.trades.get(s.accountId); return reply({ ok: true, data: t ? this.tradeView(t, s.accountId) : null }); }
      case 'trade_cancel': { const t = this.trades.get(s.accountId); if (t) this.endTrade(t, 'cancelled'); return reply({ ok: true }); }
      case 'trade_set': {
        const t = this.trades.get(s.accountId);
        if (!t) return reply({ ok: false, error: 'no_trade' });
        const items: string[] = Array.isArray(req.items) ? req.items.slice(0, 20).map(String) : [];
        const scrap = Math.max(0, Math.floor(Number(req.scrap) || 0));
        for (const uid of items) {
          const it = C.findItem(ch, uid);
          if (!it) return reply({ ok: false, error: 'item_not_found' });
          if (it.bound) return reply({ ok: false, error: 'item_bound' });
          if (C.isEquipped(ch, uid)) return reply({ ok: false, error: 'item_equipped' });
        }
        if (new Set(items).size !== items.length) return reply({ ok: false, error: 'duplicate_item' });
        if (scrap > ch.wallet.scrap) return reply({ ok: false, error: 'not_enough_scrap' });
        t.offers[s.accountId] = { items, scrap };
        t.confirmed.clear(); // any change resets both confirmations
        const other = this.sessions.get(t.a === s.accountId ? t.b : t.a);
        if (other) this.send(other, { type: 's_social_event', kind: 'trade_update', data: this.tradeView(t, other.accountId) });
        return reply({ ok: true, data: this.tradeView(t, s.accountId) });
      }
      case 'trade_confirm': {
        const t = this.trades.get(s.accountId);
        if (!t) return reply({ ok: false, error: 'no_trade' });
        t.confirmed.add(s.accountId);
        const sa = this.sessions.get(t.a); const sb = this.sessions.get(t.b);
        if (t.confirmed.size === 2 && sa && sb) {
          const res = this.executeTrade(t, sa, sb);
          this.endTrade(t, res.ok ? 'completed' : res.error);
          return reply(res);
        }
        const other = t.a === s.accountId ? sb : sa;
        if (other) this.send(other, { type: 's_social_event', kind: 'trade_update', data: this.tradeView(t, other.accountId) });
        return reply({ ok: true, data: this.tradeView(t, s.accountId) });
      }

      case 'fast_travel': {
        if (!this.inSafeZone(s)) return reply({ ok: false, error: 'safe_zone_only' });
        const target = Number(req.mapId);
        if (!ch.visitedMaps.includes(target)) return reply({ ok: false, error: 'not_visited' });
        if (target === s.instance.mapId) return reply({ ok: false, error: 'already_there' });
        const hops = this.mapDistance(s.instance.mapId, target);
        if (hops === undefined) return reply({ ok: false, error: 'unreachable' });
        const cost = C.fastTravelCost(hops);
        if (ch.wallet.scrap < cost) return reply({ ok: false, error: 'not_enough_scrap' });
        const map = getMapById(target) as MapDef;
        if (ch.level < (map.levelRange?.[0] ?? 1) - 5) return reply({ ok: false, error: 'level_too_low' });
        ch.wallet.scrap -= cost;
        this.leaveParty(s);
        this.leave(s);
        this.enter(s, target);
        s.dirty = true; this.sendCharacter(s);
        return reply({ ok: true, data: { cost } });
      }

      case 'shop_list': return reply(FLAGS.premiumCurrencyEnabled ? { ok: true, data: SHOP_CATALOG } : { ok: false, error: 'disabled' });
      case 'shop_buy': {
        const r = this.deps.premium.purchase(ch, s.accountId, String(req.productId));
        if (!r.ok) return reply(r);
        this.applyProduct(s, r.product.id);
        s.dirty = true; this.sendCharacter(s);
        return reply({ ok: true, data: { balance: r.balance } });
      }
      case 'shop_receipt': {
        if (!FLAGS.premiumCurrencyEnabled) return reply({ ok: false, error: 'disabled' });
        void (this.deps.receipts ?? rejectingValidator).validate(req.platform, String(req.receipt)).then((v) => {
          if (!v.ok || !v.cells || !v.transactionId) return reply({ ok: false, error: 'invalid_receipt' });
          const r = this.deps.premium.credit(ch, s.accountId, v.cells, 'iap', `${req.platform}:${v.transactionId}`);
          if (r.ok) { s.dirty = true; this.sendCharacter(s); }
          reply(r.ok ? { ok: true, data: { balance: r.balance, duplicate: !!r.duplicate } } : r);
        });
        return;
      }
    }
  }

  private applyProduct(s: Session, productId: string): void {
    const ch = s.character;
    if (productId === 'inv_slots_10') ch.inventoryExpansions++;
    else if (productId === 'gate_key_pack') ch.wallet.gateKeys += 3;
    else if (productId.startsWith('skin_')) ch.season.skins.push(productId);
  }

  private mapDistance(from: number, to: number): number | undefined {
    const adj = new Map<number, number[]>();
    for (const e of MAP_CONNECTIONS as any[]) { const a = e.from ?? e[0], b = e.to ?? e[1]; adj.set(a, [...(adj.get(a) ?? []), b]); adj.set(b, [...(adj.get(b) ?? []), a]); }
    const dist = new Map<number, number>([[from, 0]]);
    const q = [from];
    while (q.length) { const x = q.shift()!; for (const y of adj.get(x) ?? []) if (!dist.has(y)) { dist.set(y, dist.get(x)! + 1); q.push(y); } }
    return dist.get(to);
  }

  private tradeView(t: TradeSession, me: string): any {
    const other = t.a === me ? t.b : t.a;
    const nm = (id: string) => this.deps.accounts.get(id)?.name;
    const items = (id: string) => (t.offers[id].items.map((uid) => this.sessions.get(id)?.character.inventory.find((i) => i.uid === uid)).filter(Boolean));
    return { with: nm(other), mine: { ...t.offers[me], items: items(me) }, theirs: { ...t.offers[other], items: items(other) }, iConfirmed: t.confirmed.has(me), theyConfirmed: t.confirmed.has(other) };
  }

  private endTrade(t: TradeSession, why: string): void {
    this.trades.delete(t.a); this.trades.delete(t.b);
    for (const id of [t.a, t.b]) { const o = this.sessions.get(id); if (o) this.send(o, { type: 's_social_event', kind: 'trade_update', data: { ended: why } }); }
  }

  /** Both sides confirmed an unchanged offer: re-validate everything and swap atomically (all or nothing). */
  private executeTrade(t: TradeSession, sa: Session, sb: Session): C.Result {
    const oa = t.offers[t.a]; const ob = t.offers[t.b];
    const check = (from: Session, offer: { items: string[]; scrap: number }) => {
      if (from.character.wallet.scrap < offer.scrap) return 'not_enough_scrap';
      for (const uid of offer.items) { const it = C.findItem(from.character, uid); if (!it || it.bound || C.isEquipped(from.character, uid)) return 'item_invalid'; }
      return undefined;
    };
    if (!this.canTradeHere(sa, sb)) return { ok: false, error: 'too_far' };
    const e = check(sa, oa) ?? check(sb, ob);
    if (e) return { ok: false, error: e };
    if (INVENTORY_FREE(sa.character) + oa.items.length < ob.items.length || INVENTORY_FREE(sb.character) + ob.items.length < oa.items.length) return { ok: false, error: 'inventory_full' };
    const volume = oa.scrap + ob.scrap;
    if (this.deps.market.volumeToday(sa.accountId) + volume > DAILY_TRADE_VOLUME_CAP || this.deps.market.volumeToday(sb.accountId) + volume > DAILY_TRADE_VOLUME_CAP) return { ok: false, error: 'daily_trade_cap' };
    const move = (from: Session, to: Session, offer: { items: string[]; scrap: number }) => {
      const taken = from.character.inventory.filter((i) => offer.items.includes(i.uid));
      from.character.inventory = from.character.inventory.filter((i) => !offer.items.includes(i.uid));
      for (const it of taken) this.givePurchased(to, it);
      from.character.wallet.scrap -= offer.scrap; to.character.wallet.scrap += offer.scrap;
    };
    move(sa, sb, oa); move(sb, sa, ob);
    this.deps.market.addVolume(sa.accountId, volume); this.deps.market.addVolume(sb.accountId, volume);
    for (const s of [sa, sb]) { s.dirty = true; this.sendCharacter(s); this.save(s); }
    return { ok: true };
  }

  // ---------------------------------------------------------------- dungeons (gates)

  private freeKeysUsedToday(s: Session): number { return s.character.stats[`dungeon_free_${Q.dayKey(Math.floor(this.clock.nowMs() / 1000))}`] ?? 0; }

  private handleDungeon(s: Session, req: { op: string; dungeonId?: string }): { ok: boolean; error?: string; data?: any } {
    if (req.op === 'dungeon_list') {
      this.tutorialStep(s, 'gate'); // opening the gate list is the "first gate hint" step
      return { ok: true, data: { freeKeysLeft: Math.max(0, DUNGEON_FREE_KEYS_PER_DAY - this.freeKeysUsedToday(s)), gateKeys: s.character.wallet.gateKeys,
        dungeons: DUNGEONS.map((d) => ({ id: d.id, name: d.name, minLevel: d.minLevel, recommendedLevel: d.recommendedLevel, waves: d.waves.length, cleared: (s.character.stats[`cleared_${d.id}`] ?? 0) > 0 })) } };
    }
    if (req.op === 'dungeon_leave') {
      if (!s.instance.world.dungeon) return { ok: false, error: 'not_in_dungeon' };
      this.returnFromDungeon(s);
      return { ok: true };
    }
    const def = getDungeon(String(req.dungeonId));
    if (!def) return { ok: false, error: 'unknown_dungeon' };
    if (s.instance.world.dungeon || s.instance.arena) return { ok: false, error: 'busy' };
    const party = s.partyId ? this.parties.get(s.partyId) : undefined;
    if (party && party.leader !== s.accountId) return { ok: false, error: 'not_leader' };
    const candidates: Session[] = [s];
    if (party) for (const id of party.members) { const o = this.sessions.get(id); if (o && o !== s && o.instance === s.instance && this.inSafeZone(o)) candidates.push(o); }
    if (!this.inSafeZone(s)) return { ok: false, error: 'safe_zone_only' };
    const entering: Session[] = [];
    for (const m of candidates) {
      if (m.character.level < def.minLevel) { if (m === s) return { ok: false, error: 'level_too_low' }; continue; }
      if (this.freeKeysUsedToday(m) < DUNGEON_FREE_KEYS_PER_DAY) m.character.stats[`dungeon_free_${Q.dayKey(Math.floor(this.clock.nowMs() / 1000))}`] = this.freeKeysUsedToday(m) + 1;
      else if (m.character.wallet.gateKeys > 0) m.character.wallet.gateKeys--;
      else { if (m === s) return { ok: false, error: 'no_keys' }; continue; }
      entering.push(m);
    }
    for (const m of entering) this.deps.telemetry.log('gate_entered', m.accountId);
    const map = getMapById(def.unlockMapId) as MapDef;
    const world = createDungeonWorld(def, entering.length, 5000 + ++this.dungeonCounter);
    const inst: Instance = { id: `d${this.dungeonCounter}`, mapId: def.unlockMapId, map, world, sessions: new Set(), chatSent: 0 };
    this.dungeonInstances.add(inst);
    entering.forEach((m, i) => {
      m.returnMap = m.instance.mapId;
      this.leave(m);
      const p = dungeonEntryPoint();
      this.enterInstance(m, inst, { x: p.x + (i - entering.length / 2) * 70, y: p.y });
      this.send(m, { type: 's_social_event', kind: 'dungeon', data: { started: def.id, party: entering.length } });
    });
    return { ok: true, data: { entered: entering.map((m) => m.name) } };
  }

  private returnFromDungeon(s: Session): void {
    const back = s.returnMap ?? C.HOME_MAP_BY_FACTION[s.character.faction];
    s.returnMap = undefined;
    this.leave(s);
    this.enter(s, back);
    const e = s.instance.world.entities.get(s.entityId);
    if (e) e.invulnerableTime = 5;
    this.save(s);
  }

  private finishDungeon(inst: Instance, cleared: boolean): void {
    const st = inst.world.dungeon!;
    const def = st.def;
    const players = [...inst.sessions];
    const boss = st.bossId !== undefined ? inst.world.entities.get(st.bossId) : undefined;
    for (const s of players) {
      const ch = s.character;
      if (cleared) {
        const first = (ch.stats[`cleared_${def.id}`] ?? 0) === 0;
        const r = def.rewards;
        const scrap = r.scrap + (first ? def.firstClearBonus.scrap : 0);
        ch.wallet.scrap += scrap; bump(ch, 'scrap_earned', scrap);
        ch.wallet.ore[r.oreType] += r.oreAmount;
        if (first) ch.wallet.gateKeys += def.firstClearBonus.keys;
        C.grantXP(ch, r.xp + (first ? def.firstClearBonus.xp : 0));
        for (let i = 0; i < r.rareDrops; i++) { const loot = rollLoot(s.rng, def.recommendedLevel, 1, true, true, ch.pityCounter); if (loot.itemId && loot.rarity) C.createItem(ch, loot.itemId, loot.rarity, s.rng); }
        ch.stats[`cleared_${def.id}`] = (ch.stats[`cleared_${def.id}`] ?? 0) + 1;
        bump(ch, 'gates_cleared');
        Q.onQuestEvent(ch, { type: 'clear_gate', dungeonId: def.id });
        const e = inst.world.entities.get(s.entityId); if (e) refreshPlayerStats(e, ch);
      }
      this.send(s, { type: 's_social_event', kind: 'dungeon', data: { result: cleared ? 'cleared' : 'failed', dungeon: def.id, first: cleared && (ch.stats[`cleared_${def.id}`] ?? 0) === 1, bossDamage: boss?.damageBy?.[s.entityId] ?? 0 } });
      s.dirty = true;
      this.returnFromDungeon(s);
    }
    this.dungeonInstances.delete(inst);
  }

  // ---------------------------------------------------------------- arena

  private arenaQueueJoin(s: Session, mode: AR.ArenaMode): C.Result {
    if (!(mode in AR.ARENA_MODES)) return { ok: false, error: 'bad_mode' };
    if (s.instance.arena) return { ok: false, error: 'in_match' };
    if (s.spectating) return { ok: false, error: 'busy' };
    if (this.arenaQueue.some((e) => e.id === s.accountId)) return { ok: false, error: 'already_queued' };
    if ((this.arenaBans.get(s.accountId) ?? 0) > this.clock.nowMs()) return { ok: false, error: 'arena_ban' };
    if (!this.inSafeZone(s)) return { ok: false, error: 'safe_zone_only' };
    const stats = C.computeLoadoutStats(s.character);
    if (!stats) return { ok: false, error: 'no_vehicle' };
    const power = AR.arenaPower(stats.dps, stats.maxHull, stats.maxArmor, stats.flatReduction);
    s.character.stats['best_arena_power'] = Math.max(s.character.stats['best_arena_power'] ?? 0, power);
    this.arenaQueue.push({ id: s.accountId, mode, power, rating: this.deps.arena.get(s.accountId, mode).rating, queuedAt: this.clock.nowMs() / 1000 });
    return { ok: true };
  }

  private runMatchmaking(): void {
    if (this.arenaQueue.length < 2) return;
    // drop players who left
    this.arenaQueue = this.arenaQueue.filter((e) => this.sessions.has(e.id) && !this.sessions.get(e.id)!.instance.arena);
    const found = AR.findMatches(this.arenaQueue, this.clock.nowMs() / 1000);
    for (const m of found) {
      const ids = new Set([...m.teamA, ...m.teamB].map((e) => e.id));
      this.arenaQueue = this.arenaQueue.filter((e) => !ids.has(e.id));
      this.startArenaMatch(m);
    }
  }

  private arenaSpawn(team: number, idx: number, total: number): { x: number; y: number } {
    const map = getMapById(30) as MapDef;
    const cx = map.width / 2;
    const y = map.height / 2 + (idx - (total - 1) / 2) * 90;
    return { x: team === 0 ? cx - 450 : cx + 450, y };
  }

  private startArenaMatch(m: AR.FoundMatch): void {
    const map = getMapById(30) as MapDef;
    const world = createWorld({ map, seed: 30 * 104729 + ++this.arenaSeq, populate: false, safeZones: [], pvp: { pvpEnabled: true, arena: true } });
    const inst: Instance = { id: `a${this.arenaSeq}`, mapId: 30, map, world, sessions: new Set(), chatSent: world.chat.length };
    const teams: [Session[], Session[]] = [[], []];
    const ratings = new Map<string, number>();
    const returnTo = new Map<string, { mapId: number }>();
    [m.teamA, m.teamB].forEach((team, ti) => team.forEach((q) => { const s = this.sessions.get(q.id); if (s) { teams[ti].push(s); ratings.set(q.id, q.rating); } }));
    if (teams[0].length === 0 || teams[1].length === 0) { for (const t of teams) for (const s of t) this.send(s, { type: 's_social_event', kind: 'arena_result', data: { cancelled: true } }); return; }
    const powers = teams.flat().map((s) => { const st = C.computeLoadoutStats(s.character); return st ? AR.arenaPower(st.dps, st.maxHull, st.maxArmor, st.flatReduction) : 1; });
    const league = AR.leagueForPower(powers.reduce((a, b) => a + b, 0) / Math.max(1, powers.length));
    inst.arena = { state: AR.newMatch(m.mode, 0), teams, forfeits: new Set(), mode: m.mode, ratings, returnTo, league, rec: new MatchRecorder(), spectators: new Set() };
    this.arenaInstances.add(inst);
    teams.forEach((t, ti) => t.forEach((s, i) => {
      returnTo.set(s.accountId, { mapId: s.instance.mapId });
      this.leave(s);
      s.arenaFree = true;
      this.enterInstance(s, inst, this.arenaSpawn(ti, i, t.length));
      const e = world.entities.get(s.entityId)!;
      e.team = ti; e.invulnerableTime = AR.COUNTDOWN_SECONDS + 1;
      this.send(s, { type: 's_social_event', kind: 'arena_start', data: { mode: m.mode, team: ti, opponents: teams[1 - ti].map((o) => o.name) } });
    }));
  }

  // ---------------------------------------------------------------- arena spectating (see server/spectate.ts)

  private arenaHud(inst: Instance): SpectateHud {
    const a = inst.arena!;
    const secondsLeft = a.state.phase === 'fighting' ? Math.max(0, AR.ROUND_TIME_LIMIT_SECONDS - (inst.world.time - a.state.roundStartedAt)) : Math.max(0, a.state.phaseEndsAt - inst.world.time);
    return { phase: a.state.phase, round: a.state.round, wins: [...a.state.wins], secondsLeft: Math.round(secondsLeft) };
  }

  /** Records the public view of the match for delayed viewers and sends spectators the frame that is SPECTATE_DELAY_TICKS old. */
  private recordSpectateFrame(inst: Instance, sharedView: (e: SimEntity) => SimEntity, all: SimEntity[]): void {
    const a = inst.arena!;
    const world = inst.world;
    a.rec.record(world.tick, world.time, all.map(sharedView), this.arenaHud(inst));
    for (const sp of a.spectators) {
      const st = sp.spectating!;
      const frame = a.rec.delayed(world.tick, SPECTATE_DELAY_TICKS);
      if (!frame || frame.tick === st.lastFrameTick) continue;
      st.lastFrameTick = frame.tick;
      const { patches, removed } = sp.encoder.encode(frame.views);
      this.sendText(sp.ws, `{"type":"s_state","tick":${frame.tick},"lastProcessedSeq":0,"serverTime":${frame.time},"patches":${JSON.stringify(patches)},"removed":${JSON.stringify(removed)},"events":${JSON.stringify(frame.events)}}`);
      const hudKey = JSON.stringify(frame.hud.wins) + frame.hud.phase + frame.hud.round;
      if (hudKey !== st.lastHud) {
        st.lastHud = hudKey;
        this.send(sp, { type: 's_social_event', kind: 'arena_phase', data: { phase: frame.hud.phase, round: frame.hud.round, wins: frame.hud.wins, secondsLeft: frame.hud.secondsLeft } });
      }
    }
  }

  private spectateList(): SpectateMatchInfo[] {
    return [...this.arenaInstances].filter((i) => i.arena && i.arena.state.phase !== 'finished').map((i) => {
      const a = i.arena!;
      return {
        id: i.id, mode: a.mode, league: a.league, round: a.state.round, wins: [...a.state.wins], phase: a.state.phase,
        teams: a.teams.map((t) => t.filter((s) => !a.forfeits.has(s.accountId)).map((s) => ({ name: s.name, entityId: s.entityId }))),
        spectators: a.spectators.size, capacity: this.spectatorCap,
      };
    });
  }

  private spectateJoin(s: Session, matchId: unknown): C.Result<any> {
    if (typeof matchId !== 'string') return { ok: false, error: 'match_not_found' };
    if (s.spectating) return { ok: false, error: 'already_spectating' };
    if (s.instance.arena || s.instance.world.dungeon) return { ok: false, error: 'busy' };
    if (this.arenaQueue.some((e) => e.id === s.accountId)) return { ok: false, error: 'already_queued' };
    const inst = [...this.arenaInstances].find((i) => i.id === matchId && i.arena && i.arena.state.phase !== 'finished');
    if (!inst) return { ok: false, error: 'match_not_found' };
    const a = inst.arena!;
    if (a.spectators.size >= this.spectatorCap) return { ok: false, error: 'spectators_full' };
    s.spectating = { inst, lastFrameTick: -1, lastHud: '' };
    a.spectators.add(s);
    s.encoder.reset();
    s.pending = [];
    // entity id 0 = "no vehicle of mine": the client follows an arena entity or free-roams
    this.send(s, { type: 's_map', mapId: inst.mapId, instanceId: inst.id, assignedEntityId: 0, spectate: true });
    return { ok: true, data: { delaySeconds: SPECTATE_DELAY_TICKS / TICK_HZ, matchId: inst.id } };
  }

  /** Leaves the spectator view. `restore`: send the hub map again so the client gets its own vehicle back. */
  private stopSpectating(s: Session, restore: boolean): void {
    const sp = s.spectating;
    if (!sp) return;
    s.spectating = undefined;
    sp.inst.arena?.spectators.delete(s);
    s.encoder.reset();
    if (restore && this.sessions.get(s.accountId) === s) {
      this.send(s, { type: 's_map', mapId: s.instance.mapId, instanceId: s.instance.id, assignedEntityId: s.entityId });
      this.sendCharacter(s);
    }
  }

  private resetArenaRound(inst: Instance): void {
    const a = inst.arena!;
    a.teams.forEach((t, ti) => t.forEach((s, i) => {
      const e = inst.world.entities.get(s.entityId);
      if (!e) return;
      const p = this.arenaSpawn(ti, i, t.length);
      e.pos = { ...p }; e.vel = { x: 0, y: 0 }; e.hull = e.maxHull; e.armor = e.maxArmor; e.isWreck = false; e.wreckTimer = undefined; e.targetId = undefined; e.statusEffects = [];
      e.invulnerableTime = 3.5; e.mainReloadRemaining = 0;
    }));
    for (const x of [...inst.world.entities.values()]) if (x.kind === 'projectile' || x.kind === 'telegraph') inst.world.entities.delete(x.id);
  }

  private stepArena(inst: Instance): void {
    const a = inst.arena!;
    const alive = (team: Session[]) => team.filter((s) => !a.forfeits.has(s.accountId) && (inst.world.entities.get(s.entityId)?.hull ?? 0) > 0).length;
    const res = AR.advanceMatch(a.state, inst.world.time, [alive(a.teams[0]), alive(a.teams[1])]);
    if (res === 'round_started') for (const s of a.teams.flat()) { const e = inst.world.entities.get(s.entityId); if (e) e.invulnerableTime = 0; }
    if (a.state.phase === 'countdown' && a.state.phaseEndsAt - inst.world.time > 2.9 && a.state.round > 1 && !a.state.resetDone) { a.state.resetDone = true; this.resetArenaRound(inst); }
    if (a.state.phase === 'fighting') a.state.resetDone = false;
    if (a.state.phase !== a.lastPhase) {
      a.lastPhase = a.state.phase;
      const secondsLeft = a.state.phase === 'fighting' ? Math.max(0, AR.ROUND_TIME_LIMIT_SECONDS - (inst.world.time - a.state.roundStartedAt)) : Math.max(0, a.state.phaseEndsAt - inst.world.time);
      for (const s of inst.sessions) this.send(s, { type: 's_social_event', kind: 'arena_phase', data: { phase: a.state.phase, round: a.state.round, wins: a.state.wins, secondsLeft } });
    }
    if (res === 'round_over' || res === 'match_over') {
      for (const s of inst.sessions) this.send(s, { type: 's_social_event', kind: 'arena_round', data: { wins: a.state.wins, round: a.state.round } });
    }
    if (res === 'match_over') this.finishArena(inst);
  }

  private finishArena(inst: Instance): void {
    const a = inst.arena!;
    const winner = a.state.winner!;
    const avg = (team: Session[]) => team.reduce((sum, s) => sum + (a.ratings.get(s.accountId) ?? 1000), 0) / Math.max(1, team.length);
    const d = AR.eloDelta(avg(a.teams[0]), avg(a.teams[1]), winner === 0 ? 1 : 0);
    const season = 1;
    a.teams.forEach((team, ti) => team.forEach((s) => {
      const won = ti === winner && !a.forfeits.has(s.accountId);
      const delta = a.forfeits.has(s.accountId) ? -Math.abs(ti === 0 ? d.a : d.b) - 8 : ti === 0 ? d.a : d.b;
      const rating = this.deps.arena.record(s.accountId, a.mode, delta, won, season);
      s.character.wallet.seasonMarks += won ? 5 : 1;
      s.character.wallet.scrap += won ? 400 : 100;
      if (won) { Q.onQuestEvent(s.character, { type: 'win_arena' }); bump(s.character, 'arena_wins'); }
      s.dirty = true;
      this.send(s, { type: 's_social_event', kind: 'arena_result', data: { won, ratingDelta: delta, rating, wins: a.state.wins } });
    }));
    // return everyone to the hub after a short moment; here immediately with spawn protection
    const hub = 13;
    for (const s of a.teams.flat()) {
      if (a.forfeits.has(s.accountId) || !this.sessions.has(s.accountId)) continue;
      this.leave(s);
      s.arenaFree = false;
      this.enter(s, hub);
      const e = s.instance.world.entities.get(s.entityId);
      if (e) e.invulnerableTime = 5;
      this.save(s);
    }
    for (const sp of [...a.spectators]) this.stopSpectating(sp, true);
    this.arenaInstances.delete(inst);
  }

  /**
   * Once a minute: daily/weekly quest rotation for everyone online, season rollover (inside the quest rules), the weekly
   * faction-war result announcement, and structured log lines. Event windows and world bosses run inside the instances.
   */
  runScheduler(): void {
    const nowSec = Math.floor(this.clock.nowMs() / 1000);
    const day = Q.dayKey(nowSec); const week = Q.weekKey(nowSec);
    for (const s of this.sessions.values()) {
      const r = Q.refreshQuests(s.character, nowSec);
      if (r.dailyChanged || r.weeklyChanged) { s.dirty = true; this.sendCharacter(s); }
    }
    if (this.lastWeek && week !== this.lastWeek) {
      const winner = weeklyWinner(this.deps.war.scores(this.lastWeek));
      const text = winner ? `Faction war result: ${winner} won last week and gets the banner and a 2% market discount.` : 'Faction war: last week ended without a winner.';
      this.announce(text);
      for (const s of this.sessions.values()) this.send(s, { type: 's_social_event', kind: 'war_result', data: { winner } });
    }
    if (this.lastDay && day !== this.lastDay) { try { this.deps.telemetry.prune(180); this.deps.onDaily?.(); } catch (e) { log('error', 'daily_hook_failed', { error: String(e) }); } }
    this.lastDay = day; this.lastWeek = week;
    log('info', 'scheduler', { day, week, players: this.sessions.size, instances: this.instanceInfo().length });
  }

  /** Expired listings go back to the seller by mail. */
  sweepAuctions(): void {
    for (const e of this.deps.market.sweepExpired()) this.mailTo(e.seller, 'item', e.item, 'Listing expired: item returned');
  }

  // ---------------------------------------------------------------- faction war

  /** Everything the war screen shows: this week's scores and time left, the last result with the reward state of this player, control points on the current map. */
  private warStatus(s: Session) {
    const nowSec = Math.floor(this.clock.nowMs() / 1000);
    const week = Q.weekKey(nowSec);
    const lastWeek = `w${Number(week.slice(1)) - 1}`;
    const winner = weeklyWinner(this.deps.war.scores(lastWeek));
    const mine = this.deps.war.contribution(lastWeek, s.accountId);
    const claimed = this.deps.war.hasClaimed(lastWeek, s.accountId);
    const w = s.instance.world;
    return {
      week, scores: this.deps.war.scores(week), weekEndsInSeconds: Q.weekEndsAt(nowSec) - nowSec, lastWeekWinner: winner,
      last: { week: lastWeek, scores: this.deps.war.scores(lastWeek), winner, mySeconds: mine, neededSeconds: WAR_CLAIM_MIN_SECONDS, claimed, canClaim: !!winner && winner === s.character.faction && mine >= WAR_CLAIM_MIN_SECONDS && !claimed },
      reward: { ...WAR_REWARD, marketDiscount: WAR_WINNER_MARKET_DISCOUNT },
      myFaction: s.character.faction,
      points: (w.war ?? []).map((p) => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y), radius: p.radius, owner: p.owner ?? null, progress: { coastal: Math.round(p.progress.coastal), highland: Math.round(p.progress.highland), steppe: Math.round(p.progress.steppe) }, contested: p.contested })),
      rules: { minLevel: PVP_MIN_LEVEL, levelWindow: PVP_LEVEL_WINDOW, killCap: KILL_CAP_COUNT, killCapWindowMin: KILL_CAP_WINDOW_SECONDS / 60, immunityMin: KILL_CAP_IMMUNITY_SECONDS / 60, honorRepeatMin: HONOR_REPEAT_SECONDS / 60, damagePercent: Math.round(PVP_DAMAGE_MULT * 100), captureSeconds: CAPTURE_SECONDS },
    };
  }

  /** One reward per player and week for the winning faction's contributors; the database key decides if two requests race. */
  private warClaim(s: Session): { ok: boolean; error?: string; data?: any } {
    const nowSec = Math.floor(this.clock.nowMs() / 1000);
    const lastWeek = `w${Number(Q.weekKey(nowSec).slice(1)) - 1}`;
    const winner = weeklyWinner(this.deps.war.scores(lastWeek));
    if (!winner) return { ok: false, error: 'no_winner' };
    if (winner !== s.character.faction) return { ok: false, error: 'not_winner' };
    if (this.deps.war.contribution(lastWeek, s.accountId) < WAR_CLAIM_MIN_SECONDS) return { ok: false, error: 'not_enough_contribution' };
    if (!this.deps.war.claim(lastWeek, s.accountId, nowSec)) return { ok: false, error: 'already_claimed' };
    const ch = s.character;
    ch.wallet.scrap += WAR_REWARD.scrap;
    ch.wallet.seasonMarks += WAR_REWARD.seasonMarks;
    if (!ch.season.titles.includes(WAR_REWARD.title)) ch.season.titles.push(WAR_REWARD.title);
    s.dirty = true; this.save(s); this.sendCharacter(s);
    return { ok: true, data: { scrap: WAR_REWARD.scrap, seasonMarks: WAR_REWARD.seasonMarks, title: WAR_REWARD.title } };
  }

  /** Once a second: players fighting for a control point of their own faction collect war contribution seconds. */
  private accrueWar(): void {
    for (const list of this.instances.values()) for (const inst of list) {
      const points = inst.world.war;
      if (!points?.length) continue;
      for (const s of inst.sessions) {
        const e = inst.world.entities.get(s.entityId);
        if (!e || e.hull <= 0 || !e.faction) continue;
        if (points.some((p) => contributesTo(p, e.pos, e.faction!))) s.warSeconds = (s.warSeconds ?? 0) + 1;
      }
    }
  }

  private lastWeekWinner(): string | undefined {
    const wk = Number(Q.weekKey(Math.floor(this.clock.nowMs() / 1000)).slice(1));
    return weeklyWinner(this.deps.war.scores(`w${wk - 1}`));
  }

  /** Move accumulated control-point score of every instance into the weekly totals (called every 30 s). */
  private flushWarScores(): void {
    const week = Q.weekKey(Math.floor(this.clock.nowMs() / 1000));
    for (const s of this.sessions.values()) if (s.warSeconds) { this.deps.war.addContribution(week, s.accountId, s.warSeconds); s.warSeconds = 0; }
    for (const list of this.instances.values()) for (const inst of list) {
      for (const [f, v] of Object.entries(inst.world.warScore)) { if (v >= 1) { this.deps.war.add(week, f, Math.floor(v)); inst.world.warScore[f] = v - Math.floor(v); } }
    }
  }

  // ---------------------------------------------------------------- snapshots + persistence

  private sendSnapshots(inst: Instance): void {
    const world = inst.world;
    // Compact "others" views are computed once per entity and shared by every client in this instance.
    const shared = new Map<number, SimEntity>();
    const sharedView = (e: SimEntity): SimEntity => {
      let v = shared.get(e.id);
      if (!v) { v = compactEntity(viewFor(e, false), true); shared.set(e.id, v); }
      return v;
    };
    const r2 = INTEREST_RADIUS * INTEREST_RADIUS;
    const all = Array.from(world.entities.values());
    if (inst.arena) this.recordSpectateFrame(inst, sharedView, all);
    for (const s of inst.sessions) {
      if (s.spectating) { s.pendingEvents = []; continue; } // watching a match: gets the delayed arena stream instead
      const me = world.entities.get(s.entityId);
      if (!me) continue;
      const visible: SimEntity[] = [];
      for (const e of all) {
        if (e.id === me.id) visible.push(compactEntity(me));
        else {
          const d2 = (e.pos.x - me.pos.x) ** 2 + (e.pos.y - me.pos.y) ** 2;
          if (e.kind === 'boss' || e.kind === 'gate' || d2 <= r2) {
            const known = s.encoder.peek(e.id);
            // far entities: refresh every other snapshot, otherwise re-send nothing (keep what the client has)
            if (known && d2 > NEAR_RADIUS * NEAR_RADIUS && e.kind !== 'projectile' && e.kind !== 'telegraph' && ((world.tick / SNAPSHOT_EVERY_TICKS) + e.id) % 2 !== 0) visible.push(known);
            else visible.push(sharedView(e));
          }
        }
      }
      const { patches, removed } = s.encoder.encode(visible);
      const events = s.pendingEvents.filter((ev: any) => !ev.pos || (ev.pos.x - me.pos.x) ** 2 + (ev.pos.y - me.pos.y) ** 2 <= r2 * 1.4);
      s.pendingEvents = [];
      // Patch objects are shared between clients, so each one is serialised once per tick, not once per client.
      let body = '';
      for (let i = 0; i < patches.length; i++) {
        const pt = patches[i];
        let js = (pt as any)[PATCH_JSON] as string | undefined;
        if (js === undefined) { js = JSON.stringify(pt); (pt as any)[PATCH_JSON] = js; }
        body += i ? ',' + js : js;
      }
      this.sendText(s.ws, `{"type":"s_state","tick":${world.tick},"lastProcessedSeq":${s.lastSeq},"serverTime":${world.time},"patches":[${body}],"removed":${JSON.stringify(removed)},"events":${JSON.stringify(events)}}`);
    }
  }

  /** Explorer quests/achievements: standing within 120 units of a map secret discovers it once. */
  private checkSecrets(): void {
    for (const s of this.sessions.values()) {
      if (s.instance.arena || s.instance.world.dungeon) continue;
      const e = s.instance.world.entities.get(s.entityId);
      if (!e || e.hull <= 0) continue;
      for (const sec of s.instance.map.secrets ?? []) {
        const key = `${s.instance.mapId}:${sec.id}`;
        if ((e.pos.x - sec.x) ** 2 + (e.pos.y - sec.y) ** 2 > 120 ** 2) continue;
        const seen = (s.character.codex.secret ??= []);
        if (seen.includes(key)) continue;
        seen.push(key);
        bump(s.character, 'landmarks');
        Q.onQuestEvent(s.character, { type: 'explore', mapId: s.instance.mapId, spotId: sec.id });
        s.dirty = true;
        this.sendCharacter(s);
      }
    }
  }

  /** Evaluates achievements after progress; new ones are reported to the client. */
  private progress(s: Session): void {
    const done = checkAchievements(s.character);
    if (done.length) for (const id of done) this.send(s, { type: 's_social_event', kind: 'achievement', data: { id } });
  }

  private sendCharacter(s: Session): void {
    this.progress(s);
    const ent = s.instance.world.entities.get(s.entityId);
    const ammo: Record<string, number> = { ...s.ammo, STANDARD: -1 };
    if (ent) for (const k of Object.keys(ent.ammoInventory)) ammo[k] = ent.ammoInventory[k as AmmoType];
    this.send(s, { type: 's_character', character: s.character, ammo: ammo as any });
  }

  /** Autosave is spread over ticks (a few sessions per tick) so 200 players never write in one 33 ms frame. */
  private autosaveSome(): void {
    const now = this.clock.nowMs();
    let budget = AUTOSAVE_PER_TICK;
    for (const s of this.sessions.values()) {
      if (!s.dirty || now - s.lastSave < AUTOSAVE_SECONDS * 1000) continue;
      this.save(s);
      if (--budget <= 0) break;
    }
  }

  save(s: Session): void {
    if (!this.deps.accounts.get(s.accountId)) return; // account was deleted (admin/GDPR): nothing to persist
    const ent = s.instance?.world.entities.get(s.entityId);
    if (ent) for (const k of Object.keys(s.ammo)) if (k !== 'STANDARD') s.ammo[k] = ent.ammoInventory[k as AmmoType] ?? s.ammo[k];
    this.deps.profiles.save({ accountId: s.accountId, character: s.character, ammo: s.ammo, mapId: s.instance?.mapId ?? 1, updatedAt: this.clock.nowMs() });
    s.dirty = false;
    s.lastSave = this.clock.nowMs();
    this.telemetryScan(s);
  }

  /** Milestones are derived from the saved character, so one cheap pass per save covers levels, tutorial steps, first kill and first craft. */
  private telemetryScan(s: Session): void {
    const seen = s.teleSeen ??= new Set<string>();
    const once = (kind: Parameters<TelemetryRepo['log']>[0], detail = '') => { const k = `${kind}:${detail}`; if (seen.has(k)) return; seen.add(k); this.deps.telemetry.log(kind, s.accountId, detail); };
    const ch = s.character;
    for (const lv of LEVEL_MILESTONES) if (ch.level >= lv) once('level', String(lv));
    for (const step of TUTORIAL_STEPS) if (ch.stats[Q.tutorialFlag(step)] === 1) once('tutorial_step', step);
    if ((ch.stats['kills'] ?? 0) > 0) once('first_kill');
    if ((ch.stats['crafted'] ?? 0) > 0) once('first_craft');
    if ((ch.stats['gates_cleared'] ?? 0) > 0) once('gate_cleared');
  }

  private send(s: Session, msg: ServerMessage): void {
    // the last 20 error codes travel with a bug report (codes only, never texts)
    const code = msg.type === 's_error' ? msg.code : (msg.type === 's_action_result' || msg.type === 's_social_result') && !msg.ok ? msg.error : undefined;
    if (code) { const list = s.errors ??= []; list.push(String(code)); if (list.length > 20) list.shift(); }
    this.sendRaw(s.ws, msg);
  }

  private sendRaw(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    this.sendText(ws, JSON.stringify(msg));
  }

  private sendText(ws: WebSocket, data: string): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    this.metrics.bytesOut += data.length;
    ws.send(data);
  }
}
