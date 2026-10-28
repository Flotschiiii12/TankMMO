/**
 * Treadfront - Network Protocol Definitions
 * Strict types for Client-Server and Sim messages.
 */

import { AbilityId, AmmoType, ChatMessage, SimCommand, SimEntity, SimEvent, Vec2 } from './types.ts';
import type { EntityPatch } from './net/delta.ts';
import type { CharacterState } from './rules/character.ts';
import type { ClientAction } from './rules/actions.ts';

/** Bump on breaking changes; the server rejects clients below MIN_PROTOCOL_VERSION with s_error 'update_required'. */
export const PROTOCOL_VERSION = '1.1.0';
export const MIN_PROTOCOL_VERSION = '1.1.0';

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
  channel: 'G' | 'M' | 'F' | 'C' | 'A' | 'P' | 'W' | 'T';
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

/** Workshop, garage, talents, quests... all validated and executed server-side with the shared rules. */
export interface ClientActionPacket {
  type: 'c_action';
  id: number; // echoed in the result
  action: ClientAction;
}

export type SocialOp =
  | { op: 'friend_request'; name: string }
  | { op: 'friend_accept'; name: string }
  | { op: 'friend_remove'; name: string }
  | { op: 'friend_list' }
  | { op: 'block'; name: string }
  | { op: 'unblock'; name: string }
  | { op: 'block_list' }
  | { op: 'report'; name: string; reason: string }
  | { op: 'party_invite'; name: string }
  | { op: 'party_accept'; name: string }
  | { op: 'party_leave' }
  | { op: 'party_kick'; name: string }
  | { op: 'party_info' }
  | { op: 'clan_create'; name: string; tag: string; emblem?: string }
  | { op: 'clan_emblem'; emblem: string }
  | { op: 'clan_invite'; name: string }
  | { op: 'clan_accept'; clanId: number }
  | { op: 'clan_invites' }
  | { op: 'clan_leave' }
  | { op: 'clan_kick'; name: string }
  | { op: 'clan_role'; name: string; role: 'officer' | 'member' | 'leader' }
  | { op: 'clan_info' }
  | { op: 'clan_donate'; amount: number }
  | { op: 'clan_research'; id: string }
  | { op: 'clan_storage' }
  | { op: 'clan_deposit'; uid: string }
  | { op: 'clan_withdraw'; id: number }
  | { op: 'clan_storage_policy'; minRole: 'member' | 'officer' | 'leader' }
  | { op: 'clan_allies' }
  | { op: 'clan_ally_propose'; tag: string }
  | { op: 'clan_ally_accept'; clanId: number }
  | { op: 'clan_ally_decline'; clanId: number }
  | { op: 'clan_ally_break'; clanId: number }
  | { op: 'profile'; name: string }
  | { op: 'ranking'; kind: 'level' | 'clans' | 'arena_1v1' | 'arena_3v3' | 'arena_5v5' | 'honor' }
  | { op: 'arena_queue'; mode: '1v1' | '3v3' | '5v5' }
  | { op: 'arena_leave' }
  | { op: 'arena_status' }
  | { op: 'spectate_list' }
  | { op: 'spectate_join'; matchId: string }
  | { op: 'spectate_leave' }
  | { op: 'war_status' }
  | { op: 'war_claim' }
  | { op: 'war_claim' }
  | { op: 'ah_sell'; uid: string; price: number; hours: number }
  | { op: 'ah_search'; defId?: string; slot?: string; maxPrice?: number }
  | { op: 'ah_mine' }
  | { op: 'ah_buy'; id: number }
  | { op: 'ah_cancel'; id: number }
  | { op: 'mail_list' }
  | { op: 'mail_claim'; id: number }
  | { op: 'trade_open'; name: string }
  | { op: 'trade_set'; items: string[]; scrap: number }
  | { op: 'trade_confirm' }
  | { op: 'trade_cancel' }
  | { op: 'trade_info' }
  | { op: 'fast_travel'; mapId: number }
  | { op: 'dungeon_enter'; dungeonId: string }
  | { op: 'dungeon_leave' }
  | { op: 'dungeon_list' }
  | { op: 'shop_list' }
  | { op: 'shop_buy'; productId: string }
  | { op: 'shop_receipt'; platform: 'apple' | 'google'; receipt: string };

export interface ClientSocialPacket {
  type: 'c_social';
  id: number;
  req: SocialOp;
}

export interface ServerSocialResultPacket {
  type: 's_social_result';
  id: number;
  ok: boolean;
  error?: string;
  data?: any;
}

export interface ServerSocialEventPacket {
  type: 's_social_event';
  kind: 'pvp_summary' | 'event_reward' | 'clan_storage' | 'clan_allies' | 'friend_request' | 'friend_accepted' | 'party_invite' | 'party_update' | 'clan_invite' | 'announcement' | 'arena_start' | 'arena_round' | 'arena_phase' | 'arena_result' | 'war_result' | 'trade_update' | 'mail' | 'achievement' | 'dungeon';
  data: any;
}

export type ClientMessage =
  | ClientSocialPacket
  | ClientActionPacket
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

/** Authoritative state for one client: entity patches (delta-encoded), removed ids and sim events. */
export interface ServerStatePacket {
  type: 's_state';
  tick: number;
  lastProcessedSeq: number;
  serverTime: number;
  patches: EntityPatch[];
  removed: number[];
  events: SimEvent[];
}

export interface ServerCharacterPacket {
  type: 's_character';
  character: CharacterState;
  ammo: Record<AmmoType, number>;
}

export interface ServerActionResultPacket {
  type: 's_action_result';
  id: number;
  ok: boolean;
  error?: string;
}

export interface ServerMapPacket {
  type: 's_map';
  mapId: number;
  instanceId: string;
  assignedEntityId: number;
  /** true: the client watches an arena match (no own vehicle, delayed stream) */
  spectate?: boolean;
}

export type ServerMessage =
  | ServerSocialResultPacket
  | ServerSocialEventPacket
  | ServerStatePacket
  | ServerCharacterPacket
  | ServerActionResultPacket
  | ServerMapPacket
  | ServerSnapshotPacket
  | ServerDeltaPacket
  | ServerWelcomePacket
  | ServerChatPacket
  | ServerErrorPacket
  | ServerPongPacket;
