/**
 * Treadfront - Network Protocol Definitions
 * Strict types for Client-Server and Sim messages.
 */

import { AbilityId, AmmoType, ChatMessage, SimCommand, SimEntity, SimEvent, Vec2 } from './types.ts';

export const PROTOCOL_VERSION = '1.0.0';

// ==========================================
// Client -> Server Messages
// ==========================================

export interface ClientInputPacket {
  type: 'c_input';
  seq: number;
  commands: SimCommand[];
  clientTime: number;
}

export interface ClientChatPacket {
  type: 'c_chat';
  channel: 'G' | 'M' | 'F' | 'C' | 'P';
  text: string;
  targetRecipient?: string;
}

export interface ClientJoinPacket {
  type: 'c_join';
  protocolVersion: string;
  accountId: string;
  secret: string;
  selectedVehicleId?: string;
}

export interface ClientPingPacket {
  type: 'c_ping';
  timestamp: number;
}

export type ClientMessage =
  | ClientInputPacket
  | ClientChatPacket
  | ClientJoinPacket
  | ClientPingPacket;

// ==========================================
// Server -> Client Messages
// ==========================================

export interface EntitySnapshot {
  id: number;
  kind: string;
  name: string;
  clanTag?: string;
  level: number;
  pos: Vec2;
  vel: Vec2;
  chassisAngle: number;
  turretAngle: number;
  radius: number;
  hull: number;
  maxHull: number;
  armor: number;
  maxArmor: number;
  targetId?: number;
  isHostile: boolean;
  invulnerable: boolean;
}

export interface ServerSnapshotPacket {
  type: 's_snapshot';
  tick: number;
  lastProcessedSeq: number;
  serverTime: number;
  entities: EntitySnapshot[];
  events: SimEvent[];
}

export interface ServerDeltaPacket {
  type: 's_delta';
  tick: number;
  lastProcessedSeq: number;
  serverTime: number;
  updated: Partial<EntitySnapshot>[];
  removedIds: number[];
  events: SimEvent[];
}

export interface ServerWelcomePacket {
  type: 's_welcome';
  protocolVersion: string;
  assignedEntityId: number;
  mapId: string;
  serverTick: number;
}

export interface ServerChatPacket {
  type: 's_chat';
  message: ChatMessage;
}

export interface ServerErrorPacket {
  type: 's_error';
  code: string;
  message: string;
  critical?: boolean;
}

export interface ServerPongPacket {
  type: 's_pong';
  originalTimestamp: number;
  serverTimestamp: number;
}

export type ServerMessage =
  | ServerSnapshotPacket
  | ServerDeltaPacket
  | ServerWelcomePacket
  | ServerChatPacket
  | ServerErrorPacket
  | ServerPongPacket;
