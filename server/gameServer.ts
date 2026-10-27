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
import * as C from '../shared/rules/character.ts';
import { AMMO_PRICES, executeAction } from '../shared/rules/actions.ts';
import { calculateKillXP } from '../shared/rules/progression.ts';
import * as Q from '../shared/rules/quests.ts';
import { refreshPlayerStats, spawnPlayerFromCharacter } from '../shared/sim/playerEntity.ts';
import { createWorld, stepWorld, World } from '../shared/sim/world.ts';
import { AmmoType, MapDef, SimCommand, SimEntity, SimEvent, SIM_TIMESTEP } from '../shared/types.ts';
import { AccountService } from './accounts.ts';
import { AccountRepo, ChatRepo, ProfileRepo } from './db.ts';
import { CLAN_CREATE_COST, SocialRepo } from './social.ts';
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
export const CHAT_MIN_INTERVAL_MS = 1000;
export const CHAT_BURST = { count: 5, windowMs: 10_000 };

export interface Clock { nowMs(): number }
const realClock: Clock = { nowMs: () => Date.now() };

interface Instance {
  id: string;
  mapId: number;
  map: MapDef;
  world: World;
  sessions: Set<Session>;
}

interface Session {
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
  partyId?: number;
  clanId?: number;
  clanTag?: string;
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
  social: SocialRepo;
}

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
  readonly metrics = { ticks: 0, maxTickMs: 0, avgTickMs: 0, bytesOut: 0, msgsIn: 0 };
  private instanceCounter = 0;
  private parties = new Map<number, Party>();
  private partyCounter = 0;
  private partyInvites = new Map<string, { from: string; party: number; exp: number }>();

  constructor(private deps: ServerDeps, httpServer?: http.Server) {
    this.clock = deps.clock ?? realClock;
    this.http = httpServer ?? http.createServer();
    this.wss = new WebSocketServer({ server: this.http, path: '/ws', maxPayload: 64 * 1024 });
    this.wss.on('connection', (ws) => this.onConnection(ws));
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
    this.tick++;
    for (const list of this.instances.values()) {
      for (const inst of list) {
        if (inst.sessions.size === 0) continue;
        const cmds = new Map<number, SimCommand[]>();
        for (const s of inst.sessions) {
          if (s.pending.length) { cmds.set(s.entityId, s.pending); s.pending = []; }
          s.cmdBudget = Math.min(MAX_COMMANDS_PER_SECOND, s.cmdBudget + MAX_COMMANDS_PER_SECOND / TICK_HZ);
        }
        stepWorld(inst.world, cmds);
        this.processEvents(inst);
        this.handleRespawns(inst);
        if (this.tick % SNAPSHOT_EVERY_TICKS === 0) this.sendSnapshots(inst);
      }
    }
    if (this.tick % (TICK_HZ * AUTOSAVE_SECONDS) === 0) for (const s of this.sessions.values()) if (s.dirty) this.save(s);
    const ms = performance.now() - t0;
    this.metrics.ticks++;
    this.metrics.maxTickMs = Math.max(this.metrics.maxTickMs, ms);
    this.metrics.avgTickMs += (ms - this.metrics.avgTickMs) / Math.min(this.metrics.ticks, 300);
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
    const inst: Instance = { id: `i${mapId}-${list.length + 1}`, mapId, map, world, sessions: new Set() };
    list.push(inst);
    void preferInstanceOf;
    return inst;
  }

  instanceInfo(): Array<{ id: string; mapId: number; players: number; entities: number }> {
    return [...this.instances.values()].flat().map((i) => ({ id: i.id, mapId: i.mapId, players: i.sessions.size, entities: i.world.entities.size }));
  }

  playerCount(): number { return this.sessions.size; }

  onlineNames(): Array<{ id: string; name: string; level: number; mapId: number; suspicious: number }> {
    return [...this.sessions.values()].map((s) => ({ id: s.accountId, name: s.name, level: s.character.level, mapId: s.instance.mapId, suspicious: s.suspicious }));
  }

  /** Admin: disconnect a player (saves first). */
  kick(accountId: string, reason = 'kicked'): boolean {
    const s = this.sessions.get(accountId);
    if (!s) return false;
    this.send(s, { type: 's_error', code: reason, message: 'You were removed from the game', critical: true });
    s.ws.close(4403, reason);
    return true;
  }

  announce(text: string): void {
    this.deps.social.addAnnouncement(text);
    for (const s of this.sessions.values()) this.send(s, { type: 's_social_event', kind: 'announcement', data: { ts: this.clock.nowMs(), text } });
  }

  /** Test hook. */
  getSessionState(accountId: string): { character: C.CharacterState; entity: SimEntity; instanceId: string; mapId: number } | undefined {
    const s = this.sessions.get(accountId);
    if (!s) return undefined;
    return { character: s.character, entity: s.instance.world.entities.get(s.entityId)!, instanceId: s.instance.id, mapId: s.instance.mapId };
  }

  getWorld(accountId: string): World | undefined { return this.sessions.get(accountId)?.instance.world; }

  private spawnPos(inst: Instance): { x: number; y: number } {
    const z = inst.map.safeZones[0];
    return z ? { x: z.x, y: z.y } : { x: inst.map.width / 2, y: inst.map.height / 2 };
  }

  private enter(s: Session, mapId: number, at?: { x: number; y: number }): void {
    const inst = this.getInstanceFor(mapId, s);
    const pos = at ?? this.spawnPos(inst);
    const ent = spawnPlayerFromCharacter(inst.world, s.character, pos, s.ammo);
    s.instance = inst;
    s.entityId = ent.id;
    s.encoder.reset();
    s.pending = [];
    inst.sessions.add(s);
    this.send(s, { type: 's_map', mapId, instanceId: inst.id, assignedEntityId: ent.id });
    this.sendCharacter(s);
  }

  private leave(s: Session): void {
    const ent = s.instance.world.entities.get(s.entityId);
    if (ent) { for (const k of Object.keys(s.ammo)) if (k !== 'STANDARD') s.ammo[k] = ent.ammoInventory[k as AmmoType] ?? s.ammo[k]; }
    s.instance.world.entities.delete(s.entityId);
    s.instance.sessions.delete(s);
  }

  // ---------------------------------------------------------------- connection handling

  private onConnection(ws: WebSocket): void {
    let session: Session | undefined;
    const joinTimeout = setTimeout(() => { if (!session) ws.close(4408, 'join_timeout'); }, 10_000);
    ws.on('message', (data) => {
      this.metrics.msgsIn++;
      let msg: ClientMessage;
      try { msg = JSON.parse(data.toString()); } catch { return this.sendRaw(ws, { type: 's_error', code: 'bad_json', message: 'Invalid message' }); }
      if (!session) {
        if (msg.type !== 'c_join') return this.sendRaw(ws, { type: 's_error', code: 'join_first', message: 'Send c_join first' });
        session = this.handleJoin(ws, msg) ?? undefined;
        return;
      }
      this.handleMessage(session, msg);
    });
    ws.on('close', () => {
      clearTimeout(joinTimeout);
      if (session && this.sessions.get(session.accountId) === session) {
        this.leaveParty(session);
        this.leave(session);
        this.save(session);
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

  private handleJoin(ws: WebSocket, msg: Extract<ClientMessage, { type: 'c_join' }>): Session | null {
    if (!this.versionOk(msg.protocolVersion || '0.0.0')) {
      this.sendRaw(ws, { type: 's_error', code: 'update_required', message: `Please update the game (need protocol ${MIN_PROTOCOL_VERSION})`, critical: true });
      ws.close(4426, 'update_required');
      return null;
    }
    const auth = this.deps.service.verify(msg.accountId, msg.secret);
    if (!auth.ok) {
      this.sendRaw(ws, { type: 's_error', code: auth.error, message: auth.error === 'banned' ? 'This account is banned' : 'Unknown account', critical: true });
      ws.close(auth.error === 'banned' ? 4403 : 4404, auth.error);
      return null;
    }
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
    const character = row?.character ?? createStarterCharacterForServer(auth.account.name);
    character.name = auth.account.name;
    const mapId = row?.mapId ?? 1;
    C.talentPointsAvailable(character);
    const s: Session = {
      ws, accountId: auth.account.id, name: auth.account.name, character, ammo: { ...DEFAULT_AMMO, ...(row?.ammo ?? {}) },
      instance: undefined as any, entityId: 0, encoder: new DeltaEncoder(), pending: [], lastSeq: 0,
      cmdBudget: MAX_COMMANDS_PER_SECOND, cmdBudgetRefill: 0, dirty: true, lastSave: this.clock.nowMs(), chatTimes: [], pendingEvents: [], suspicious: 0,
      rng: new SimRNG((this.clock.nowMs() ^ auth.account.id.length) >>> 0),
    };
    this.sessions.set(s.accountId, s);
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
      case 'c_action': return this.handleAction(s, msg);
      case 'c_social': return this.handleSocial(s, msg);
      case 'c_ping': return this.send(s, { type: 's_pong', originalTimestamp: msg.timestamp, serverTimestamp: this.clock.nowMs() });
      default: return;
    }
  }

  // ---------------------------------------------------------------- input validation

  private handleInput(s: Session, msg: Extract<ClientMessage, { type: 'c_input' }>): void {
    if (!Array.isArray(msg.commands) || typeof msg.seq !== 'number') return;
    if (msg.seq <= s.lastSeq) { s.suspicious++; return; } // replayed or out-of-order
    s.lastSeq = msg.seq;
    const ent = s.instance.world.entities.get(s.entityId);
    if (!ent || ent.hull <= 0) return;
    for (const raw of msg.commands.slice(0, MAX_COMMANDS_PER_PACKET)) {
      if (s.cmdBudget < 1) { s.suspicious++; break; }
      s.cmdBudget--;
      const cmd = this.sanitize(s, raw);
      if (cmd) s.pending.push(cmd);
    }
  }

  private sanitize(s: Session, c: SimCommand): SimCommand | undefined {
    switch (c.type) {
      case 'Drive': {
        if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) return undefined;
        const len = Math.hypot(c.x, c.y);
        return len > 1 ? { type: 'Drive', x: c.x / len, y: c.y / len } : { type: 'Drive', x: c.x, y: c.y };
      }
      case 'SetTarget': {
        if (c.targetId === null || c.targetId === undefined) return { type: 'SetTarget', targetId: null };
        const t = s.instance.world.entities.get(c.targetId);
        return t && t.hull > 0 && t.isHostile ? { type: 'SetTarget', targetId: c.targetId } : undefined;
      }
      case 'ToggleAutoFire': return { type: 'ToggleAutoFire' };
      case 'FireMain': return { type: 'FireMain' };
      case 'UseAbility': return typeof c.abilityId === 'string' ? { type: 'UseAbility', abilityId: c.abilityId } : undefined;
      case 'SelectAmmo': {
        const ent = s.instance.world.entities.get(s.entityId);
        const stock = ent?.ammoInventory[c.ammo];
        return ent && stock !== undefined && (stock === -1 || stock > 0) ? { type: 'SelectAmmo', ammo: c.ammo } : undefined;
      }
      default: return undefined; // EnterGate/Interact are server-driven
    }
  }

  // ---------------------------------------------------------------- chat

  private handleChat(s: Session, msg: Extract<ClientMessage, { type: 'c_chat' }>): void {
    const text = String(msg.text ?? '').trim().slice(0, 200);
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
    const out: ServerMessage = { type: 's_chat', message: { id: `m${now}${s.accountId.slice(0, 4)}`, sender: s.name, clanTag: s.clanTag, channel: channel as any, text: clean, timestamp: now } };
    const blockedMe = new Set(this.deps.social.blockedBy(s.accountId)); // recipients who blocked the sender never see it
    const deliver = (o: Session) => { if (!blockedMe.has(o.accountId)) this.send(o, out); };
    switch (channel) {
      case 'G': case 'T':
        if (channel === 'G') this.deps.chat.add('G', s.name, clean, now);
        for (const o of this.sessions.values()) deliver(o);
        return;
      case 'M': for (const o of s.instance.sessions) deliver(o); return;
      case 'C': {
        if (!s.clanId) return this.send(s, { type: 's_error', code: 'no_clan', message: 'You are not in a clan' });
        for (const o of this.sessions.values()) if (o.clanId === s.clanId) deliver(o);
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

  private applyClanTag(s: Session): void {
    const c = this.deps.social.clanOf(s.accountId);
    s.clanId = c?.id;
    s.clanTag = c?.tag;
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
        const r = social.createClan(s.accountId, String(req.name ?? ''), String(req.tag ?? ''));
        if (r.ok) { s.character.wallet.scrap -= CLAN_CREATE_COST; s.dirty = true; this.applyClanTag(s); this.sendCharacter(s); }
        return reply(r);
      }
      case 'clan_invite': {
        const r = social.invite(s.accountId, target!.id);
        if (r.ok) this.socialEvent(target!.id, 'clan_invite', { from: s.name, clan: social.clanOf(s.accountId)?.name });
        return reply(r);
      }
      case 'clan_invites': return reply({ ok: true, data: social.invitesFor(s.accountId) });
      case 'clan_accept': { const r = social.acceptInvite(s.accountId, Number(req.clanId)); if (r.ok) this.applyClanTag(s); return reply(r); }
      case 'clan_leave': { const r = social.leave(s.accountId); if (r.ok) this.applyClanTag(s); return reply(r); }
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

      case 'profile': {
        const live = this.sessions.get(target!.id);
        const row = live ? { character: live.character } : this.deps.profiles.get(target!.id);
        const c = social.clanOf(target!.id);
        const stats = row ? C.computeLoadoutStats(row.character) : undefined;
        return reply({ ok: true, data: {
          name: target!.name, level: row?.character.level ?? 1, clan: c ? { name: c.name, tag: c.tag } : null, online: !!live,
          vehicle: row?.character.activeVehicle, power: stats ? Math.round(Math.sqrt(stats.dps * (stats.maxHull + stats.maxArmor))) : 0,
          titles: row?.character.season.titles ?? [], isFriend: social.areFriends(s.accountId, target!.id), blocked: social.isBlocked(s.accountId, target!.id),
        } });
      }
      case 'ranking':
        return reply({ ok: true, data: req.kind === 'clans' ? social.clanRanking(20) : this.deps.profiles.topByLevel(20) });
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
      const ent = s.instance.world.entities.get(s.entityId);
      if (ent) refreshPlayerStats(ent, s.character);
      s.dirty = true;
      this.sendCharacter(s);
    }
  }

  private buyAmmo(s: Session, ammo: AmmoType, packs: number): C.Result {
    const price = AMMO_PRICES[ammo];
    const n = Math.floor(packs);
    if (!price || n < 1 || n > 50) return { ok: false, error: 'bad_request' };
    const cost = price.cost * n;
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

    for (const ev of world.events) {
      for (const s of inst.sessions) s.pendingEvents.push(ev);
      switch (ev.type) {
        case 'entity_killed': {
          const killer = ev.killerId !== undefined ? byEntity.get(ev.killerId) : undefined;
          const victim = world.entities.get(ev.victimId);
          if (killer && victim && victim.isHostile) this.rewardKill(killer, victim);
          break;
        }
        case 'loot_collected': {
          const s = byEntity.get(ev.collectorId);
          if (s) this.rewardLoot(s, ev.crateType, ev.amount);
          break;
        }
        case 'player_died': {
          const s = byEntity.get(ev.entityId);
          if (s) { s.character.wallet.scrap = Math.floor(s.character.wallet.scrap * 0.9); s.respawnAt = world.time + RESPAWN_SECONDS; s.dirty = true; this.sendCharacter(s); }
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

  private rewardKill(s: Session, victim: SimEntity): void {
    const ch = s.character;
    const isBoss = victim.kind === 'boss';
    const xp = calculateKillXP(ch.level, victim.level, !!victim.isElite, isBoss);
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
    if (loot.itemId && loot.rarity) C.createItem(ch, loot.itemId, loot.rarity, s.rng);
    if (loot.keys > 0) ch.wallet.gateKeys += loot.keys;
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
    if (kind === 'scrap') w.scrap += amount;
    else if (kind === 'parts') w.fragments += amount;
    else if (kind === 'ore' && sub) { if (s.clanId) this.deps.social.addClanProgress(s.clanId, 'clan_mine', amount); w.ore[sub as C.OreType] += amount; Q.onQuestEvent(s.character, { type: 'collect_ore', ore: sub, amount }); }
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
      const sp = this.spawnPos(inst);
      e.pos = { ...sp }; e.vel = { x: 0, y: 0 };
      e.hull = e.maxHull; e.armor = e.maxArmor;
      e.invulnerableTime = 5; e.isWreck = false; e.wreckTimer = undefined; e.targetId = undefined; e.statusEffects = [];
      s.respawnAt = undefined;
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
    for (const s of inst.sessions) {
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
      this.send(s, { type: 's_state', tick: world.tick, lastProcessedSeq: s.lastSeq, serverTime: world.time, patches, removed, events });
    }
  }

  private sendCharacter(s: Session): void {
    const ent = s.instance.world.entities.get(s.entityId);
    const ammo: Record<string, number> = { ...s.ammo, STANDARD: -1 };
    if (ent) for (const k of Object.keys(ent.ammoInventory)) ammo[k] = ent.ammoInventory[k as AmmoType];
    this.send(s, { type: 's_character', character: s.character, ammo: ammo as any });
  }

  save(s: Session): void {
    if (!this.deps.accounts.get(s.accountId)) return; // account was deleted (admin/GDPR): nothing to persist
    const ent = s.instance?.world.entities.get(s.entityId);
    if (ent) for (const k of Object.keys(s.ammo)) if (k !== 'STANDARD') s.ammo[k] = ent.ammoInventory[k as AmmoType] ?? s.ammo[k];
    this.deps.profiles.save({ accountId: s.accountId, character: s.character, ammo: s.ammo, mapId: s.instance?.mapId ?? 1, updatedAt: this.clock.nowMs() });
    s.dirty = false;
    s.lastSave = this.clock.nowMs();
  }

  private send(s: Session, msg: ServerMessage): void { this.sendRaw(s.ws, msg); }

  private sendRaw(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    const data = JSON.stringify(msg);
    this.metrics.bytesOut += data.length;
    ws.send(data);
  }
}
