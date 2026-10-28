import { applySnapshot, ClientWorld, serializeSnapshot, WorldSnapshot } from '../sim/snapshot.ts';
import { Realm } from '../sim/realm.ts';
import { angleDiff, ChatMessage, clamp, dist, lerp, SimCommand, SimEntity, SimEvent, vec2 } from '../sim/types.ts';
import { SIM_TIMESTEP } from '../sim/world.ts';
import type { ClientAction } from '../../shared/rules/actions.ts';
import { UserProfile } from '../save/profile.ts';
import { WebSocketTransport } from './transport.ts';

export interface GameClient {
  readonly playerId: number;
  sendCommand(command: SimCommand): void;
  getSnapshot(): WorldSnapshot | null;
  getEntity(id: number): SimEntity | undefined;
  getPredictedPlayer(): SimEntity | null;
  onEvent(handler: (event: SimEvent) => void): () => void;
  switchMap(targetMapId: string, gateId: string): void;
  fastTravelToMap(targetMapId: string): void;
  updateProfile(profile: UserProfile): void;
  /** Present only on the online client: sends the action to the server and resolves with its verdict. */
  sendAction?(action: ClientAction): Promise<{ ok: boolean; error?: string }>;

  disconnect(): void;
  getTickStats(): { fps: number; tickTime: number; entityCount: number; tickRate: number };
}

interface PendingCommand {
  seq: number;
  tick: number;
  command: SimCommand;
}

/**
 * Local authoritative game client running fixed 30Hz simulation via Realm,
 * serializing snapshots to the client representation, and applying client-side
 * prediction and snapshot reconciliation.
 */
export class LocalGameClient implements GameClient {
  readonly playerId = 9999;
  private realm: Realm;
  private currentMapId: string;
  private clientWorld: ClientWorld;
  private localChat: ChatMessage[] = [];
  private playerEntity: SimEntity;

  private commandQueue: SimCommand[] = [];
  private pendingCommands: PendingCommand[] = [];
  private commandSeq = 0;

  private latestAuthoritativeSnapshot: WorldSnapshot | null = null;
  private previousSnapshot: WorldSnapshot | null = null;
  private eventHandlers = new Set<(event: SimEvent) => void>();

  // Predicted state for local vehicle
  private predictedPlayer: SimEntity;

  // Profiling stats for debug panel (F3)
  private lastTickDuration = 0;
  private tickCounter = 0;
  private lastTpsCheck = Date.now();
  private currentTps = 30;

  private simIntervalId: any = null;

  constructor(profile: UserProfile) {
    this.realm = new Realm();
    this.currentMapId = profile.currentMapId || 'green_valley';

    this.playerEntity = this.realm.createPlayerEntity(this.playerId, profile.playerName, profile.character);
    for (const k of Object.keys(profile.ammoInventory) as Array<keyof typeof profile.ammoInventory>) {
      if (k !== 'STANDARD') this.playerEntity.ammoInventory[k] = profile.ammoInventory[k] ?? 0;
    }

    // Insert player into initial map instance
    const initialInstance = this.realm.getInstance(this.currentMapId);
    initialInstance.insertPlayer(this.playerEntity);

    // Client world representation (created for snapshot application)
    this.clientWorld = {
      id: 'client_world',
      mapId: this.currentMapId,
      tick: 0,
      time: 0,
      entities: new Map(),
      events: [],
      chatHistory: [],
      mapDef: initialInstance.mapDef,
    };

    this.predictedPlayer = { ...this.playerEntity };

    // Initial snapshot serialize -> apply
    this.syncAuthoritativeSnapshot();

    // Start fixed 30Hz simulation loop
    this.startSimLoop();
  }

  private startSimLoop() {
    this.simIntervalId = setInterval(() => {
      this.stepSimulation();
    }, 1000 / 30);
  }

  private stepSimulation() {
    const startTime = performance.now();
    const inst = this.realm.getInstance(this.currentMapId);

    // Map commands for player
    const commandsByEntity = new Map<number, SimCommand[]>();
    if (this.commandQueue.length > 0) {
      commandsByEntity.set(this.playerId, [...this.commandQueue]);
      this.commandQueue = [];
    }

    // Step world authoritatively
    inst.step(commandsByEntity, SIM_TIMESTEP);

    // Broadcast simulation events (kills, damage, loot, gate travel)
    for (const evt of inst.world.events) {
      for (const handler of this.eventHandlers) {
        handler(evt);
      }
      if (evt.type === 'player_died' && evt.entityId === this.playerId) {
        this.handlePlayerRespawn();
      }
    }

    // Serialize authoritative snapshot from server perspective
    this.syncAuthoritativeSnapshot();

    // Measure tick time
    this.lastTickDuration = performance.now() - startTime;
    this.tickCounter++;
    const now = Date.now();
    if (now - this.lastTpsCheck >= 1000) {
      this.currentTps = this.tickCounter;
      this.tickCounter = 0;
      this.lastTpsCheck = now;
    }
  }

  private syncAuthoritativeSnapshot() {
    const inst = this.realm.getInstance(this.currentMapId);
    this.previousSnapshot = this.latestAuthoritativeSnapshot;
    this.latestAuthoritativeSnapshot = serializeSnapshot(inst.world, this.playerId, 2200);
    if (this.localChat.length > 0) {
      this.latestAuthoritativeSnapshot.chatHistory = [...this.latestAuthoritativeSnapshot.chatHistory, ...this.localChat].slice(-40);
    }

    // Apply snapshot to client world
    applySnapshot(this.clientWorld, this.latestAuthoritativeSnapshot);

    // Reconcile client-side predicted state with authoritative state
    const authPlayer = this.clientWorld.entities.get(this.playerId);
    if (authPlayer) {
      // Reconcile non-predicted properties directly
      this.predictedPlayer.hull = authPlayer.hull;
      this.predictedPlayer.armor = authPlayer.armor;
      this.predictedPlayer.maxHull = authPlayer.maxHull;
      this.predictedPlayer.maxArmor = authPlayer.maxArmor;
      this.predictedPlayer.mainReloadRemaining = authPlayer.mainReloadRemaining;
      this.predictedPlayer.statusEffects = authPlayer.statusEffects;
      this.predictedPlayer.abilityCooldowns = authPlayer.abilityCooldowns;
      this.predictedPlayer.isWreck = authPlayer.isWreck;
      this.predictedPlayer.targetId = authPlayer.targetId;
      this.predictedPlayer.autoFire = authPlayer.autoFire;
      this.predictedPlayer.selectedAmmo = authPlayer.selectedAmmo;
      this.predictedPlayer.gateHoldTimer = authPlayer.gateHoldTimer;

      // Position reconciliation: if discrepancy > 30 units, snap; else gently correct
      const posError = dist(this.predictedPlayer.pos, authPlayer.pos);
      if (posError > 30) {
        this.predictedPlayer.pos = { ...authPlayer.pos };
        this.predictedPlayer.vel = { ...authPlayer.vel };
        this.predictedPlayer.chassisAngle = authPlayer.chassisAngle;
      } else {
        this.predictedPlayer.pos.x = lerp(this.predictedPlayer.pos.x, authPlayer.pos.x, 0.2);
        this.predictedPlayer.pos.y = lerp(this.predictedPlayer.pos.y, authPlayer.pos.y, 0.2);
        this.predictedPlayer.chassisAngle = lerp(this.predictedPlayer.chassisAngle, authPlayer.chassisAngle, 0.2);
      }
    }
  }

  private handlePlayerRespawn() {
    const inst = this.realm.getInstance(this.currentMapId);
    const def = inst.mapDef;
    const spawnPos = def.safeZone
      ? { x: def.safeZone.x, y: def.safeZone.y }
      : { x: def.width / 2, y: def.height / 2 };

    const p = inst.getPlayer(this.playerId);
    if (p) {
      p.hull = p.maxHull;
      p.armor = p.maxArmor;
      p.pos = { ...spawnPos };
      p.vel = vec2();
      p.invulnerableTime = 4.0;
      p.isWreck = false;
      p.wreckTimer = undefined;
      p.targetId = undefined;
      p.statusEffects = [];
    }
    this.predictedPlayer.pos = { ...spawnPos };
    this.predictedPlayer.vel = vec2();
  }

  sendCommand(command: SimCommand): void {
    const seq = ++this.commandSeq;
    const inst = this.realm.getInstance(this.currentMapId);

    // Queue for authoritative simulation step
    this.commandQueue.push(command);
    this.pendingCommands.push({ seq, tick: inst.world.tick, command });

    // Client-side prediction for drive input
    if (command.type === 'Drive') {
      const len = Math.hypot(command.x, command.y);
      if (len > 0.05) {
        this.predictedPlayer.desiredDriveAngle = Math.atan2(command.y, command.x);
        this.predictedPlayer.targetSpeed = Math.min(1, len) * this.predictedPlayer.maxSpeed;

        // Immediate responsive turn towards stick
        const diff = angleDiff(this.predictedPlayer.desiredDriveAngle, this.predictedPlayer.chassisAngle);
        const turnStep = this.predictedPlayer.turnRate * 0.033;
        this.predictedPlayer.chassisAngle += clamp(diff, -turnStep, turnStep);

      } else {
        this.predictedPlayer.desiredDriveAngle = undefined;
        this.predictedPlayer.targetSpeed = 0;
      }
    } else if (command.type === 'SetTarget') {
      this.predictedPlayer.targetId = command.targetId ?? undefined;
    } else if (command.type === 'ToggleAutoFire') {
      this.predictedPlayer.autoFire = !this.predictedPlayer.autoFire;
    } else if (command.type === 'SelectAmmo') {
      this.predictedPlayer.selectedAmmo = command.ammo;
    }
  }

  getSnapshot(): WorldSnapshot | null {
    return this.latestAuthoritativeSnapshot;
  }

  /** Looks an entity up in the authoritative world (the victim of a kill event is still there as a wreck). */
  getEntity(id: number): SimEntity | undefined {
    return this.realm.getInstance(this.currentMapId).world.entities.get(id);
  }

  getPredictedPlayer(): SimEntity | null {
    return this.predictedPlayer;
  }

  onEvent(handler: (event: SimEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  switchMap(targetMapId: string, gateId: string) {
    const inst = this.realm.getInstance(this.currentMapId);
    const player = inst.getPlayer(this.playerId);
    if (!player) return;

    const { targetInstance, newPos } = this.realm.routeGate(
      this.currentMapId,
      gateId,
      targetMapId,
      player
    );

    this.currentMapId = targetMapId;
    this.clientWorld.mapId = targetMapId;
    this.clientWorld.mapDef = targetInstance.mapDef;
    this.predictedPlayer.pos = { ...newPos };
    this.predictedPlayer.vel = vec2();

    this.syncAuthoritativeSnapshot();

    this.localChat.push({
      id: `msg_map_enter_${Date.now()}`,
        sender: 'HQ DISPATCH',
        clanTag: 'CMD',
        channel: 'S',
        text: `Entered zone: ${targetInstance.mapDef.name}.`,
        timestamp: targetInstance.world.time,
    });
    this.syncAuthoritativeSnapshot();
  }

  fastTravelToMap(targetMapId: string) {
    const inst = this.realm.getInstance(this.currentMapId);
    const player = inst.getPlayer(this.playerId);
    if (!player) return;

    const { targetInstance, newPos } = this.realm.teleportPlayer(
      this.currentMapId,
      targetMapId,
      player
    );

    this.currentMapId = targetMapId;
    this.clientWorld.mapId = targetMapId;
    this.clientWorld.mapDef = targetInstance.mapDef;
    this.predictedPlayer.pos = { ...newPos };
    this.predictedPlayer.vel = vec2();

    this.syncAuthoritativeSnapshot();

    this.localChat.push({
      id: `msg_map_travel_${Date.now()}`,
        sender: 'HQ DISPATCH',
        clanTag: 'CMD',
        channel: 'S',
        text: `Fast traveled to zone: ${targetInstance.mapDef.name}.`,
        timestamp: targetInstance.world.time,
    });
    this.syncAuthoritativeSnapshot();
  }

  updateProfile(profile: UserProfile) {
    const stats = this.realm.createPlayerEntity(this.playerId, profile.playerName, profile.character);
    const inst = this.realm.getInstance(this.currentMapId);
    const p = inst.getPlayer(this.playerId);
    if (!p) return;
    const hullRatio = p.maxHull > 0 ? p.hull / p.maxHull : 1;
    const armorRatio = p.maxArmor > 0 ? p.armor / p.maxArmor : 1;
    Object.assign(p, {
      maxHull: stats.maxHull,
      maxArmor: stats.maxArmor,
      maxSpeed: stats.maxSpeed,
      turnRate: stats.turnRate,
      turretTurnRate: stats.turretTurnRate,
      mainReloadTime: stats.mainReloadTime,
      mainDamage: stats.mainDamage,
      mainRange: stats.mainRange,
      mgDamage: stats.mgDamage,
      mgRange: stats.mgRange,
      critChance: stats.critChance,
      flatArmorReduction: stats.flatArmorReduction,
      level: profile.character.level,
      vehicleClass: stats.vehicleClass,
      tier: stats.tier,
      radius: stats.radius,
    });
    if (p.hull > 0) {
      p.hull = Math.round(p.maxHull * hullRatio);
      p.armor = Math.round(p.maxArmor * armorRatio);
    }
    // Purchases raise the stack; ammo spent in combat is not refunded.
    for (const k of Object.keys(profile.ammoInventory) as Array<keyof typeof profile.ammoInventory>) {
      if (k === 'STANDARD') continue;
      p.ammoInventory[k] = Math.max(p.ammoInventory[k] ?? 0, profile.ammoInventory[k] ?? 0);
    }
    this.predictedPlayer.maxHull = p.maxHull;
    this.predictedPlayer.maxArmor = p.maxArmor;
  }

  disconnect(): void {
    if (this.simIntervalId) {
      clearInterval(this.simIntervalId);
      this.simIntervalId = null;
    }
  }

  getTickStats() {
    const inst = this.realm.getInstance(this.currentMapId);
    return {
      fps: 60,
      tickTime: Math.round(this.lastTickDuration * 10) / 10,
      entityCount: inst.world.entities.size,
      tickRate: this.currentTps,
    };
  }
}

/**
 * Marked stub for RemoteGameClient for multi-player server connectivity.
 */
export class RemoteGameClient implements GameClient {
  readonly playerId = 10001;
  private transport: WebSocketTransport;
  private latestSnapshot: WorldSnapshot | null = null;
  private eventHandlers = new Set<(event: SimEvent) => void>();

  constructor(serverUrl = '/api/game/ws') {
    this.transport = new WebSocketTransport(serverUrl);
    this.transport.onMessage((msg) => {
      if (msg.type === 'Snapshot') {
        this.latestSnapshot = msg.snapshot;
      } else if (msg.type === 'Event') {
        for (const h of this.eventHandlers) h(msg.event);
      }
    });
  }

  async connect() {
    await this.transport.connect();
  }

  sendCommand(command: SimCommand): void {
    this.transport.send({
      type: 'Command',
      seq: 1,
      tick: 0,
      command,
    });
  }

  getSnapshot(): WorldSnapshot | null {
    return this.latestSnapshot;
  }

  getPredictedPlayer(): SimEntity | null {
    return null;
  }

  getEntity(): SimEntity | undefined {
    return undefined;
  }

  onEvent(handler: (event: SimEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  switchMap(targetMapId: string, gateId: string): void {
    // Remote command to switch instance
  }

  fastTravelToMap(targetMapId: string): void {
    // Remote command to travel to instance
  }

  updateProfile(profile: UserProfile): void {

    // Send updated loadout to remote server
  }

  disconnect(): void {
    this.transport.disconnect();
  }

  getTickStats() {
    return { fps: 60, tickTime: 0, entityCount: 0, tickRate: 30 };
  }
}
