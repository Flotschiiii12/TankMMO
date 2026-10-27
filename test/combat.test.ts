import { describe, expect, it } from 'vitest';
import {
  calculateImpactAngle,
  FRONT_ANGLE_MULTIPLIER,
  REAR_ANGLE_MULTIPLIER,
  resolveDamage,
  SIDE_ANGLE_MULTIPLIER,
} from '../shared/rules/combat.ts';

describe('Combat Model Rules (Section 2)', () => {
  it('calculates impact angle relative to target chassis correctly', () => {
    const targetPos = { x: 500, y: 500 };
    const targetChassisAngle = 0; // Facing east (+X)

    // Attacker directly in front (+X)
    const frontAttacker = { x: 800, y: 500 };
    const frontTheta = calculateImpactAngle(frontAttacker, targetPos, targetChassisAngle);
    expect(Math.abs(frontTheta)).toBeCloseTo(0, 3);

    // Attacker directly behind (-X)
    const rearAttacker = { x: 200, y: 500 };
    const rearTheta = calculateImpactAngle(rearAttacker, targetPos, targetChassisAngle);
    expect(Math.abs(rearTheta)).toBeCloseTo(Math.PI, 3);

    // Attacker directly to left/side (+Y)
    const sideAttacker = { x: 500, y: 800 };
    const sideTheta = calculateImpactAngle(sideAttacker, targetPos, targetChassisAngle);
    expect(Math.abs(sideTheta)).toBeCloseTo(Math.PI / 2, 3);
  });

  it('applies front arc 0.7x damage multiplier (|theta| <= 45°)', () => {
    const result = resolveDamage({
      rawDamage: 100,
      overrideAngleDiff: (30 * Math.PI) / 180, // 30 deg -> front
      targetPos: { x: 0, y: 0 },
      targetChassisAngle: 0,
      targetArmor: 1000,
      targetMaxArmor: 1000,
    });

    expect(result.isFrontHit).toBe(true);
    expect(result.isRearHit).toBe(false);
    expect(result.angleMultiplier).toBe(FRONT_ANGLE_MULTIPLIER);
    expect(result.damageAfterAngleAndModifiers).toBe(70);
  });

  it('applies side arc 1.0x damage multiplier (45° < |theta| < 135°)', () => {
    const result = resolveDamage({
      rawDamage: 100,
      overrideAngleDiff: (90 * Math.PI) / 180, // 90 deg -> side
      targetPos: { x: 0, y: 0 },
      targetChassisAngle: 0,
      targetArmor: 1000,
      targetMaxArmor: 1000,
    });

    expect(result.isSideHit).toBe(true);
    expect(result.angleMultiplier).toBe(SIDE_ANGLE_MULTIPLIER);
    expect(result.damageAfterAngleAndModifiers).toBe(100);
  });

  it('applies rear arc 1.4x damage multiplier (|theta| >= 135°)', () => {
    const result = resolveDamage({
      rawDamage: 100,
      overrideAngleDiff: (160 * Math.PI) / 180, // 160 deg -> rear
      targetPos: { x: 0, y: 0 },
      targetChassisAngle: 0,
      targetArmor: 1000,
      targetMaxArmor: 1000,
    });

    expect(result.isRearHit).toBe(true);
    expect(result.angleMultiplier).toBe(REAR_ANGLE_MULTIPLIER);
    expect(result.damageAfterAngleAndModifiers).toBe(140);
  });

  it('applies flat damage reduction before split, but never below 10% of raw damage', () => {
    // Case 1: 100 side damage, 30 flat reduction -> 70 damage
    const res1 = resolveDamage({
      rawDamage: 100,
      overrideAngleDiff: Math.PI / 2, // 1.0x
      targetPos: { x: 0, y: 0 },
      targetChassisAngle: 0,
      targetArmor: 1000,
      targetMaxArmor: 1000,
      targetFlatReduction: 30,
    });
    expect(res1.damageAfterReduction).toBe(70);

    // Case 2: 100 side damage, 95 flat reduction -> clamped to 10% (10 damage)
    const res2 = resolveDamage({
      rawDamage: 100,
      overrideAngleDiff: Math.PI / 2,
      targetPos: { x: 0, y: 0 },
      targetChassisAngle: 0,
      targetArmor: 1000,
      targetMaxArmor: 1000,
      targetFlatReduction: 95,
    });
    expect(res2.damageAfterReduction).toBe(10);
  });

  it('splits damage 80% to armor and 20% to hull while armor is healthy', () => {
    const res = resolveDamage({
      rawDamage: 100,
      overrideAngleDiff: Math.PI / 2, // 1.0x -> 100 damage
      targetPos: { x: 0, y: 0 },
      targetChassisAngle: 0,
      targetArmor: 500,
      targetMaxArmor: 500,
      targetFlatReduction: 0,
    });

    expect(res.armorDamage).toBe(80); // 80%
    expect(res.hullDamage).toBe(20);  // 20%
    expect(res.newArmor).toBe(420);
    expect(res.armorDepleted).toBe(false);
  });

  it('spills remaining damage to hull when armor is depleted', () => {
    // 100 damage, armor has only 50 left
    // Intended: 80 armor, 20 hull
    // Armor only absorbs 50, remaining 30 leaks to hull
    // Total hull damage = 20 + 30 = 50. Armor becomes 0.
    const res = resolveDamage({
      rawDamage: 100,
      overrideAngleDiff: Math.PI / 2,
      targetPos: { x: 0, y: 0 },
      targetChassisAngle: 0,
      targetArmor: 50,
      targetMaxArmor: 500,
    });

    expect(res.armorDamage).toBe(50);
    expect(res.hullDamage).toBe(50);
    expect(res.newArmor).toBe(0);
    expect(res.armorDepleted).toBe(true);
  });

  it('penetrates 100% to hull when armor is already 0', () => {
    const res = resolveDamage({
      rawDamage: 100,
      overrideAngleDiff: Math.PI / 2,
      targetPos: { x: 0, y: 0 },
      targetChassisAngle: 0,
      targetArmor: 0,
      targetMaxArmor: 500,
    });

    expect(res.armorDamage).toBe(0);
    expect(res.hullDamage).toBe(100);
  });

  it('multiplies damage by 1.5x on critical hit', () => {
    const res = resolveDamage({
      rawDamage: 100,
      overrideAngleDiff: Math.PI / 2, // 1.0x
      targetPos: { x: 0, y: 0 },
      targetChassisAngle: 0,
      targetArmor: 1000,
      targetMaxArmor: 1000,
      isCrit: true,
    });

    expect(res.damageAfterAngleAndModifiers).toBe(150);
    expect(res.armorDamage).toBe(120); // 80% of 150
    expect(res.hullDamage).toBe(30);   // 20% of 150
  });

  it('applies +15% damage when target is Marked', () => {
    const res = resolveDamage({
      rawDamage: 100,
      overrideAngleDiff: Math.PI / 2,
      targetPos: { x: 0, y: 0 },
      targetChassisAngle: 0,
      targetArmor: 1000,
      targetMaxArmor: 1000,
      isMarked: true,
    });

    expect(res.damageAfterAngleAndModifiers).toBeCloseTo(115, 3);
  });

  it('inflicts 0 damage when target is invulnerable (Emergency Shield)', () => {
    const res = resolveDamage({
      rawDamage: 500,
      targetPos: { x: 0, y: 0 },
      targetChassisAngle: 0,
      targetArmor: 1000,
      targetMaxArmor: 1000,
      isInvulnerable: true,
    });

    expect(res.totalDamageDealt).toBe(0);
    expect(res.armorDamage).toBe(0);
    expect(res.hullDamage).toBe(0);
    expect(res.newArmor).toBe(1000);
  });
});
