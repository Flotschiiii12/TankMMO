import { describe, expect, it } from 'vitest';
import { calculateCombatPower } from '../shared/rules/power.ts';

describe('Combat Power Rating Formula (Milestone 2)', () => {
  it('calculates combat power based on DPS, Hull, Armor, and Tier', () => {
    const tier1 = calculateCombatPower({
      dps: 150,
      maxHull: 1200,
      maxArmor: 800,
      tier: 1,
    });

    const tier5 = calculateCombatPower({
      dps: 663,
      maxHull: 5304,
      maxArmor: 3536,
      tier: 5,
    });

    expect(tier1).toBeGreaterThan(10);
    expect(tier5).toBeGreaterThan(tier1 * 2);
  });
});
