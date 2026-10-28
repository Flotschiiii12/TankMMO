/**
 * Economy simulation (design doc section 9): runs simulated players from level 1 to 60 and prints, per 10-level band,
 * the scrap/ore faucets (kills, quests) against the sinks (upgrades, repairs, ammo, expansions, vehicles).
 *   npm run econ-sim -- --players 200
 */
import { SimRNG } from '../shared/prng.ts';
import { rollLoot } from '../shared/data/loot.ts';
import { ITEM_BY_ID, UPGRADE_LEVEL_STATS } from '../shared/data/items.ts';
import { VEHICLE_CATALOG } from '../shared/data/vehicles.ts';
import { calculateKillXP, getXPForLevel } from '../shared/rules/progression.ts';

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const PLAYERS = Number(arg('players', '100'));
const KILLS_PER_HOUR = 220; // a focused hour of play
const MAX_LEVEL = 60;

interface Band { faucetScrap: number; faucetOre: number; sinkScrap: number; sinkOre: number; hours: number; players: number }
const bands: Band[] = Array.from({ length: 6 }, () => ({ faucetScrap: 0, faucetOre: 0, sinkScrap: 0, sinkOre: 0, hours: 0, players: 0 }));

for (let p = 0; p < PLAYERS; p++) {
  const rng = new SimRNG(1000 + p);
  let level = 1, xp = 0, scrap = 0, ore = 0, pity = 0, tier = 1, hours = 0;
  const gear = [0, 0, 0, 0]; // main weapon, armor, engine, secondary: all four get upgraded (cheapest first)
  const seenBand = new Set<number>();
  while (level < MAX_LEVEL && hours < 4000) {
    const b = bands[Math.min(5, Math.floor((level - 1) / 10))];
    seenBand.add(Math.min(5, Math.floor((level - 1) / 10)));
    hours++; b.hours++;
    for (let k = 0; k < KILLS_PER_HOUR; k++) {
      const enemyLevel = Math.max(1, level + rng.rangeInt(-2, 3));
      const elite = rng.chance(0.06);
      const loot = rollLoot(rng, enemyLevel, tier, elite, false, pity); pity = loot.newPityCounter;
      let gain = loot.scrap + 12 + enemyLevel * 6; // drop + crate
      const def = loot.itemId ? ITEM_BY_ID.get(loot.itemId) : undefined;
      if (def && rng.chance(0.7)) { gain += Math.round(def.scrapValue * 0.35); ore += def.dismantleYield.oreAmount; b.faucetOre += def.dismantleYield.oreAmount; } // sell/dismantle surplus
      if (loot.ore) { ore += loot.ore.amount; b.faucetOre += loot.ore.amount; }
      scrap += gain; b.faucetScrap += gain;
      xp += calculateKillXP(level, enemyLevel, elite, false);
    }
    // quest income per hour (dailies roughly 5 x level-scaled reward over ~1.5 h)
    const quest = Math.round((5 * (80 + level * 40)) / 1.5); scrap += quest; b.faucetScrap += quest;
    xp += Math.round((5 * (120 + level * 60) * 0.5) / 1.5);
    while (xp >= getXPForLevel(level + 1) && level < MAX_LEVEL) { xp -= getXPForLevel(level + 1); level++; }
    // sinks: repair after deaths (none < level 10), ammo, then upgrades
    const repair = level < 10 ? 0 : Math.round(level * 12 * 2); scrap -= repair; b.sinkScrap += repair;
    const ammo = 60 + level * 4; scrap -= ammo; b.sinkScrap += ammo;
    for (;;) {
      const i = gear.indexOf(Math.min(...gear));
      if (gear[i] >= 15) break;
      const n = UPGRADE_LEVEL_STATS[gear[i] + 1];
      const retry = n.successChance < 1 ? 1 / n.successChance : 1;
      const costScrap = n.costScrap * (1 + (tier - 1) * 0.15) * retry, costOre = n.costOre * retry;
      if (scrap < costScrap || ore < costOre) break;
      scrap -= costScrap; ore -= costOre; b.sinkScrap += costScrap; b.sinkOre += costOre; gear[i]++;
    }
    const nextTier = VEHICLE_CATALOG.find((v) => v.vehicleClass === 'medium' && v.tier === tier + 1);
    if (nextTier && level >= nextTier.minLevel && scrap >= nextTier.costScrap && ore >= nextTier.costOre) { scrap -= nextTier.costScrap; ore -= nextTier.costOre; b.sinkScrap += nextTier.costScrap; b.sinkOre += nextTier.costOre; tier++; gear.fill(0); }
  }
  seenBand.forEach((i) => bands[i].players++);
}

const f = (n: number) => Math.round(n).toLocaleString('en');
console.log(`Economy simulation: ${PLAYERS} players, ${KILLS_PER_HOUR} kills/hour, level 1 -> ${MAX_LEVEL}`);
console.log('levels      hours/player  scrap faucet   scrap sink    net      ore faucet   ore sink   sink/faucet(scrap)');
bands.forEach((b, i) => {
  if (!b.players) return;
  console.log(`${String(i * 10 + 1).padStart(2)}-${String(Math.min(60, i * 10 + 10)).padEnd(2)}      ${(b.hours / b.players).toFixed(1).padStart(8)}      ${f(b.faucetScrap / b.players).padStart(10)}  ${f(b.sinkScrap / b.players).padStart(10)}  ${f((b.faucetScrap - b.sinkScrap) / b.players).padStart(9)}  ${f(b.faucetOre / b.players).padStart(10)}  ${f(b.sinkOre / b.players).padStart(9)}   ${(b.sinkScrap / Math.max(1, b.faucetScrap) * 100).toFixed(0)}%`);
});
