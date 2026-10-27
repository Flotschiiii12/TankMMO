/**
 * Treadfront - Collision and Movement Rules
 * Circle-obstacle, circle-circle soft push, and terrain zone checks.
 */

import { clamp, dist, distSq, MapObstacle, Vec2, vec2 } from '../types.ts';

export interface CollisionResult {
  pos: Vec2;
  collided: boolean;
  slowFactor: number;
}

/**
 * Resolves vehicle collision against static map obstacles.
 */
export function resolveObstacleCollision(
  pos: Vec2,
  radius: number,
  obstacles: readonly MapObstacle[]
): CollisionResult {
  let adjustedPos = { x: pos.x, y: pos.y };
  let collided = false;
  let slowFactor = 1.0;

  for (const obs of obstacles) {
    const dSq = distSq(adjustedPos, obs);
    const minDist = radius + obs.radius;

    if (obs.type === 'water') {
      // Water is a slow zone, does not hard block
      if (dSq < minDist * minDist) {
        slowFactor = Math.min(slowFactor, obs.slowFactor || 0.6);
      }
      continue;
    }

    if (dSq < minDist * minDist) {
      const d = Math.sqrt(dSq);
      collided = true;
      if (d > 0.0001) {
        const overlap = minDist - d;
        const nx = (adjustedPos.x - obs.x) / d;
        const ny = (adjustedPos.y - obs.y) / d;
        adjustedPos.x += nx * overlap;
        adjustedPos.y += ny * overlap;
      } else {
        adjustedPos.x += minDist;
      }
    }
  }

  return { pos: adjustedPos, collided, slowFactor };
}

/**
 * Resolves soft push between two vehicles.
 */
export function resolveVehicleSoftPush(
  posA: Vec2,
  radiusA: number,
  posB: Vec2,
  radiusB: number,
  pushStrength = 0.5
): { offsetA: Vec2; offsetB: Vec2; overlapping: boolean } {
  const dSq = distSq(posA, posB);
  const minDist = radiusA + radiusB;

  if (dSq >= minDist * minDist || dSq === 0) {
    return { offsetA: vec2(), offsetB: vec2(), overlapping: false };
  }

  const d = Math.sqrt(dSq);
  const overlap = minDist - d;
  const nx = (posA.x - posB.x) / d;
  const ny = (posA.y - posB.y) / d;

  const pushAmount = overlap * pushStrength;

  return {
    offsetA: { x: nx * pushAmount, y: ny * pushAmount },
    offsetB: { x: -nx * pushAmount, y: -ny * pushAmount },
    overlapping: true,
  };
}

/**
 * Clamps position to map bounds.
 */
export function clampToBounds(pos: Vec2, radius: number, mapWidth: number, mapHeight: number): Vec2 {
  return {
    x: clamp(pos.x, radius, mapWidth - radius),
    y: clamp(pos.y, radius, mapHeight - radius),
  };
}
