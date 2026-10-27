/**
 * Treadfront - Status Effect Rules
 * Pure deterministic implementation of status effects, durations, and diminishing returns.
 */

import { ActiveStatusEffect, StatusEffectType } from '../types.ts';

export const STUN_BASE_DURATION = 1.5; // 1.5s EMP Stun
export const STUN_DIMINISHING_WINDOW = 10.0; // Window in seconds to track stun counts
export const BURNING_DOT_TICK_RATE = 1.0; // Burning deals damage every 1.0s

/**
 * Calculates effective stun duration considering diminishing returns.
 * 1st: 100% (1.5s)
 * 2nd: 50% (0.75s)
 * 3rd: 25% (0.375s)
 * 4th+: Immune (0s)
 */
export function calculateStunDuration(stunCount: number): number {
  if (stunCount === 0) return STUN_BASE_DURATION;
  if (stunCount === 1) return STUN_BASE_DURATION * 0.5;
  if (stunCount === 2) return STUN_BASE_DURATION * 0.25;
  return 0; // Immune after 3 stuns in window
}

/**
 * Applies or refreshes a status effect on an active status list.
 */
export function applyStatusEffect(
  effects: ActiveStatusEffect[],
  type: StatusEffectType,
  duration: number,
  value?: number,
  sourceId?: number
): ActiveStatusEffect[] {
  const existingIndex = effects.findIndex(e => e.type === type);
  
  if (existingIndex >= 0) {
    const existing = effects[existingIndex];
    // Refresh duration if new duration is greater
    const newDuration = Math.max(existing.duration, duration);
    const updated: ActiveStatusEffect = {
      ...existing,
      duration: newDuration,
      maxDuration: Math.max(existing.maxDuration, duration),
      value: value !== undefined ? value : existing.value,
      sourceId: sourceId !== undefined ? sourceId : existing.sourceId,
      stacks: Math.min(3, (existing.stacks || 1) + 1),
    };
    const nextEffects = [...effects];
    nextEffects[existingIndex] = updated;
    return nextEffects;
  }

  return [
    ...effects,
    {
      type,
      duration,
      maxDuration: duration,
      value,
      sourceId,
      stacks: 1,
    },
  ];
}

/**
 * Ticks active status effects, reduces remaining duration, and collects DoT damage.
 */
export function tickStatusEffects(
  effects: ActiveStatusEffect[],
  dt: number
): {
  remainingEffects: ActiveStatusEffect[];
  burningDamage: number;
  isStunned: boolean;
  isSmoked: boolean;
  isMarked: boolean;
  isInvulnerable: boolean;
  speedMultiplier: number;
} {
  const remainingEffects: ActiveStatusEffect[] = [];
  let burningDamage = 0;
  let isStunned = false;
  let isSmoked = false;
  let isMarked = false;
  let isInvulnerable = false;
  let speedMultiplier = 1.0;

  for (const effect of effects) {
    const newDuration = effect.duration - dt;

    if (effect.type === 'stunned') {
      isStunned = true;
    } else if (effect.type === 'smoked') {
      isSmoked = true;
    } else if (effect.type === 'marked') {
      isMarked = true;
    } else if (effect.type === 'invulnerable') {
      isInvulnerable = true;
    } else if (effect.type === 'slowed') {
      speedMultiplier = Math.min(speedMultiplier, effect.value ?? 0.6);
    } else if (effect.type === 'boosted') {
      speedMultiplier = Math.max(speedMultiplier, 1.30); // +30% boost
    } else if (effect.type === 'fortified') {
      speedMultiplier *= 0.60; // -40% speed when fortified
    } else if (effect.type === 'burning') {
      // Burn DoT: 15 damage per stack per second
      const stackCount = effect.stacks || 1;
      burningDamage += 15 * stackCount * dt;
    }

    if (newDuration > 0) {
      remainingEffects.push({
        ...effect,
        duration: newDuration,
      });
    }
  }

  return {
    remainingEffects,
    burningDamage,
    isStunned,
    isSmoked,
    isMarked,
    isInvulnerable,
    speedMultiplier,
  };
}
