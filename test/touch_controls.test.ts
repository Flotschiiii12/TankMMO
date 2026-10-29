import { describe, expect, it } from 'vitest';
import { applyJoystickCurve, JOYSTICK_DEADZONE } from '../src/ui/touchInput.ts';

describe('touch joystick curve', () => {
  it('ignores small movements inside the dead zone', () => {
    expect(applyJoystickCurve(JOYSTICK_DEADZONE * 80, 0, 80)).toEqual({ x: 0, y: 0 });
  });

  it('smoothly remaps the remaining travel and preserves direction', () => {
    const mid = applyJoystickCurve(40, 0, 80);
    const full = applyJoystickCurve(80, 0, 80);
    const diagonal = applyJoystickCurve(80, 80, 80);
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(1);
    expect(full).toEqual({ x: 1, y: 0 });
    expect(diagonal.x).toBeCloseTo(diagonal.y);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeLessThanOrEqual(1);
    expect(applyJoystickCurve(20, 20, 0)).toEqual({ x: 0, y: 0 });
  });
});
