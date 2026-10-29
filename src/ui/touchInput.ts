import { clamp } from '../sim/types.ts';

export interface StickVector {
  x: number;
  y: number;
}

export const JOYSTICK_DEADZONE = 0.12;

export function applyJoystickCurve(dx: number, dy: number, maxRadius: number): StickVector {
  if (maxRadius <= 0) return { x: 0, y: 0 };
  const distance = Math.hypot(dx, dy);
  const magnitude = clamp(distance / maxRadius, 0, 1);
  if (magnitude <= JOYSTICK_DEADZONE || distance === 0) return { x: 0, y: 0 };

  const remapped = (magnitude - JOYSTICK_DEADZONE) / (1 - JOYSTICK_DEADZONE);
  const curved = 0.65 * remapped + 0.35 * remapped ** 3;
  return { x: (dx / distance) * curved, y: (dy / distance) * curved };
}
