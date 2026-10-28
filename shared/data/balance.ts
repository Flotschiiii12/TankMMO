/**
 * Enemy stat scaling by level. Players grow in steps (vehicle tiers at levels 1/8/16/24/34/44/56/68/80/92, gear tiers every
 * 12 levels) and exponentially per tier, so a linear enemy curve cannot keep up. The anchors below were fitted with
 * `npm run balance-fit` (scripts/balance-fit.ts) so that a level-matched player in standard gear needs about
 * BASELINE_TTK seconds for a normal enemy; values between anchors are interpolated in log space.
 * Columns: level, hull+armor multiplier, damage multiplier (both applied to the archetype's level-1 numbers).
 */
export const BASELINE_TTK_SECONDS = 9;
/** Minimum machine-gun damage as a share of the main gun's damage per shot (the machine gun fires ~9x as often). Players and bosses. */
export const MG_MAIN_DAMAGE_RATIO = 0.03;
/** Elites: ~4x the time to kill of a normal enemy (target 30-60 s) and a harder hit. */
export const ELITE_HULL_MULT = 6.4;
export const ELITE_DAMAGE_MULT = 1.1;

export const ENEMY_SCALE_ANCHORS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1.241, 0.313],
  [4, 1.334, 0.370],
  [8, 1.578, 0.468],
  [12, 2.052, 0.676],
  [16, 2.555, 0.901],
  [20, 3.118, 1.271],
  [24, 3.546, 1.635],
  [29, 4.596, 2.244],
  [34, 6.171, 2.951],
  [39, 8.823, 4.013],
  [44, 11.604, 5.146],
  [50, 15.000, 6.671],
  [56, 18.536, 8.182],
  [62, 24.411, 11.025],
  [68, 30.731, 14.049],
  [74, 41.070, 19.153],
  [80, 50.613, 23.435],
  [86, 65.103, 30.620],
  [92, 78.594, 36.744],
  [100, 90.130, 42.261],
];

export interface EnemyScale { hull: number; dmg: number }

export function enemyScale(level: number): EnemyScale {
  const a = ENEMY_SCALE_ANCHORS;
  const L = Math.max(a[0][0], Math.min(a[a.length - 1][0], level));
  let i = 0;
  while (i < a.length - 2 && L > a[i + 1][0]) i++;
  const [l0, h0, d0] = a[i]; const [l1, h1, d1] = a[i + 1];
  const t = l1 === l0 ? 0 : (L - l0) / (l1 - l0);
  return { hull: Math.exp(Math.log(h0) + (Math.log(h1) - Math.log(h0)) * t), dmg: Math.exp(Math.log(d0) + (Math.log(d1) - Math.log(d0)) * t) };
}
