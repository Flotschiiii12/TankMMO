import { describe, expect, it } from 'vitest';
import {
  clampToBounds,
  resolveObstacleCollision,
  resolveVehicleSoftPush,
} from '../shared/rules/collision.ts';
import { MapObstacle } from '../shared/types.ts';

describe('Collision & Movement Rules (Section 2)', () => {
  it('prevents vehicle penetration into solid obstacles', () => {
    const obstacles: MapObstacle[] = [
      { x: 300, y: 300, radius: 40, type: 'rock' },
    ];

    // Vehicle attempts to stand at x: 310, y: 300 with radius 25 (deep penetration)
    const res = resolveObstacleCollision({ x: 310, y: 300 }, 25, obstacles);
    expect(res.collided).toBe(true);

    const distAfter = Math.hypot(res.pos.x - 300, res.pos.y - 300);
    expect(distAfter).toBeGreaterThanOrEqual(65 - 0.001); // 40 + 25
  });

  it('applies slow factor in water zones without blocking motion', () => {
    const obstacles: MapObstacle[] = [
      { x: 500, y: 500, radius: 100, type: 'water', slowFactor: 0.6 },
    ];

    const res = resolveObstacleCollision({ x: 520, y: 500 }, 25, obstacles);
    expect(res.slowFactor).toBe(0.6);
    expect(res.collided).toBe(false); // Does not hard block
  });

  it('applies soft push separation between overlapping vehicles', () => {
    const posA = { x: 100, y: 100 };
    const posB = { x: 130, y: 100 };
    const radiusA = 25;
    const radiusB = 25; // minDist = 50, currently dist = 30 -> overlap = 20

    const push = resolveVehicleSoftPush(posA, radiusA, posB, radiusB, 0.5);
    expect(push.overlapping).toBe(true);
    expect(push.offsetA.x).toBeLessThan(0); // Pushed left
    expect(push.offsetB.x).toBeGreaterThan(0); // Pushed right
  });

  it('clamps coordinates to world bounds', () => {
    const clamped = clampToBounds({ x: -50, y: 5050 }, 30, 4000, 4000);
    expect(clamped.x).toBe(30);
    expect(clamped.y).toBe(3970);
  });
});
