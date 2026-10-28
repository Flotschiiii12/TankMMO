/**
 * Brings every enemy archetype to its intended role relative to the reference gunner truck at the fitted level scale:
 *   npm run balance-normalize [-- --write]
 * ENEMY_ROLES says how long a level-matched player should need (hull) and how hard the enemy should hit (threat) compared
 * with the gunner truck. The script measures both with unkillable-enemy fights at several levels and prints (or with
 * --write applies to shared/data/enemies.ts) the base stats that produce exactly that. Running it again prints factors of ~1.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ENEMY_ARCHETYPES } from '../shared/data/enemies.ts';
import { enemyScale } from '../shared/data/balance.ts';
import { measureRates } from './balanceLib.ts';

export const ENEMY_ROLES: Record<string, { hull: number; threat: number }> = {
  scout_buggy: { hull: 0.6, threat: 0.7 }, gunner_truck: { hull: 1, threat: 1 }, artillery: { hull: 0.7, threat: 1.4 }, flak_wagon: { hull: 1, threat: 0.9 },
  engineer: { hull: 1.1, threat: 0.6 }, ice_tank: { hull: 1.35, threat: 1 }, swamp_crawler: { hull: 1.25, threat: 0.9 }, lava_truck: { hull: 1.1, threat: 1.15 },
  sandstorm_raider: { hull: 0.8, threat: 1 }, bunker_turret: { hull: 1.5, threat: 1 }, // loot_convoy is a loot carrier with its own rules: left as designed
};
const LEVELS = [8, 24, 44, 68, 92];
const SEEDS = [1, 2, 3, 4, 5, 6];

function measure(type: string, L: number): { ttk: number; intake: number } {
  const sc = enemyScale(L);
  const a = ENEMY_ARCHETYPES[type];
  let dealt = 0, taken = 0;
  for (const sd of SEEDS) { const r = measureRates(L, sd, sc.dmg, type, 1e6); dealt += r.dealt; taken += r.taken; }
  dealt /= SEEDS.length; taken /= SEEDS.length;
  return { ttk: ((a.baseHull + a.baseArmor) * sc.hull) / Math.max(1e-6, dealt), intake: taken };
}

const geo = (xs: number[]) => Math.exp(xs.reduce((s, x) => s + Math.log(x), 0) / xs.length);
const refs = LEVELS.map((L) => measure('gunner_truck', L));
const result: Record<string, { fh: number; fd: number }> = {};
for (const type of Object.keys(ENEMY_ROLES)) {
  const role = ENEMY_ROLES[type];
  const fh: number[] = [], fd: number[] = [];
  LEVELS.forEach((L, i) => {
    const m = measure(type, L);
    fh.push((role.hull * refs[i].ttk) / m.ttk);
    fd.push((role.threat * refs[i].intake) / Math.max(1e-6, m.intake));
  });
  result[type] = { fh: geo(fh), fd: geo(fd) };
  const a = ENEMY_ARCHETYPES[type];
  console.log(`${type.padEnd(17)} hull x${result[type].fh.toFixed(2)} (${a.baseHull}+${a.baseArmor} -> ${Math.round(a.baseHull * result[type].fh)}+${Math.round(a.baseArmor * result[type].fh)}), damage x${result[type].fd.toFixed(2)} (${a.baseDamage} -> ${Math.round(a.baseDamage * result[type].fd)})`);
}

if (process.argv.includes('--write')) {
  const file = 'shared/data/enemies.ts';
  let src = readFileSync(file, 'utf8');
  for (const [type, { fh, fd }] of Object.entries(result)) {
    if (type === 'gunner_truck') continue;
    const start = src.indexOf(`\n  ${type}: {`);
    const end = src.indexOf('\n  },', start);
    let block = src.slice(start, end);
    block = block.replace(/baseHull: (\d+)/, (_, n) => `baseHull: ${Math.round(Number(n) * fh)}`).replace(/baseArmor: (\d+)/, (_, n) => `baseArmor: ${Math.round(Number(n) * fh)}`).replace(/baseDamage: (\d+)/, (_, n) => `baseDamage: ${Math.max(1, Math.round(Number(n) * fd))}`);
    src = src.slice(0, start) + block + src.slice(end);
  }
  writeFileSync(file, src);
  console.log(`updated ${file}`);
}
