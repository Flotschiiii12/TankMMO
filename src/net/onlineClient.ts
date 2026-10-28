import { RemoteInterpolator } from './interpolation.ts';
import { approachSpeed } from '../../shared/rules/movement.ts';
import { applyPatch } from '../../shared/net/delta.ts';
import { PROTOCOL_VERSION, ServerMessage, SocialOp } from '../../shared/protocol.ts';
import type { ClientAction } from '../../shared/rules/actions.ts';
import type { CharacterState } from '../../shared/rules/character.ts';
import { MAP_CATALOG } from '../data/maps.ts';
import { ClientWorld, WorldSnapshot } from '../sim/snapshot.ts';
import { angleDiff, ChatMessage, clamp, dist, lerp, SimCommand, SimEntity, SimEvent } from '../sim/types.ts';
import type { UserProfile } from '../save/profile.ts';
import type { GameClient } from './client.ts';

const INPUT_FLUSH_MS = 50;
const PREDICT_DT = 1 / 30;

export type OnlineStatus = 'connecting' | 'online' | 'closed';

/**
 * Browser client for the authoritative server. Own vehicle: client-side prediction of movement, reconciled with the
 * server state. Everything else: interpolation between the two latest server states. The server owns all results.
 */
export class OnlineGameClient implements GameClient {
  playerId = 0;
  mapId = 1;
  character: CharacterState | null = null;
  ammo: Record<string, number> = {};
  status: OnlineStatus = 'connecting';
  closeCode = 0;
  closeReason = '';
  pingMs = 0;
  /** arena spectating: no own vehicle; camera follows `followId` or free-roams at `freeCam` */
  spectating = false;
  followId: number | null = null;
  freeCam = { x: 2500, y: 2500 };

  private ws!: WebSocket;
  private entities = new Map<number, SimEntity>();
  private interp = new RemoteInterpolator();
  private clientWorld: ClientWorld;
  private predicted: SimEntity | null = null;
  private pendingInputs: SimCommand[] = [];
  private seq = 0;
  private flushTimer?: ReturnType<typeof setInterval>;
  private pingTimer?: ReturnType<typeof setInterval>;
  private eventHandlers = new Set<(e: SimEvent) => void>();
  private characterHandlers = new Set<(c: CharacterState, ammo: Record<string, number>) => void>();
  private closeHandlers = new Set<() => void>();
  private chat: ChatMessage[] = [];
  private actionId = 0;
  private actionWaiters = new Map<number, (r: { ok: boolean; error?: string }) => void>();
  private lastTick = 0;
  private serverTime = 0;
  private stateTimes: number[] = [];
  private driveX = 0;
  private driveY = 0;
  private mapReady?: () => void;
  private socialId = 0;
  private socialWaiters = new Map<number, (r: { ok: boolean; error?: string; data?: any }) => void>();
  private socialHandlers = new Set<(kind: string, data: any) => void>();

  constructor(private serverUrl: string, private credential: string, profile: UserProfile) {
    this.clientWorld = { id: 'online', mapId: String(profile.currentMapId), tick: 0, time: 0, entities: this.entities, events: [], chatHistory: [], mapDef: MAP_CATALOG[profile.currentMapId] || MAP_CATALOG['green_valley'] };
  }

  /** Resolves when the server has placed us in a map and sent the character; rejects on a critical error. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = this.serverUrl.replace(/^http/, 'ws') + '/ws';
      this.ws = new WebSocket(url);
      let joined = false;
      this.mapReady = () => { if (!joined && this.character && this.playerId) { joined = true; this.status = 'online'; resolve(); } };
      this.ws.onopen = () => {
        const [accountId, secret] = this.credential.split('.');
        this.ws.send(JSON.stringify({ type: 'c_join', protocolVersion: PROTOCOL_VERSION, accountId, secret }));
        this.flushTimer = setInterval(() => this.flushInput(), INPUT_FLUSH_MS);
        this.pingTimer = setInterval(() => this.send({ type: 'c_ping', timestamp: Date.now() }), 2000);
      };
      this.ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data as string) as ServerMessage);
      this.ws.onerror = () => { if (!joined) reject(new Error('connection_failed')); };
      this.ws.onclose = (ev) => {
        this.status = 'closed';
        this.closeCode = ev.code;
        this.closeReason = ev.reason;
        if (this.flushTimer) clearInterval(this.flushTimer);
        if (this.pingTimer) clearInterval(this.pingTimer);
        if (!joined) reject(new Error(ev.reason || `closed_${ev.code}`));
        for (const h of this.closeHandlers) h();
      };
    });
  }

  private send(o: object): void { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o)); }

  private onMessage(m: ServerMessage): void {
    switch (m.type) {
      case 's_map': {
        this.playerId = m.assignedEntityId;
        this.mapId = m.mapId;
        this.spectating = !!m.spectate;
        this.followId = null;
        this.entities.clear();
        this.interp.clear();
        this.predicted = null;
        this.clientWorld.mapId = String(m.mapId);
        this.clientWorld.mapDef = MAP_CATALOG[m.mapId] || MAP_CATALOG['green_valley'];
        this.freeCam = { x: this.clientWorld.mapDef.width / 2, y: this.clientWorld.mapDef.height / 2 };
        this.mapReady?.();
        break;
      }
      case 's_character':
        this.character = m.character;
        this.ammo = m.ammo as any;
        for (const h of this.characterHandlers) h(m.character, this.ammo);
        this.mapReady?.();
        break;
      case 's_state': {
        const now = performance.now();
        this.stateTimes.push(now);
        if (this.stateTimes.length > 20) this.stateTimes.shift();
        for (const p of m.patches) {
          applyPatch(this.entities, p);
          const e = this.entities.get(p.id);
          if (e && p.id !== this.playerId) this.interp.push(p.id, now, e.pos.x, e.pos.y, e.chassisAngle, e.turretAngle);
        }
        for (const id of m.removed) { this.entities.delete(id); this.interp.remove(id); }
        this.lastTick = m.tick;
        this.serverTime = m.serverTime;
        this.reconcile();
        for (const ev of m.events) for (const h of this.eventHandlers) h(ev);
        break;
      }
      case 's_chat':
        this.chat.push(m.message);
        if (this.chat.length > 40) this.chat.shift();
        break;
      case 's_action_result': {
        const w = this.actionWaiters.get(m.id);
        if (w) { this.actionWaiters.delete(m.id); w({ ok: m.ok, error: m.error }); }
        break;
      }
      case 's_social_result': {
        const w = this.socialWaiters.get(m.id);
        if (w) { this.socialWaiters.delete(m.id); w({ ok: m.ok, error: m.error, data: m.data }); }
        break;
      }
      case 's_social_event': for (const h of this.socialHandlers) h(m.kind, m.data); break;
      case 's_pong': this.pingMs = Date.now() - m.originalTimestamp; break;
      case 's_error': this.closeReason = m.code; break;
    }
  }

  // ----------------------------------------------------------- prediction

  private reconcile(): void {
    const auth = this.entities.get(this.playerId);
    if (!auth) return;
    if (!this.predicted) { this.predicted = { ...auth, pos: { ...auth.pos }, vel: { ...auth.vel } }; return; }
    const p = this.predicted;
    // Non-predicted state comes straight from the server
    Object.assign(p, { hull: auth.hull, maxHull: auth.maxHull, armor: auth.armor, maxArmor: auth.maxArmor, mainReloadRemaining: auth.mainReloadRemaining, statusEffects: auth.statusEffects,
      abilityCooldowns: auth.abilityCooldowns, targetId: auth.targetId, autoFire: auth.autoFire, selectedAmmo: auth.selectedAmmo, ammoInventory: auth.ammoInventory, isWreck: auth.isWreck,
      turretAngle: auth.turretAngle, maxSpeed: auth.maxSpeed, turnRate: auth.turnRate, level: auth.level, tier: auth.tier, radius: auth.radius, invulnerableTime: auth.invulnerableTime, mainRange: auth.mainRange });
    const err = dist(p.pos, auth.pos);
    if (err > 80 || auth.hull <= 0) { p.pos = { ...auth.pos }; p.vel = { ...auth.vel }; p.chassisAngle = auth.chassisAngle; }
    else if (err > 2) { p.pos.x = lerp(p.pos.x, auth.pos.x, 0.25); p.pos.y = lerp(p.pos.y, auth.pos.y, 0.25); p.chassisAngle = lerp(p.chassisAngle, p.chassisAngle + angleDiff(auth.chassisAngle, p.chassisAngle), 0.25); }
  }

  /** Same steering/acceleration model as the server, applied locally every frame for a responsive own vehicle. */
  private predictStep(dt: number): void {
    const p = this.predicted;
    if (!p || p.hull <= 0) return;
    const len = Math.hypot(this.driveX, this.driveY);
    if (len > 0.05) {
      const want = Math.atan2(this.driveY, this.driveX);
      const diff = angleDiff(want, p.chassisAngle);
      p.chassisAngle += clamp(diff, -p.turnRate * dt, p.turnRate * dt);
    }
    const speed = Math.hypot(p.vel.x, p.vel.y);
    const target = len > 0.05 ? Math.min(1, len) * p.maxSpeed : 0;
    const ns = approachSpeed(speed, target, p.maxSpeed, dt);
    p.vel = { x: Math.cos(p.chassisAngle) * ns, y: Math.sin(p.chassisAngle) * ns };
    p.pos = { x: clamp(p.pos.x + p.vel.x * dt, p.radius, this.clientWorld.mapDef.width - p.radius), y: clamp(p.pos.y + p.vel.y * dt, p.radius, this.clientWorld.mapDef.height - p.radius) };
  }

  private lastPredict = performance.now();

  // ----------------------------------------------------------- GameClient

  sendCommand(command: SimCommand): void {
    if (this.spectating) return; // the server ignores spectator input anyway
    if (command.type === 'Drive') { this.driveX = command.x; this.driveY = command.y; }
    this.pendingInputs.push(command);
    if (this.pendingInputs.length > 32) this.pendingInputs.splice(0, this.pendingInputs.length - 32);
  }

  private flushInput(): void {
    if (this.pendingInputs.length === 0) return;
    // Consecutive Drive commands collapse to the latest one
    const out: SimCommand[] = [];
    for (const c of this.pendingInputs) { if (c.type === 'Drive' && out.length && out[out.length - 1].type === 'Drive') out[out.length - 1] = c; else out.push(c); }
    this.pendingInputs = [];
    this.send({ type: 'c_input', seq: ++this.seq, commands: out, clientTime: Date.now() });
  }

  sendAction(action: ClientAction): Promise<{ ok: boolean; error?: string }> {
    const id = ++this.actionId;
    return new Promise((resolve) => {
      this.actionWaiters.set(id, resolve);
      this.send({ type: 'c_action', id, action });
      setTimeout(() => { if (this.actionWaiters.delete(id)) resolve({ ok: false, error: 'timeout' }); }, 8000);
    });
  }

  sendChat(text: string, channel: 'G' | 'M' | 'F' | 'C' | 'A' | 'P' | 'W' | 'T' = 'G', targetRecipient?: string): void { this.send({ type: 'c_chat', channel, text, targetRecipient }); }

  social(req: SocialOp): Promise<{ ok: boolean; error?: string; data?: any }> {
    const id = ++this.socialId;
    return new Promise((resolve) => {
      this.socialWaiters.set(id, resolve);
      this.send({ type: 'c_social', id, req });
      setTimeout(() => { if (this.socialWaiters.delete(id)) resolve({ ok: false, error: 'timeout' }); }, 8000);
    });
  }

  onSocialEvent(h: (kind: string, data: any) => void): () => void { this.socialHandlers.add(h); return () => this.socialHandlers.delete(h); }

  getSnapshot(): WorldSnapshot | null {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastPredict) / 1000);
    this.lastPredict = now;
    this.predictStep(dt);
    const list: SimEntity[] = [];
    for (const e of this.entities.values()) {
      if (e.id === this.playerId && this.predicted) { list.push(this.predicted); continue; }
      const sm = this.interp.sample(e.id, now);
      if (sm) list.push({ ...e, pos: { x: sm.x, y: sm.y }, chassisAngle: sm.a, turretAngle: sm.ta });
      else list.push(e);
    }
    this.clientWorld.chatHistory = this.chat;
    return { tick: this.lastTick, time: this.serverTime, mapId: this.clientWorld.mapId, entities: list, events: [], chatHistory: this.chat };
  }

  getEntity(id: number): SimEntity | undefined { return this.entities.get(id); }
  getPredictedPlayer(): SimEntity | null { return this.predicted; }

  /** Vehicles that can be followed while spectating. */
  spectateFighters(): SimEntity[] { return [...this.entities.values()].filter((e) => e.kind === 'player').sort((a, b) => a.id - b.id); }
  /** Cycles the followed vehicle (dir = +1 / -1); from free-roam it picks the first one. */
  spectateCycle(dir: 1 | -1): void {
    const ids = this.spectateFighters().map((e) => e.id);
    if (!ids.length) { this.followId = null; return; }
    const i = this.followId === null ? -1 : ids.indexOf(this.followId);
    this.followId = ids[(i + dir + ids.length * 2) % ids.length];
  }
  spectateFree(): void { const f = this.followId === null ? undefined : this.entities.get(this.followId); if (f) this.freeCam = { ...f.pos }; this.followId = null; }
  moveFreeCam(dx: number, dy: number): void {
    const m = this.clientWorld.mapDef;
    this.freeCam = { x: Math.max(0, Math.min(m.width, this.freeCam.x + dx)), y: Math.max(0, Math.min(m.height, this.freeCam.y + dy)) };
  }
  /** The entity (interpolated) the spectator camera currently follows. */
  spectateTarget(): SimEntity | null {
    if (!this.spectating || this.followId === null) return null;
    return this.getSnapshot()?.entities.find((e) => e.id === this.followId) ?? null;
  }

  onEvent(handler: (e: SimEvent) => void): () => void { this.eventHandlers.add(handler); return () => this.eventHandlers.delete(handler); }
  onCharacter(handler: (c: CharacterState, ammo: Record<string, number>) => void): () => void { this.characterHandlers.add(handler); return () => this.characterHandlers.delete(handler); }
  onClose(handler: () => void): () => void { this.closeHandlers.add(handler); return () => this.closeHandlers.delete(handler); }

  // Map changes are driven by the server (gate_used -> s_map); the local entry points are no-ops online.
  switchMap(): void {}
  fastTravelToMap(): void {}
  updateProfile(): void {}

  disconnect(): void { if (this.flushTimer) clearInterval(this.flushTimer); if (this.pingTimer) clearInterval(this.pingTimer); this.ws?.close(); }

  getTickStats() {
    const n = this.stateTimes.length;
    const rate = n > 1 ? Math.round(((n - 1) * 1000) / (this.stateTimes[n - 1] - this.stateTimes[0])) : 0;
    return { fps: 60, tickTime: this.pingMs, entityCount: this.entities.size, tickRate: rate * 3 };
  }
}
