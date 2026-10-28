/**
 * Fits the enemy level-scale anchors (shared/data/balance.ts) against the real sim:
 *   npm run balance-fit
 * For each anchor level a level-matched medium-class player (standard gear) fights a gunner truck. The hull multiplier is
 * bisected until the kill takes BASELINE_TTK_SECONDS, then the damage multiplier until the player ends at 95 % (level 1) .. 90 % (level 30+) health.
 * The printed table (smoothed over neighbouring anchors, because gear arrives in steps) goes into ENEMY_SCALE_ANCHORS.
 */
import { BASELINE_TTK_SECONDS } from '../shared/data/balance.ts';
import { ENEMY_ARCHETYPES } from '../shared/data/enemies.ts';
import { measureRates } from './balanceLib.ts';

const LEVELS = [1, 4, 8, 12, 16, 20, 24, 29, 34, 39, 44, 50, 56, 62, 68, 74, 80, 86, 92, 100];
/** A normal enemy costs a beginner ~5 % health and, from level 30, ~10 % (elites: 5.5x hull, 1.1x damage -> ~60 %). */
const targetLeft = (level: number): number => 0.95 - 0.05 * Math.min(1, Math.max(0, (level - 1) / 29));


const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const baseHp = (() => { const a = ENEMY_ARCHETYPES['gunner_truck']; return a.baseHull + a.baseArmor; })();
const raw: Array<[number, number, number]> = [];
for (const L of LEVELS) {
  let dealt = 0, php = 0;
  for (const sd of SEEDS) { const r = measureRates(L, sd); dealt += r.dealt; php += r.playerHp; }
  dealt /= SEEDS.length; php /= SEEDS.length;
  const hull = (BASELINE_TTK_SECONDS * dealt) / baseHp;            // enemy dies after BASELINE_TTK seconds of average fire
  const wantTaken = ((1 - targetLeft(L)) * php) / BASELINE_TTK_SECONDS; // ... having dealt (1 - targetLeft) of the player's health by then
  // damage taken is not linear in the multiplier (flat armor reduction has a 10 % floor), so iterate
  let dmg = 1;
  for (let it = 0; it < 6; it++) {
    const taken = SEEDS.reduce((a, sd) => a + measureRates(L, sd, dmg).taken, 0) / SEEDS.length;
    dmg *= wantTaken / taken;
  }
  raw.push([L, hull, dmg]);
  console.error(`L${L}: player deals ${dealt.toFixed(0)}/s, wants to take ${wantTaken.toFixed(0)}/s -> hull x${hull.toFixed(2)} dmg x${dmg.toFixed(2)}`);
}
// smooth in log space over three neighbours (gear arrives in steps; enemies should follow the trend, not the saw-tooth)
const smooth = raw.map(([L], i) => {
  const w = [raw[Math.max(0, i - 1)], raw[i], raw[Math.min(raw.length - 1, i + 1)]];
  const g = (k: 1 | 2) => Math.exp(w.reduce((s, r) => s + Math.log(r[k]), 0) / w.length);
  return [L, g(1), g(2)] as const;
});
console.log('export const ENEMY_SCALE_ANCHORS: ReadonlyArray<readonly [number, number, number]> = [');
for (const [L, h, d] of smooth) console.log(`  [${L}, ${h.toFixed(3)}, ${d.toFixed(3)}],`);
console.log('];');
