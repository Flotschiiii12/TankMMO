import { ChatMessage, distSq, SimEntity, SimEvent } from './types.ts';
import type { MapDef } from './types.ts';
import type { World } from '../../shared/sim/world.ts';

export interface WorldSnapshot {
  tick: number;
  time: number;
  mapId: string;
  entities: SimEntity[];
  events: SimEvent[];
  chatHistory: ChatMessage[];
}

/** What the renderer/UI see: the entities of a snapshot plus the map view model. */
export interface ClientWorld {
  id: string;
  mapId: string;
  tick: number;
  time: number;
  entities: Map<number, SimEntity>;
  events: SimEvent[];
  chatHistory: ChatMessage[];
  mapDef: MapDef;
}

/** Serializes entities within interest radius of the viewer (server-ready). */
export function serializeSnapshot(world: World, viewerId?: number, interestRadius = 2400): WorldSnapshot {
  const viewer = viewerId !== undefined ? world.entities.get(viewerId) : undefined;
  const radiusSq = interestRadius * interestRadius;
  const relevant: SimEntity[] = [];
  for (const e of world.entities.values()) {
    if (!viewer || e.id === viewer.id || e.kind === 'boss' || e.kind === 'gate' || distSq(e.pos, viewer.pos) <= radiusSq) {
      relevant.push({ ...e });
    }
  }
  return {
    tick: world.tick,
    time: world.time,
    mapId: world.mapId,
    entities: relevant,
    events: [...world.events],
    chatHistory: [...world.chat],
  };
}

export function applySnapshot(target: ClientWorld, snapshot: WorldSnapshot) {
  target.tick = snapshot.tick;
  target.time = snapshot.time;
  target.mapId = snapshot.mapId;
  const received = new Set<number>();
  for (const ent of snapshot.entities) {
    received.add(ent.id);
    const existing = target.entities.get(ent.id);
    if (existing) Object.assign(existing, ent);
    else target.entities.set(ent.id, { ...ent });
  }
  for (const id of Array.from(target.entities.keys())) if (!received.has(id)) target.entities.delete(id);
  target.events = [...snapshot.events];
  target.chatHistory = [...snapshot.chatHistory];
}
