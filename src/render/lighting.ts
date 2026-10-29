import { DEFAULT_SUN_DIRECTION, type TimeOfDay } from '../../shared/types.ts';

export interface AmbientTint {
  r: number;
  g: number;
  b: number;
  a: number;
}

const TIME_TINTS: Record<TimeOfDay, AmbientTint> = {
  dawn: { r: 255, g: 176, b: 125, a: 0.08 },
  noon: { r: 255, g: 247, b: 225, a: 0 },
  sunset: { r: 255, g: 125, b: 75, a: 0.13 },
  dusk: { r: 74, g: 72, b: 132, a: 0.19 },
  night: { r: 18, g: 30, b: 67, a: 0.38 },
};

export function ambientTintForTimeOfDay(timeOfDay?: TimeOfDay): AmbientTint {
  return TIME_TINTS[timeOfDay ?? 'noon'];
}

export function blendAmbientTint(current: AmbientTint, target: AmbientTint, deltaSeconds: number): AmbientTint {
  const amount = 1 - Math.exp(-Math.max(0, deltaSeconds) / 3.5);
  return {
    r: current.r + (target.r - current.r) * amount,
    g: current.g + (target.g - current.g) * amount,
    b: current.b + (target.b - current.b) * amount,
    a: current.a + (target.a - current.a) * amount,
  };
}

export function ambientTintCss(tint: AmbientTint): string {
  return `rgba(${Math.round(tint.r)}, ${Math.round(tint.g)}, ${Math.round(tint.b)}, ${tint.a})`;
}
