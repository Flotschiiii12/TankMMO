import { clamp } from '../sim/types.ts';

export interface VehicleMotionInput {
  id: number;
  kind: string;
  chassisAngle: number;
  turretAngle: number;
  vel: { x: number; y: number };
  maxSpeed: number;
}

export interface VehicleMotionState {
  kind: string;
  lastSpeed: number;
  lastChassisAngle: number;
  turretAngle: number;
  turretVelocity: number;
  updatedAt: number;
}

export interface VehicleVisualMotion {
  hullLean: number;
  hullOffset: number;
  hullScaleY: number;
  bob: number;
  turretAngle: number;
}

const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

export function createVehicleMotionState(entity: VehicleMotionInput, now: number): VehicleMotionState {
  return {
    kind: entity.kind,
    lastSpeed: Math.hypot(entity.vel.x, entity.vel.y),
    lastChassisAngle: entity.chassisAngle,
    turretAngle: entity.turretAngle,
    turretVelocity: 0,
    updatedAt: now,
  };
}

export function updateVehicleMotion(
  state: VehicleMotionState,
  entity: VehicleMotionInput,
  now: number,
  animationTime: number,
  strength: number,
): VehicleVisualMotion {
  const dt = clamp(now - state.updatedAt, 0, 0.05);
  const speed = Math.hypot(entity.vel.x, entity.vel.y);
  const turnRate = dt > 0 ? clamp(wrapAngle(entity.chassisAngle - state.lastChassisAngle) / dt, -2.5, 2.5) : 0;
  const acceleration = dt > 0 ? clamp((speed - state.lastSpeed) / dt, -300, 300) : 0;
  const amount = clamp(strength, 0, 1);

  state.updatedAt = now;
  state.lastSpeed = speed;
  state.lastChassisAngle = entity.chassisAngle;

  if (amount === 0) {
    state.turretAngle = entity.turretAngle;
    state.turretVelocity = 0;
    return { hullLean: 0, hullOffset: 0, hullScaleY: 1, bob: 0, turretAngle: entity.turretAngle };
  }

  const stiffness = 30 + 60 * amount;
  const damping = 18 - 3 * amount;
  const turretError = wrapAngle(entity.turretAngle - state.turretAngle);
  state.turretVelocity += (turretError * stiffness - state.turretVelocity * damping) * dt;
  state.turretAngle = wrapAngle(state.turretAngle + state.turretVelocity * dt);

  const speedRatio = entity.maxSpeed > 0 ? clamp(speed / entity.maxSpeed, 0, 1) : 0;
  return {
    hullLean: clamp(turnRate * 0.035 - acceleration * 0.00015, -0.1, 0.1) * amount,
    hullOffset: clamp(-acceleration * 0.006, -2.5, 2.5) * amount,
    hullScaleY: 1 - Math.min(0.035, Math.abs(turnRate) * 0.012 * amount),
    bob: Math.sin(animationTime * 12 + entity.id) * speedRatio * 1.2 * amount,
    turretAngle: state.turretAngle,
  };
}
