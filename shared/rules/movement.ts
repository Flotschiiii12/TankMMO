/**
 * Pace tuning. Vehicles used to reach full speed within one tick, which felt twitchy.
 * Now they accelerate/brake over a second or so (DarkOrbit / Seafight style: heavier, calmer).
 */
export const PACE = {
  /** seconds to reach full speed from standstill */
  accelTime: 1.1,
  /** seconds to stop from full speed */
  brakeTime: 0.6,
  /** multiplier applied to enemy speeds from the archetype tables */
  enemySpeed: 0.75,
  /** base vehicle speed (units/s) and turn rate (rad/s) before class/tier modifiers */
  baseSpeed: 125,
  baseTurnRate: 1.7,
  /** multiplier on main cannon reload times */
  reloadScale: 1.3,
};

/** Move `current` toward `target` with constant acceleration (braking is faster than accelerating). */
export function approachSpeed(current: number, target: number, maxSpeed: number, dt: number): number {
  const ref = Math.max(1, maxSpeed);
  const rate = target >= current ? ref / PACE.accelTime : ref / PACE.brakeTime;
  const step = rate * dt;
  if (Math.abs(target - current) <= step) return target;
  return current + Math.sign(target - current) * step;
}
