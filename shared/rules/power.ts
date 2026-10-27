/**
 * Treadfront - Combat Power Rating Rules
 * Evaluates vehicle combat rating for matchmaking, profiles, and arena brackets.
 * Formula: round(sqrt(effectiveDPS * (maxHull + maxArmor)) * tierMultiplier)
 */

export interface PowerRatingInput {
  dps: number;
  maxHull: number;
  maxArmor: number;
  tier?: number;
  flatReduction?: number;
  critChance?: number;
}

export function calculateCombatPower(stats: PowerRatingInput): number {
  const dps = Math.max(1, stats.dps);
  const durability = Math.max(1, stats.maxHull + stats.maxArmor);
  const tier = Math.max(1, stats.tier || 1);
  const critMod = 1.0 + (stats.critChance || 0.05) * 0.5; // crit scaling
  const reductionMod = 1.0 + Math.min(0.5, (stats.flatReduction || 0) / 100);

  const effectiveDPS = dps * critMod;
  const effectiveDurability = durability * reductionMod;

  const rawPower = Math.sqrt(effectiveDPS * effectiveDurability) * (1.0 + (tier - 1) * 0.1);
  return Math.max(10, Math.round(rawPower));
}
