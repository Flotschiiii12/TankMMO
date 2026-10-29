import { describe, expect, it } from 'vitest';
import { getMapById } from '../shared/data/maps.ts';
import { createWorld } from '../shared/sim/world.ts';

describe('hub quest givers', () => {
  it('spawns one stationary, safe quest giver in Crossfield and each home map', () => {
    for (const mapId of [1, 5, 9, 13]) {
      const map = getMapById(mapId);
      const world = createWorld({ map });
      const givers = Array.from(world.entities.values()).filter((e) => e.questGiverId);
      expect(givers).toHaveLength(1);
      const giver = givers[0];
      expect(giver.kind).toBe('npc_driver');
      expect(giver.isHostile).toBe(false);
      expect(giver.maxSpeed).toBe(0);
      expect(world.safeZones.some((zone) => (giver.pos.x - zone.x) ** 2 + (giver.pos.y - zone.y) ** 2 < zone.radius ** 2)).toBe(true);

      const replay = createWorld({ map });
      const replayGiver = Array.from(replay.entities.values()).find((e) => e.questGiverId);
      expect(replayGiver && [replayGiver.questGiverId, replayGiver.pos]).toEqual([giver.questGiverId, giver.pos]);
    }
  });
});
