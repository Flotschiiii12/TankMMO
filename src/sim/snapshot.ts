import { ChatMessage, distSq, SimEntity, SimEvent } from './types.ts';
import type { World } from './world.ts';

export interface WorldSnapshot {
  tick: number;
  time: number;
  mapId: string;
  entities: SimEntity[];
  events: SimEvent[];
  chatHistory: ChatMessage[];
}

export interface EntityDelta {
  id: number;
  pos?: { x: number; y: number };
  vel?: { x: number; y: number };
  chassisAngle?: number;
  turretAngle?: number;
  hull?: number;
  armor?: number;
}

/**
 * Serializes entities within interest radius of viewer.
 * Ready for server-authoritative client streaming.
 */
export function serializeSnapshot(
  world: World,
  viewerId?: number,
  interestRadius = 2400
): WorldSnapshot {
  const viewer = viewerId !== undefined ? world.entities.get(viewerId) : undefined;
  const radiusSq = interestRadius * interestRadius;

  const relevantEntities: SimEntity[] = [];

  for (const entity of world.entities.values()) {
    if (viewer) {
      // Always include player, boss, and entities in proximity
      if (
        entity.id === viewer.id ||
        entity.kind === 'boss' ||
        entity.kind === 'gate' ||
        distSq(entity.pos, viewer.pos) <= radiusSq
      ) {
        // Return pure plain copy
        relevantEntities.push({ ...entity });
      }
    } else {
      relevantEntities.push({ ...entity });
    }
  }

  return {
    tick: world.tick,
    time: world.time,
    mapId: world.mapId,
    entities: relevantEntities,
    events: [...world.events],
    chatHistory: [...world.chatHistory],
  };
}

/**
 * Applies a remote/local snapshot onto a client world representation.
 */
export function applySnapshot(targetWorld: World, snapshot: WorldSnapshot) {
  targetWorld.tick = snapshot.tick;
  targetWorld.time = snapshot.time;
  targetWorld.mapId = snapshot.mapId;

  const receivedIds = new Set<number>();
  for (const ent of snapshot.entities) {
    receivedIds.add(ent.id);
    const existing = targetWorld.entities.get(ent.id);
    if (existing) {
      Object.assign(existing, ent);
    } else {
      targetWorld.entities.set(ent.id, { ...ent });
    }
  }

  // Remove entities not in snapshot (if viewer was nearby or entity died)
  for (const id of Array.from(targetWorld.entities.keys())) {
    if (!receivedIds.has(id)) {
      targetWorld.entities.delete(id);
    }
  }

  targetWorld.events = [...snapshot.events];
  targetWorld.chatHistory = [...snapshot.chatHistory];
}
