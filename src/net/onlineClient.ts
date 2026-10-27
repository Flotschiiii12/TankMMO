import { applyPatch } from '../../shared/net/delta.ts';
import { PROTOCOL_VERSION, ServerMessage } from '../../shared/protocol.ts';
import type { ClientAction } from '../../shared/rules/actions.ts';
import type { CharacterState } from '../../shared/rules/character.ts';
import { MAP_CATALOG } from '../data/maps.ts';
import { ClientWorld, WorldSnapshot } from '../sim/snapshot.ts';
import { angleDiff, ChatMessage, clamp, dist, lerp, SimCommand, SimEntity, SimEvent } from '../sim/types.ts';
import type { UserProfile } from '../save/profile.ts';
import type { GameClient } from './client.ts';

const INTERP_MS = 100; // remote entities are rendered ~100 ms in the past
const INPUT_FLUSH_MS = 50;
const PREDICT_DT = 1 / 30;

interface Tween { fromX: number; fromY: number; toX: number; toY: number; fromA: number; toA: number; fromT: number; toT: number; t0: number }

export type OnlineStatus = 'connecting' | 'online' | 'closed';

/**
 * Browser client for the authoritative server. Own vehicle: client-side prediction of movement, reconciled with the
 * server state. Everything else: interpolation between the two latest server states. The server owns all results.
 */
export class OnlineGameClient implements GameClient {
  playerId = 0;
  character: CharacterState | null = null;
  ammo: Record<string, number> = {};
  status: OnlineStatus = 'connecting';
  closeCode = 0;
  closeReason = '';
  pingMs = 0;

  private ws!: WebSocket;
  private entities = new Map<number, SimEntity>();
  private tweens = new Map<number, Tween>();
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
        this.entities.clear();
        this.tweens.clear();
        this.predicted = null;
        this.clientWorld.mapId = String(m.mapId);
        this.clientWorld.mapDef = MAP_CATALOG[m.mapId] || MAP_CATALOG['green_valley'];
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
          const before = this.entities.get(p.id);
          const fromPos = before ? { ...before.pos } : undefined;
          const fromA = before?.chassisAngle ?? 0;
          const fromT = before?.turretAngle ?? 0;
          applyPatch(this.entities, p);
          const e = this.entities.get(p.id);
          if (e && p.id !== this.playerId && fromPos) {
            const cur = this.tweens.get(p.id);
            const fx = cur ? this.tweenPos(cur, now).x : fromPos.x;
            const fy = cur ? this.tweenPos(cur, now).y : fromPos.y;
            this.tweens.set(p.id, { fromX: fx, fromY: fy, toX: e.pos.x, toY: e.pos.y, fromA, toA: e.chassisAngle, fromT, toT: e.turretAngle, t0: now });
          }
        }
        for (const id of m.removed) { this.entities.delete(id); this.tweens.delete(id); }
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
      case 's_pong': this.pingMs = Date.now() - m.originalTimestamp; break;
      case 's_error': this.closeReason = m.code; break;
    }
  }

  private tweenPos(t: Tween, now: number): { x: number; y: number } {
    const k = clamp((now - t.t0) / INTERP_MS, 0, 1);
    return { x: lerp(t.fromX, t.toX, k), y: lerp(t.fromY, t.toY, k) };
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
    const ns = lerp(speed, target, Math.min(1, 350 * dt));
    p.vel = { x: Math.cos(p.chassisAngle) * ns, y: Math.sin(p.chassisAngle) * ns };
    p.pos = { x: clamp(p.pos.x + p.vel.x * dt, p.radius, this.clientWorld.mapDef.width - p.radius), y: clamp(p.pos.y + p.vel.y * dt, p.radius, this.clientWorld.mapDef.height - p.radius) };
  }

  private lastPredict = performance.now();

  // ----------------------------------------------------------- GameClient

  sendCommand(command: SimCommand): void {
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

  sendChat(text: string, channel: 'G' | 'M' = 'G'): void { this.send({ type: 'c_chat', channel, text }); }

  getSnapshot(): WorldSnapshot | null {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastPredict) / 1000);
    this.lastPredict = now;
    this.predictStep(dt);
    const list: SimEntity[] = [];
    for (const e of this.entities.values()) {
      if (e.id === this.playerId && this.predicted) { list.push(this.predicted); continue; }
      const t = this.tweens.get(e.id);
      if (t) {
        const pos = this.tweenPos(t, now);
        const k = clamp((now - t.t0) / INTERP_MS, 0, 1);
        list.push({ ...e, pos, chassisAngle: t.fromA + angleDiff(t.toA, t.fromA) * k, turretAngle: t.fromT + angleDiff(t.toT, t.fromT) * k });
      } else list.push(e);
    }
    this.clientWorld.chatHistory = this.chat;
    return { tick: this.lastTick, time: this.serverTime, mapId: this.clientWorld.mapId, entities: list, events: [], chatHistory: this.chat };
  }

  getEntity(id: number): SimEntity | undefined { return this.entities.get(id); }
  getPredictedPlayer(): SimEntity | null { return this.predicted; }

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
