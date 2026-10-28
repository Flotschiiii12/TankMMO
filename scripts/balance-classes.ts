/**
 * Equalises the vehicle classes in PvP:  npm run balance-classes [-- --write]
 * Round-robin duels at equal tier; each round the hull/armor of every class is nudged towards a 50 % overall win rate
 * (Elo-style; artillery through damage). They are printed and, with --write, multiplied into CLASS_MULTIPLIERS in
 * shared/data/vehicles.ts. Run balance-fit afterwards if the medium class changed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { VEHICLE_CATALOG } from '../shared/data/vehicles.ts';
import { CLASSES, duelPvp } from './balanceLib.ts';

/** Artillery is balanced through damage (60 %) and hull (40 %) so it stays a glass cannon; everybody else through hull and armor. */
const KNOB: Record<string, 'ehp' | 'damage' | 'both'> = { scout: 'ehp', medium: 'ehp', heavy: 'ehp', artillery: 'both', support: 'ehp' };
const TIERS = [2, 5, 8, 10];
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const ROUNDS = Number(process.argv.includes('--rounds') ? process.argv[process.argv.indexOf('--rounds') + 1] : 16);

function winRates(): Record<string, number> {
  const w: Record<string, number> = {}, n: Record<string, number> = {};
  for (const c of CLASSES) { w[c] = 0; n[c] = 0; }
  for (const tier of TIERS) for (const a of CLASSES) for (const b of CLASSES) {
    if (a >= b) continue;
    for (const seed of SEEDS) {
      const r1 = duelPvp({ cls: a, tier }, { cls: b, tier }, seed);
      const r2 = duelPvp({ cls: b, tier }, { cls: a, tier }, seed);
      const aWins = (r1.win ? 1 : 0) + (r2.win || r2.timedOut ? 0 : 1);
      w[a] += aWins; w[b] += 2 - aWins; n[a] += 2; n[b] += 2;
    }
  }
  return Object.fromEntries(CLASSES.map((c) => [c, w[c] / n[c]]));
}

const factor: Record<string, number> = Object.fromEntries(CLASSES.map((c) => [c, 1]));
for (let round = 1; round <= ROUNDS; round++) {
  const r = winRates();
  console.log(`round ${round}: ` + CLASSES.map((c) => `${c} ${(r[c] * 100).toFixed(0)}% (x${factor[c].toFixed(3)})`).join('  '));
  for (const c of CLASSES) {
    const f = Math.exp((0.5 - r[c]) * 0.25 * (1 - round / (ROUNDS + 2))); // below 50 % -> sturdier, above -> more fragile; the step shrinks (duels are decided near a power threshold)
    factor[c] *= f;
    // ehp knob: hull and armor; damage knob (artillery): base damage
    for (const v of VEHICLE_CATALOG) if (v.vehicleClass === c) {
      if (KNOB[c] === 'ehp') { v.baseHull = Math.round(v.baseHull * f); v.baseArmor = Math.round(v.baseArmor * f); }
      else if (KNOB[c] === 'damage') v.baseDamage = Math.round(v.baseDamage * f);
      else { v.baseDamage = Math.round(v.baseDamage * f ** 0.6); v.baseHull = Math.round(v.baseHull * f ** 0.4); v.baseArmor = Math.round(v.baseArmor * f ** 0.4); }
    }
  }



}
const r = winRates();
console.log('final: ' + CLASSES.map((c) => `${c} ${(r[c] * 100).toFixed(0)}%`).join('  '));
console.log('factors (hull and armor; artillery: damage): ' + CLASSES.map((c) => `${c} x${factor[c].toFixed(3)}`).join(', '));

// the medium class changes with the others (the enemy fit is redone afterwards and uses the actual medium class)
if (process.argv.includes('--write')) {
  const file = 'shared/data/vehicles.ts';
  let src = readFileSync(file, 'utf8');
  for (const c of CLASSES) {
    const start = src.indexOf(`\n  ${c}: {`); const end = src.indexOf('\n  },', start);
    let block = src.slice(start, end);
    if (KNOB[c] === 'both') {
      block = block.replace(/damage: ([\d.]+)/, (_, n) => `damage: ${(Number(n) * factor[c] ** 0.6).toFixed(2)}`).replace(/hull: ([\d.]+)/, (_, n) => `hull: ${(Number(n) * factor[c] ** 0.4).toFixed(2)}`).replace(/armor: ([\d.]+)/, (_, n) => `armor: ${(Number(n) * factor[c] ** 0.4).toFixed(2)}`);
    } else if (KNOB[c] === 'ehp') block = block.replace(/hull: ([\d.]+)/, (_, n) => `hull: ${(Number(n) * factor[c]).toFixed(2)}`).replace(/armor: ([\d.]+)/, (_, n) => `armor: ${(Number(n) * factor[c]).toFixed(2)}`);
    else block = block.replace(/damage: ([\d.]+)/, (_, n) => `damage: ${(Number(n) * factor[c]).toFixed(2)}`);
    src = src.slice(0, start) + block + src.slice(end);
  }
  writeFileSync(file, src);
  console.log(`updated ${file}`);
}
