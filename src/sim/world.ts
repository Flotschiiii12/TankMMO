// The client no longer has its own simulation: this module adapts the shared deterministic world
// (/shared/sim) to the client's map catalog and keeps the old import paths working.
import { MAP_CATALOG } from '../data/maps.ts';
import { getMapById } from '../../shared/data/maps.ts';
import {
  createWorld as createSharedWorld,
  isPosInSafeZone,
  stepWorld,
  World,
} from '../../shared/sim/world.ts';
import { spawnEnemy, spawnBoss } from '../../shared/sim/pve.ts';
import { SIM_TIMESTEP } from '../../shared/types.ts';
import { Vec2 } from './types.ts';

export type { World };
export { SIM_TIMESTEP, stepWorld, spawnEnemy, spawnBoss };
export const isInSafeZone = isPosInSafeZone;

/** Resolves legacy string ids ('green_valley', 'map_3', '3') to the shared numeric map id. */
export function resolveMapNumericId(mapId: string | number): number {
  const def = MAP_CATALOG[mapId] || MAP_CATALOG['green_valley'];
  return def.numericId || 1;
}

export function createWorld(mapId: string | number = 'green_valley', seed = 42): World {
  return createSharedWorld({ map: getMapById(resolveMapNumericId(mapId)), seed, clockOffset: Math.floor(Date.now() / 1000) });
}

export function spawnDebugTargetEnemies(world: World, playerPos: Vec2) {
  spawnEnemy(world, 'scout_buggy', 2, { x: playerPos.x + 440, y: playerPos.y + 200 });
  spawnEnemy(world, 'gunner_truck', 3, { x: playerPos.x - 440, y: playerPos.y + 200 });
  spawnEnemy(world, 'loot_convoy', 4, { x: playerPos.x + 500, y: playerPos.y - 300 });
}
