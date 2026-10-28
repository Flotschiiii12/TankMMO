/**
 * Plausibility checks on top of the authoritative simulation. The sim already derives positions and shots from
 * validated commands, so these are a second line of defence: they catch sim bugs, memory-edited state and any future
 * code path that moves an entity or spawns a shell without going through the normal rules. Corrections are graceful
 * (put the vehicle back / drop the shell, count it for the anti-cheat score); nobody is kicked.
 */
import type { SimEntity, SimEvent } from '../shared/types.ts';
import { SIM_TIMESTEP } from '../shared/types.ts';

export interface PlausibilityStats { moveCorrections: number; shotsDropped: number; maxMoveRatio: number }

/** Largest believable displacement of a vehicle in one tick: boost/knockback/collision slack on top of top speed. */
export function movementBound(ent: Pick<SimEntity, 'maxSpeed' | 'radius'>, dt = SIM_TIMESTEP): number {
  // 4 radii + 60: crowds stacked on a spawn point are pushed apart by the collision solver in a single tick
  return ent.maxSpeed * 3 * dt + ent.radius * 4 + 60;
}

/** Returns the position to restore when the vehicle moved implausibly far since `last`, otherwise undefined. */
export function teleportCorrection(ent: Pick<SimEntity, 'pos' | 'maxSpeed' | 'radius'>, last: { x: number; y: number } | undefined): { x: number; y: number } | undefined {
  if (!last) return undefined;
  const d = Math.hypot(ent.pos.x - last.x, ent.pos.y - last.y);
  return d > movementBound(ent) ? { x: last.x, y: last.y } : undefined;
}

export interface ShotCheck { ok: boolean; reason?: 'no_shooter' | 'origin' | 'rate' | 'range' | 'speed' }

/** `lastShotAt` is the sim time of the shooter's previous shell (or -Infinity). */
export function checkShot(ev: Extract<SimEvent, { type: 'projectile_fired' }>, shooter: SimEntity | undefined, lastShotAt: number, now: number): ShotCheck {
  if (!shooter) return { ok: false, reason: 'no_shooter' };
  if (!ev.isSecondary) {
    if (Math.hypot(ev.pos.x - shooter.pos.x, ev.pos.y - shooter.pos.y) > shooter.radius + 12 + movementBound(shooter) + 8) return { ok: false, reason: 'origin' };
    if (now - lastShotAt < shooter.mainReloadTime * 0.5 - SIM_TIMESTEP) return { ok: false, reason: 'rate' };
    if (ev.range > shooter.mainRange * 1.6 + 1) return { ok: false, reason: 'range' };
    if (ev.speed > 2500) return { ok: false, reason: 'speed' };
  }
  return { ok: true };
}
