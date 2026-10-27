/**
 * Authoritative game server: map instances at 30 Hz, delta snapshots at 10 Hz, server-side validation of every
 * command and action, rewards computed here (the client never sends damage, loot or currency).
 */
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { getAllMaps, getMapById } from '../shared/data/maps.ts';
import { rollLoot } from '../shared/data/loot.ts';
import { DeltaEncoder } from '../shared/net/delta.ts';
import { MIN_PROTOCOL_VERSION, PROTOCOL_VERSION, ClientActionPacket, ClientMessage, ServerMessage } from '../shared/protocol.ts';
import { SimRNG } from '../shared/prng.ts';
import * as C from '../shared/rules/character.ts';
import { calculateKillXP } from '../shared/rules/progression.ts';
import * as Q from '../shared/rules/quests.ts';
import { refreshPlayerStats, spawnPlayerFromCharacter } from '../shared/sim/playerEntity.ts';
import { createWorld, stepWorld, World } from '../shared/sim/world.ts';
import { AmmoType, MapDef, SimCommand, SimEntity, SimEvent, SIM_TIMESTEP } from '../shared/types.ts';
import { AccountService } from './accounts.ts';
import { AccountRepo, ChatRepo, ProfileRepo } from './db.ts';
import { createStarterCharacterForServer, DEFAULT_AMMO } from './starter.ts';

export const TICK_HZ = 30;
export const SNAPSHOT_EVERY_TICKS = 3; // 10 Hz
export const INSTANCE_CAPACITY = 100;
export const INTEREST_RADIUS = 2300;
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
}

export interface ServerDeps {
  accounts: AccountRepo;
  profiles: ProfileRepo;
  chat: ChatRepo;
  service: AccountService;
  clock?: Clock;
  adminToken?: string;
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
    for (const m of this.deps.chat.recent('G', 20)) this.send(s, { type: 's_chat', message: { id: `h${m.ts}`, sender: m.sender, channel: 'G', text: m.text, timestamp: m.ts } });
    return s;
  }

  private handleMessage(s: Session, msg: ClientMessage): void {
    switch (msg.type) {
      case 'c_input': return this.handleInput(s, msg);
      case 'c_chat': return this.handleChat(s, msg);
      case 'c_action': return this.handleAction(s, msg);
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
    const channel = msg.channel === 'M' ? 'M' : 'G';
    const out: ServerMessage = { type: 's_chat', message: { id: `m${now}${s.accountId.slice(0, 4)}`, sender: s.name, channel, text: clean, timestamp: now } };
    if (channel === 'G') { this.deps.chat.add('G', s.name, clean, now); for (const o of this.sessions.values()) this.send(o, out); }
    else for (const o of s.instance.sessions) this.send(o, out);
  }

  // ---------------------------------------------------------------- actions (workshop, garage, quests...)

  private handleAction(s: Session, p: ClientActionPacket): void {
    const a = p.action;
    const ch = s.character;
    const rng = s.rng;
    const inSafe = this.inSafeZone(s);
    let r: C.Result<any> = { ok: false, error: 'unknown_action' };
    switch (a.kind) {
      case 'equip': r = inSafe ? (C.unequipItem(ch, a.vehicleId, a.slot), C.equipItem(ch, a.vehicleId, a.slot, a.uid)) : { ok: false, error: 'safe_zone_only' }; break;
      case 'unequip': r = inSafe ? C.unequipItem(ch, a.vehicleId, a.slot) : { ok: false, error: 'safe_zone_only' }; break;
      case 'upgrade': r = inSafe ? C.upgradeItem(ch, a.uid, rng, !!a.safe) : { ok: false, error: 'safe_zone_only' }; if (r.ok) Q.onQuestEvent(ch, { type: 'upgrade' }); break;
      case 'dismantle': r = inSafe ? C.dismantleItem(ch, a.uid) : { ok: false, error: 'safe_zone_only' }; break;
      case 'craft': r = inSafe ? C.craftItem(ch, a.recipeId, rng) : { ok: false, error: 'safe_zone_only' }; if (r.ok) Q.onQuestEvent(ch, { type: 'craft' }); break;
      case 'reroll': r = inSafe ? C.rerollAffix(ch, a.uid, a.index, rng) : { ok: false, error: 'safe_zone_only' }; break;
      case 'fuse': r = inSafe ? C.fuseItems(ch, a.uids, rng) : { ok: false, error: 'safe_zone_only' }; break;
      case 'expand_inventory': r = C.expandInventory(ch); break;
      case 'buy_vehicle': r = inSafe ? C.buyVehicle(ch, a.vehicleId) : { ok: false, error: 'safe_zone_only' }; break;
      case 'set_vehicle':
        r = !inSafe ? { ok: false, error: 'safe_zone_only' } : ch.garage.some((g) => g.vehicleId === a.vehicleId) ? ((ch.activeVehicle = a.vehicleId), { ok: true }) : { ok: false, error: 'vehicle_not_owned' };
        break;
      case 'rank_talent': r = C.rankUpTalent(ch, a.talentId); break;
      case 'respec': r = C.respecTalents(ch); break;
      case 'accept_quest': r = Q.acceptQuest(ch, a.questId); break;
      case 'claim_quest': r = Q.claimQuest(ch, a.questId, rng, Math.floor(this.clock.nowMs() / 1000)); break;
      case 'abandon_quest': r = Q.abandonQuest(ch, a.questId); break;
      case 'claim_season_tier': r = Q.claimSeasonTier(ch, a.tier, Math.floor(this.clock.nowMs() / 1000)); break;
      case 'buy_ammo': r = this.buyAmmo(s, a.ammo, a.packs); break;
      case 'tutorial': Q.onQuestEvent(ch, { type: 'tutorial', step: a.step }); r = { ok: true }; break;
    }
    this.send(s, { type: 's_action_result', id: p.id, ok: r.ok, error: r.ok ? undefined : (r as any).error });
    if (r.ok) {
      const ent = s.instance.world.entities.get(s.entityId);
      if (ent) refreshPlayerStats(ent, ch);
      s.dirty = true;
      this.sendCharacter(s);
    }
  }

  private static AMMO_PRICES: Record<string, { pack: number; cost: number }> = {
    REINFORCED: { pack: 20, cost: 45 }, ARMOR_PIERCING: { pack: 20, cost: 65 }, SHAPED_CHARGE: { pack: 10, cost: 120 }, EXPLOSIVE: { pack: 20, cost: 75 },
  };

  private buyAmmo(s: Session, ammo: AmmoType, packs: number): C.Result {
    const price = GameServer.AMMO_PRICES[ammo];
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
    C.grantXP(ch, xp);
    C.addMasteryXp(ch, ch.activeVehicle, Math.round(xp / 4));
    const loot = rollLoot(s.rng, victim.level, 1, !!victim.isElite, isBoss, ch.pityCounter);
    ch.pityCounter = loot.newPityCounter;
    if (loot.itemId && loot.rarity) C.createItem(ch, loot.itemId, loot.rarity, s.rng);
    if (loot.keys > 0) ch.wallet.gateKeys += loot.keys;
    Q.onQuestEvent(ch, { type: 'kill', kind: victim.kind, level: victim.level, isElite: !!victim.isElite, isBoss });
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
    else if (kind === 'ore' && sub) { w.ore[sub as C.OreType] += amount; Q.onQuestEvent(s.character, { type: 'collect_ore', ore: sub, amount }); }
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
    for (const s of inst.sessions) {
      const me = world.entities.get(s.entityId);
      if (!me) continue;
      const r2 = INTEREST_RADIUS * INTEREST_RADIUS;
      const visible: SimEntity[] = [];
      for (const e of world.entities.values()) {
        if (e.id === me.id || e.kind === 'boss' || e.kind === 'gate' || (e.pos.x - me.pos.x) ** 2 + (e.pos.y - me.pos.y) ** 2 <= r2) visible.push(e);
      }
      const { patches, removed } = s.encoder.encode(visible);
      const events = s.pendingEvents.filter((ev: any) => !ev.pos || (ev.pos.x - me.pos.x) ** 2 + (ev.pos.y - me.pos.y) ** 2 <= r2 * 1.2);
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
