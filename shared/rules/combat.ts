/**
 * Treadfront - Combat Model Rules
 * Pure deterministic implementation of the vehicle combat damage model.
 *
 * Section 2 Specification:
 * - Impact angle theta relative to target chassis:
 *   - Front (|theta| <= 45°): x0.7
 *   - Side: x1.0
 *   - Rear (|theta| >= 135°): x1.4
 * - Flat damage reduction applied before split (never below 10% of raw damage).
 * - Armor absorbs 80% until depleted; 20% (and 100% when armor = 0) penetrates to hull.
 * - Critical hits: x1.5.
 * - Marked status: +15% damage taken.
 * - Emergency Shield / Invulnerable: 0 damage.
 */

import { angleDiff, Vec2 } from '../types.ts';

export const FRONT_ARC_MAX_RAD = (45 * Math.PI) / 180;   // 45 degrees
export const REAR_ARC_MIN_RAD = (135 * Math.PI) / 180;   // 135 degrees

export const FRONT_ANGLE_MULTIPLIER = 0.7;
export const SIDE_ANGLE_MULTIPLIER = 1.0;
export const REAR_ANGLE_MULTIPLIER = 1.4;

export const CRIT_MULTIPLIER = 1.5;
export const MARKED_DAMAGE_MULTIPLIER = 1.15; // +15% damage taken
export const MIN_DAMAGE_PERCENT = 0.10; // Flat reduction cannot reduce damage below 10%

export const ARMOR_ABSORPTION_RATIO = 0.80; // Armor absorbs 80%
export const HULL_PENETRATION_RATIO = 0.20; // 20% leaks to hull directly

export const ARMOR_REGEN_DELAY_SECONDS = 8.0; // 8 seconds without taking damage
export const ARMOR_REGEN_RATE_PER_SEC = 0.04; // 4% of max armor per second

export interface DamageResolutionInput {
  rawDamage: number;
  attackerPos?: Vec2;
  targetPos: Vec2;
  targetChassisAngle: number;
  targetArmor: number;
  targetMaxArmor: number;
  targetFlatReduction?: number;
  isCrit?: boolean;
  isMarked?: boolean;
  isInvulnerable?: boolean;
  overrideAngleDiff?: number; // For direct unit tests
}

export interface DamageResolutionResult {
  rawDamage: number;
  angleTheta: number;
  angleMultiplier: number;
  isFrontHit: boolean;
  isRearHit: boolean;
  isSideHit: boolean;
  isCrit: boolean;
  damageAfterAngleAndModifiers: number;
  flatReductionApplied: number;
  damageAfterReduction: number;
  armorDamage: number;
  hullDamage: number;
  totalDamageDealt: number;
  armorDepleted: boolean;
  newArmor: number;
}

/**
 * Calculates impact angle theta between incoming attack and target chassis.
 * Attack coming from target's front = 0 rad (|theta| <= 45°).
 * Attack coming from target's rear = PI rad (|theta| >= 135°).
 */
export function calculateImpactAngle(
  attackerPos: Vec2,
  targetPos: Vec2,
  targetChassisAngle: number
): number {
  // Vector pointing from target to attacker (incoming attack direction)
  const incomingAngle = Math.atan2(attackerPos.y - targetPos.y, attackerPos.x - targetPos.x);
  return angleDiff(incomingAngle, targetChassisAngle);
}

/**
 * Resolves full damage according to Treadfront rules.
 */
export function resolveDamage(input: DamageResolutionInput): DamageResolutionResult {
  if (input.isInvulnerable) {
    return {
      rawDamage: input.rawDamage,
      angleTheta: 0,
      angleMultiplier: 1.0,
      isFrontHit: false,
      isRearHit: false,
      isSideHit: true,
      isCrit: false,
      damageAfterAngleAndModifiers: 0,
      flatReductionApplied: 0,
      damageAfterReduction: 0,
      armorDamage: 0,
      hullDamage: 0,
      totalDamageDealt: 0,
      armorDepleted: false,
      newArmor: input.targetArmor,
    };
  }

  // 1. Calculate impact angle theta
  let theta = 0;
  if (input.overrideAngleDiff !== undefined) {
    theta = input.overrideAngleDiff;
  } else if (input.attackerPos) {
    theta = calculateImpactAngle(input.attackerPos, input.targetPos, input.targetChassisAngle);
  }
  const absTheta = Math.abs(theta);

  // 2. Angle Multiplier
  let angleMultiplier = SIDE_ANGLE_MULTIPLIER;
  let isFrontHit = false;
  let isRearHit = false;
  let isSideHit = false;

  if (absTheta <= FRONT_ARC_MAX_RAD + 1e-6) {
    angleMultiplier = FRONT_ANGLE_MULTIPLIER;
    isFrontHit = true;
  } else if (absTheta >= REAR_ARC_MIN_RAD - 1e-6) {
    angleMultiplier = REAR_ANGLE_MULTIPLIER;
    isRearHit = true;
  } else {
    isSideHit = true;
  }

  // 3. Base damage with crits & status
  let damage = input.rawDamage;
  if (input.isCrit) {
    damage *= CRIT_MULTIPLIER;
  }
  damage *= angleMultiplier;

  if (input.isMarked) {
    damage *= MARKED_DAMAGE_MULTIPLIER;
  }

  const damageAfterAngleAndModifiers = damage;

  // 4. Flat Damage Reduction
  // "Flat damage reduction from armor parts and talents is applied before the split (never below 10% of D)"
  const flatReduction = Math.max(0, input.targetFlatReduction || 0);
  const minFloor = damageAfterAngleAndModifiers * MIN_DAMAGE_PERCENT;
  const damageAfterReduction = Math.max(minFloor, damageAfterAngleAndModifiers - flatReduction);
  const flatReductionApplied = damageAfterAngleAndModifiers - damageAfterReduction;

  // 5. Armor Split (80% Armor, 20% Hull while armor exists)
  let armorDamage = 0;
  let hullDamage = 0;
  const currentArmor = Math.max(0, input.targetArmor);

  if (currentArmor <= 0) {
    // Armor completely gone -> 100% penetrates to hull
    hullDamage = damageAfterReduction;
    armorDamage = 0;
  } else {
    const intendedArmorDamage = damageAfterReduction * ARMOR_ABSORPTION_RATIO;
    const baseHullDamage = damageAfterReduction * HULL_PENETRATION_RATIO;

    if (intendedArmorDamage <= currentArmor) {
      armorDamage = intendedArmorDamage;
      hullDamage = baseHullDamage;
    } else {
      // Armor breaks! Absorbs up to currentArmor, remainder leaks to hull
      armorDamage = currentArmor;
      const overflow = intendedArmorDamage - currentArmor;
      hullDamage = baseHullDamage + overflow;
    }
  }

  const newArmor = Math.max(0, currentArmor - armorDamage);
  const armorDepleted = currentArmor > 0 && newArmor <= 0;
  const totalDamageDealt = armorDamage + hullDamage;

  return {
    rawDamage: input.rawDamage,
    angleTheta: theta,
    angleMultiplier,
    isFrontHit,
    isRearHit,
    isSideHit,
    isCrit: !!input.isCrit,
    damageAfterAngleAndModifiers,
    flatReductionApplied,
    damageAfterReduction,
    armorDamage,
    hullDamage,
    totalDamageDealt,
    armorDepleted,
    newArmor,
  };
}

/**
 * Evaluates passive armor regeneration tick
 */
export function tickArmorRegen(
  currentArmor: number,
  maxArmor: number,
  armorRegenTimer: number,
  dt: number
): { armor: number; armorRegenTimer: number } {
  if (currentArmor >= maxArmor) {
    return { armor: maxArmor, armorRegenTimer: armorRegenTimer + dt };
  }

  const newTimer = armorRegenTimer + dt;
  if (newTimer >= ARMOR_REGEN_DELAY_SECONDS) {
    const regenAmount = maxArmor * ARMOR_REGEN_RATE_PER_SEC * dt;
    const newArmor = Math.min(maxArmor, currentArmor + regenAmount);
    return { armor: newArmor, armorRegenTimer: newTimer };
  }

  return { armor: currentArmor, armorRegenTimer: newTimer };
}
