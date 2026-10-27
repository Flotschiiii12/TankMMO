import { describe, expect, it } from 'vitest';
import {
  calculateKillXP,
  getEarnedTalentPoints,
  getGarageCapacity,
  getLevelDiffFactor,
  getLevelFromXP,
  getXPForLevel,
} from '../shared/rules/progression.ts';

describe('Progression Rules & XP Curves (Milestone 2)', () => {
  it('calculates XP required per level according to round(80 * n^2.1)', () => {
    expect(getXPForLevel(1)).toBe(0);
    // Level 2: 80 * 2^2.1 = 80 * 4.287 = 343
    expect(getXPForLevel(2)).toBe(Math.round(80 * Math.pow(2, 2.1)));
    // Level 10: 80 * 10^2.1 = 80 * 125.89 = 10071
    expect(getXPForLevel(10)).toBe(Math.round(80 * Math.pow(10, 2.1)));
  });

  it('calculates level difference multiplier for kill XP', () => {
    // Equal level = 1.0
    expect(getLevelDiffFactor(20, 20)).toBe(1.0);

    // 10+ levels below = 0.0 (grey enemy)
    expect(getLevelDiffFactor(25, 15)).toBe(0.0);
    expect(getLevelDiffFactor(30, 10)).toBe(0.0);

    // 5 levels below = 0.55
    expect(getLevelDiffFactor(25, 20)).toBeCloseTo(0.55, 2);

    // 5 levels above = 1.25 (capped)
    expect(getLevelDiffFactor(20, 25)).toBe(1.25);
    expect(getLevelDiffFactor(20, 30)).toBe(1.25);
  });

  it('calculates kill XP for enemies, elites, and bosses', () => {
    const normalXP = calculateKillXP(10, 10, false, false);
    const eliteXP = calculateKillXP(10, 10, true, false);
    const bossXP = calculateKillXP(10, 10, false, true);

    expect(normalXP).toBeGreaterThan(0);
    expect(eliteXP).toBe(normalXP * 3);
    expect(bossXP).toBe(normalXP * 10);
  });

  it('awards talent points starting at level 5 up to 96 points at level 100', () => {
    expect(getEarnedTalentPoints(1)).toBe(0);
    expect(getEarnedTalentPoints(4)).toBe(0);
    expect(getEarnedTalentPoints(5)).toBe(1);
    expect(getEarnedTalentPoints(10)).toBe(6);
    expect(getEarnedTalentPoints(50)).toBe(46);
    expect(getEarnedTalentPoints(100)).toBe(96);
  });

  it('scales garage capacity starting with 1 up to 8 slots max', () => {
    expect(getGarageCapacity(1)).toBe(1);
    expect(getGarageCapacity(9)).toBe(1);
    expect(getGarageCapacity(10)).toBe(2);
    expect(getGarageCapacity(25)).toBe(3);
    expect(getGarageCapacity(70)).toBe(8);
    expect(getGarageCapacity(100)).toBe(8);
  });

  it('evaluates player level from cumulative XP', () => {
    const infoLvl1 = getLevelFromXP(0);
    expect(infoLvl1.level).toBe(1);

    const xpForLvl2 = getXPForLevel(2);
    const infoLvl2 = getLevelFromXP(xpForLvl2 + 10);
    expect(infoLvl2.level).toBe(2);
    expect(infoLvl2.currentXP).toBe(10);
  });
});
