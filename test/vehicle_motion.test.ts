import { describe, expect, it } from 'vitest';
import { createVehicleMotionState, updateVehicleMotion, type VehicleMotionInput } from '../src/render/vehicleMotion.ts';

const vehicle = (overrides: Partial<VehicleMotionInput> = {}): VehicleMotionInput => ({
  id: 1,
  kind: 'player',
  chassisAngle: 0,
  turretAngle: 0,
  vel: { x: 0, y: 0 },
  maxSpeed: 100,
  ...overrides,
});

describe('client vehicle motion', () => {
  it('smooths turret rotation and responds visually to chassis turns and acceleration', () => {
    const state = createVehicleMotionState(vehicle(), 0);
    const moving = vehicle({ chassisAngle: 0.1, turretAngle: 1, vel: { x: 30, y: 0 } });
    const pose = updateVehicleMotion(state, moving, 0.04, 1, 1);

    expect(pose.turretAngle).toBeGreaterThan(0);
    expect(pose.turretAngle).toBeLessThan(1);
    expect(pose.hullLean).not.toBe(0);
    expect(pose.hullOffset).toBeLessThan(0);
    expect(pose.bob).not.toBe(0);
  });

  it('removes all added motion when reduced motion is active', () => {
    const state = createVehicleMotionState(vehicle(), 0);
    const pose = updateVehicleMotion(state, vehicle({ turretAngle: 1 }), 0.04, 2, 0);

    expect(pose).toEqual({ hullLean: 0, hullOffset: 0, hullScaleY: 1, bob: 0, turretAngle: 1 });
  });

  it('strongly reduces hull motion at low quality', () => {
    const input = vehicle({ chassisAngle: 0.1, vel: { x: 30, y: 0 } });
    const high = updateVehicleMotion(createVehicleMotionState(vehicle(), 0), input, 0.04, 1, 1);
    const low = updateVehicleMotion(createVehicleMotionState(vehicle(), 0), input, 0.04, 1, 0.35);

    expect(Math.abs(low.hullLean)).toBeLessThan(Math.abs(high.hullLean));
    expect(Math.abs(low.bob)).toBeLessThan(Math.abs(high.bob));
  });
});
