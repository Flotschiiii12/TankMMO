import { describe, expect, it } from 'vitest';
import {
  applyStatusEffect,
  calculateStunDuration,
  STUN_BASE_DURATION,
  tickStatusEffects,
} from '../shared/rules/status.ts';
import { ActiveStatusEffect } from '../shared/types.ts';

describe('Status Effects Rules (Section 2)', () => {
  it('implements EMP stun diminishing returns', () => {
    // 1st stun: 100% (1.5s)
    expect(calculateStunDuration(0)).toBe(STUN_BASE_DURATION);

    // 2nd stun in window: 50% (0.75s)
    expect(calculateStunDuration(1)).toBe(STUN_BASE_DURATION * 0.5);

    // 3rd stun in window: 25% (0.375s)
    expect(calculateStunDuration(2)).toBe(STUN_BASE_DURATION * 0.25);

    // 4th+ stun: immune (0s)
    expect(calculateStunDuration(3)).toBe(0);
    expect(calculateStunDuration(4)).toBe(0);
  });

  it('applies and decrements status durations correctly', () => {
    let effects: ActiveStatusEffect[] = [];
    effects = applyStatusEffect(effects, 'slowed', 3.0, 0.6);

    expect(effects.length).toBe(1);
    expect(effects[0].duration).toBe(3.0);

    const ticked = tickStatusEffects(effects, 1.0);
    expect(ticked.speedMultiplier).toBe(0.6);
    expect(ticked.remainingEffects[0].duration).toBeCloseTo(2.0, 3);
  });

  it('deals burning damage over time', () => {
    let effects: ActiveStatusEffect[] = [];
    effects = applyStatusEffect(effects, 'burning', 4.0);

    const ticked = tickStatusEffects(effects, 1.0);
    expect(ticked.burningDamage).toBeGreaterThan(0);
    expect(ticked.remainingEffects[0].duration).toBeCloseTo(3.0, 3);
  });

  it('refreshes existing status effect duration when re-applied with higher duration', () => {
    let effects: ActiveStatusEffect[] = [];
    effects = applyStatusEffect(effects, 'marked', 2.0);
    effects = applyStatusEffect(effects, 'marked', 5.0);

    expect(effects.length).toBe(1);
    expect(effects[0].duration).toBe(5.0);
  });
});
