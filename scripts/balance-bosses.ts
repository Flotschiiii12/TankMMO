/**
 * Fits mini / world boss stats so that a party of 4 (heavy, medium, artillery, support; level-matched, standard gear)
 * needs about 5 minutes and ends with ~45 % of its health left:  npm run balance-bosses [-- --write]
 * Knobs: a hull+armor factor (time to kill) and a damage factor (party health left), bisected on the real sim.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { BOSS_CATALOG, Build, DUNGEONS, groupVsBoss, groupVsGate, tierForLevel } from './balanceLib.ts';

/** A boss that does nothing but soak damage is not a boss: never fit below this (0 would even fall back to the default damage). */
export const MIN_BOSS_DAMAGE = 25;
export const BOSS_TTK_SECONDS = 300;
export const BOSS_HEALTH_LEFT = 0.45;
const SEEDS = [1, 2, 3, 4, 5, 6];
const party = (lvl: number): Build[] => (['heavy', 'medium', 'artillery', 'support'] as const).map((cls) => ({ cls, tier: tierForLevel(lvl), level: lvl }));

function bisect(f: (x: number) => number, target: number, lo: number, hi: number, iters = 16): number {
  for (let i = 0; i < iters; i++) { const mid = Math.sqrt(lo * hi); if (f(mid) < target) lo = mid; else hi = mid; }
  return Math.sqrt(lo * hi);
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : 'all'; // bosses | gates | all
const results: Record<string, { fh: number; fd: number }> = {};
for (const b of only === 'gates' ? [] : BOSS_CATALOG) {
  // 1) time to kill with a harmless boss: fight length grows with the hull factor
  const fh = bisect((m) => mean(SEEDS.map((s) => groupVsBoss(b.id, party(b.level), s, { hull: m, dmg: 0.0001 }).seconds)), BOSS_TTK_SECONDS, 0.02, 400);
  // 2) damage so that the party keeps ~45 % health (health left falls as damage grows; dying early counts as 0)
  const fd = bisect((d) => 1 - mean(SEEDS.map((s) => groupVsBoss(b.id, party(b.level), s, { hull: fh, dmg: d }).hullLeft)), 1 - BOSS_HEALTH_LEFT, 0.001, 50);
  results[b.id] = { fh, fd };
  console.log(`${b.id.padEnd(26)} L${b.level}: hull ${b.baseHull}+${b.baseArmor} -> ${Math.round(b.baseHull * fh)}+${Math.round(b.baseArmor * fh)}, damage ${b.damage} -> ${Math.round(b.damage * fd)}`);
}

if (process.argv.includes('--write') && only !== 'gates') {
  const file = 'shared/data/enemies.ts';
  let src = readFileSync(file, 'utf8');
  for (const [id, { fh, fd }] of Object.entries(results)) {
    const start = src.indexOf(`id: '${id}'`); const end = src.indexOf('\n  },', start);
    let block = src.slice(start, end);
    block = block.replace(/baseHull: (\d+)/, (_, n) => `baseHull: ${Math.round(Number(n) * fh)}`).replace(/baseArmor: (\d+)/, (_, n) => `baseArmor: ${Math.round(Number(n) * fh)}`).replace(/damage: (\d+)/, (_, n) => `damage: ${Math.max(MIN_BOSS_DAMAGE, Math.round(Number(n) * fd))}`);
    src = src.slice(0, start) + block + src.slice(end);
  }
  writeFileSync(file, src);
  console.log(`updated ${file}`);
}

// ------------------------------------------------------------------------------------------------ gates
// Whole run (waves + boss) with a party of 4 at the recommended level: ~9 minutes of the 15 allowed, ~55 % health left (wipes count as 0, so this keeps the win rate high).
export const GATE_CLEAR_SECONDS = 540;
export const GATE_HEALTH_LEFT = 0.55;
const gateResults: Record<string, { fh: number; fd: number; wh: number; wd: number }> = {};
export const GATE_WAVES_SECONDS = 216;
export const GATE_WAVES_HEALTH_LEFT = 0.8;
for (const d of only === 'bosses' ? [] : DUNGEONS) {
  const base = { hull: d.boss.baseHull, armor: d.boss.baseArmor, dmg: d.boss.damage };
  const apply = (fh: number, fd: number) => { d.boss.baseHull = Math.round(base.hull * fh); d.boss.baseArmor = Math.round(base.armor * fh); d.boss.damage = Math.max(1, Math.round(base.dmg * fd)); };
  const pt = party(d.recommendedLevel);
  const run = (s: number) => groupVsGate(d.id, pt, s);
  // phase 1: waves alone (the boss is made a pushover): wave hull -> duration, wave damage -> health lost
  apply(0.001, 0.0001); d.waveHull = 1; d.waveDmg = 1;
  const wh = bisect((m) => { d.waveHull = m; d.waveDmg = 0.0001; return mean(SEEDS.map((s) => run(s).seconds)); }, GATE_WAVES_SECONDS, 0.05, 20);
  d.waveHull = wh;
  const wd = bisect((x) => { d.waveDmg = x; return 1 - mean(SEEDS.map((s) => run(s).hullLeft)); }, 1 - GATE_WAVES_HEALTH_LEFT, 0.001, 20);
  d.waveDmg = wd;
  // phase 2: the boss on top
  const fh = bisect((m) => { apply(m, 0.0001); return mean(SEEDS.map((s) => run(s).seconds)); }, GATE_CLEAR_SECONDS, 0.02, 100);
  const fd = bisect((x) => { apply(fh, x); return 1 - mean(SEEDS.map((s) => run(s).hullLeft)); }, 1 - GATE_HEALTH_LEFT, 0.001, 50);
  apply(1, 1);
  gateResults[d.id] = { fh, fd, wh, wd };
  console.log(`${d.id.padEnd(24)} L${d.recommendedLevel}: waves hull x${wh.toFixed(2)} dmg x${wd.toFixed(2)}; boss ${base.hull}+${base.armor} -> ${Math.round(base.hull * fh)}+${Math.round(base.armor * fh)}, damage ${base.dmg} -> ${Math.round(base.dmg * fd)}`);
}
if (process.argv.includes('--write') && only !== 'bosses') {
  const file = 'shared/data/dungeons.ts';
  let src = readFileSync(file, 'utf8');
  for (const [id, { fh, fd, wh, wd }] of Object.entries(gateResults)) {
    const start = src.indexOf(`id: '${id}'`); const bs = src.indexOf('boss: {', start); const be = src.indexOf('}', bs);
    // wave multipliers go in front of the boss definition
    const waveLine = `waveHull: ${wh.toFixed(2)}, waveDmg: ${wd.toFixed(2)},\n    `;
    const existing = /waveHull: [\d.]+, waveDmg: [\d.]+,\n    /.exec(src.slice(start, bs));
    if (existing) src = src.slice(0, start + existing.index) + waveLine + src.slice(start + existing.index + existing[0].length);
    else src = src.slice(0, bs) + waveLine + src.slice(bs);
    const bs2 = src.indexOf('boss: {', start); const be2 = src.indexOf('}', bs2);
    let block = src.slice(bs2, be2);
    block = block.replace(/baseHull: (\d+)/, (_, n) => `baseHull: ${Math.round(Number(n) * fh)}`).replace(/baseArmor: (\d+)/, (_, n) => `baseArmor: ${Math.round(Number(n) * fh)}`).replace(/damage: (\d+)/, (_, n) => `damage: ${Math.max(MIN_BOSS_DAMAGE, Math.round(Number(n) * fd))}`);
    src = src.slice(0, bs2) + block + src.slice(be2);
  }
  writeFileSync(file, src);
  console.log(`updated ${file}`);
}
