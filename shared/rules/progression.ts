/**
 * Treadfront - Progression Rules and Formulas (Section 5)
 * XP curves, level-up calculations, kill XP scaling, and garage slot unlocking.
 */

export const MAX_PLAYER_LEVEL = 100;
export const TALENT_START_LEVEL = 5;
export const MAX_GARAGE_SLOTS = 8;

/**
 * Returns XP needed to reach next level from level (n - 1) to n.
 * Formula: round(80 * n^2.1)
 */
export function getXPForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(80 * Math.pow(level, 2.1));
}

/**
 * Calculates cumulative total XP required from level 1 up to target level.
 */
export function getCumulativeXP(targetLevel: number): number {
  let total = 0;
  for (let lvl = 2; lvl <= targetLevel; lvl++) {
    total += getXPForLevel(lvl);
  }
  return total;
}

/**
 * Computes level diff factor for kill XP.
 * Equal level: 1.0
 * 10+ levels below: 0.0 (no XP)
 * 1 to 9 levels below: scales down linearly
 * 1 to 5 levels above: up to 1.25x
 * 5+ levels above: 1.25x
 */
export function getLevelDiffFactor(playerLevel: number, enemyLevel: number): number {
  const diff = enemyLevel - playerLevel;

  if (diff <= -10) {
    return 0.0;
  }
  if (diff < 0) {
    // Linear scale from 0.1 at -9 to 0.9 at -1
    return 1.0 + (diff / 10) * 0.9;
  }
  if (diff === 0) {
    return 1.0;
  }
  // diff > 0
  return Math.min(1.25, 1.0 + (diff / 5) * 0.25);
}

/**
 * Calculates kill XP awarded for defeating an enemy of a given level.
 */
export function calculateKillXP(playerLevel: number, enemyLevel: number, isElite = false, isBoss = false): number {
  const baseXP = 45 + enemyLevel * 18;
  const factor = getLevelDiffFactor(playerLevel, enemyLevel);
  const typeMult = isBoss ? 10.0 : isElite ? 3.0 : 1.0;
  return Math.round(baseXP * factor * typeMult);
}

/**
 * Calculates available talent points for a player of given level.
 * Level 1-4: 0 points.
 * Level 5: 1 point.
 * Level 100: 96 points.
 */
export function getEarnedTalentPoints(level: number): number {
  if (level < TALENT_START_LEVEL) return 0;
  return Math.min(96, level - TALENT_START_LEVEL + 1);
}

/**
 * Calculates unlocked garage capacity for a player of given level.
 * Starts with 1 at level 1, +1 per 10 levels, capped at 8 slots.
 */
export function getGarageCapacity(level: number): number {
  const slots = 1 + Math.floor(level / 10);
  return Math.min(MAX_GARAGE_SLOTS, Math.max(1, slots));
}

/**
 * Evaluates level from total lifetime XP accumulated.
 */
export function getLevelFromXP(totalXP: number): { level: number; currentXP: number; xpNeeded: number } {
  let level = 1;
  let remaining = totalXP;

  while (level < MAX_PLAYER_LEVEL) {
    const cost = getXPForLevel(level + 1);
    if (remaining >= cost) {
      remaining -= cost;
      level++;
    } else {
      break;
    }
  }

  const nextCost = level < MAX_PLAYER_LEVEL ? getXPForLevel(level + 1) : 0;
  return {
    level,
    currentXP: remaining,
    xpNeeded: nextCost,
  };
}
