/**
 * Economy and progression simulation (design doc section 9):
 *   npm run econ-sim -- --players 100 [--kills 200] [--out docs/ECONOMY_REPORT.md] [--seed 1]
 * Simulated players (a mix of play styles) from level 1 to 100. Per hour they kill, loot (sell or dismantle surplus), do
 * dailies and gates, die (10 % of the scrap on hand is lost, see gameServer), buy ammo, craft, upgrade (with the real
 * +10..+15 failure rule), buy the next vehicle tier and expand the inventory. Output: hours to reach level milestones,
 * per-band faucet/sink tables and how many weeks the best gear takes for a free player compared to a hypothetical payer.
 */
import { writeFileSync } from 'node:fs';
import { SimRNG } from '../shared/prng.ts';
import { rollLoot } from '../shared/data/loot.ts';
import { CRAFTING_RECIPES, ITEM_BY_ID, RARITY_CONFIGS, UPGRADE_LEVEL_STATS } from '../shared/data/items.ts';
import { DUNGEONS } from '../shared/data/dungeons.ts';
import { TIER_CONFIGS, VEHICLE_CATALOG } from '../shared/data/vehicles.ts';
import { calculateKillXP, getXPForLevel, MAX_PLAYER_LEVEL } from '../shared/rules/progression.ts';
import { upgradeCost, MAX_UPGRADE } from '../shared/rules/character.ts';

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
export const KILLS_PER_HOUR = Number(arg('kills', '200')); // kill + approach + loot + regen; the balance report puts a kill at ~10 s of shooting
export const HOURS_PER_DAY = 2;                            // a typical session
export const FREE_GATE_RUNS_PER_DAY = 3;                   // DUNGEON_FREE_KEYS_PER_DAY
export const GATE_RUN_HOURS = 0.2;
const PLAYERS = Number(arg('players', '100'));
const OUT = arg('out', '');
const SEED = Number(arg('seed', '1'));
const BANDS = 11; // levels 1-10 ... 91-99, and 'max level' (the endgame grind for the best gear)
const MAX_HOURS = 3000;

export type Style = 'free' | 'payer';
interface Result { hoursTo: Record<number, number>; band: Array<{ hours: number; faucet: number; sink: number; ore: number; oreSink: number; frag: number; fragSink: number; xpKill: number; xpOther: number }>; gearHours: { plus10: number; plus15: number; tier10: number }; finalLevel: number }

/** Item tiers unlock every 12 levels (shared/data/items.ts): the best tier a player of this level can wear. */
const itemTier = (level: number): number => Math.min(8, 1 + Math.floor((level - 1) / 12));
const SLOTS = 4; // main weapon, armor, engine, secondary

function simulate(seed: number, style: Style, killsPerHour: number, untilBestGear = true): Result {
  const rng = new SimRNG(seed);
  let curItemTier = 1;
  let level = 1, xp = 0, scrap = 0, ore = 0, frag = 0, pity = 0, tier = 1, hours = 0, expansions = 0, nextRecipe = 0;
  const gear = new Array(SLOTS).fill(0);
  const band = Array.from({ length: BANDS }, () => ({ hours: 0, faucet: 0, sink: 0, ore: 0, oreSink: 0, frag: 0, fragSink: 0, xpKill: 0, xpOther: 0 }));
  const hoursTo: Record<number, number> = {};
  const gearHours = { plus10: Infinity, plus15: Infinity, tier10: Infinity };
  const recipes = CRAFTING_RECIPES.filter((r) => ITEM_BY_ID.get(r.outputItemId)?.slotType === 'main').sort((a, b) => a.minLevel - b.minLevel);
  while (hours < MAX_HOURS && !(untilBestGear ? gearHours.plus15 !== Infinity && gearHours.tier10 !== Infinity : level >= MAX_PLAYER_LEVEL)) {
    const bi = level >= MAX_PLAYER_LEVEL ? BANDS - 1 : Math.min(BANDS - 2, Math.floor((level - 1) / 10));
    const b = band[bi];
    hours++; b.hours++;
    // time in gates is time not spent killing
    const gate = [...DUNGEONS].filter((d) => d.minLevel <= level).sort((a, c) => c.recommendedLevel - a.recommendedLevel)[0];
    const killXpHour = killsPerHour * calculateKillXP(level, level, false, false);
    const gateXpHour = gate ? gate.rewards.xp / GATE_RUN_HOURS : 0;
    // a payer only spends the extra keys when a gate pays better per hour than killing does (a rational player)
    const extraRuns = style === 'payer' && gateXpHour > killXpHour ? 3 : 0;
    const runsPerHour = gate ? Math.min((FREE_GATE_RUNS_PER_DAY + extraRuns) / HOURS_PER_DAY, 1 / GATE_RUN_HOURS) : 0;
    const kills = Math.round(killsPerHour * (1 - runsPerHour * GATE_RUN_HOURS));
    // --- faucets: kills
    for (let k = 0; k < kills; k++) {
      const enemyLevel = Math.max(1, level + rng.rangeInt(-2, 3));
      const elite = rng.chance(0.06);
      const loot = rollLoot(rng, enemyLevel, tier, elite, false, pity); pity = loot.newPityCounter;
      let gain = loot.scrap + Math.round((12 + enemyLevel * 6) * 1.3); // drop + crate
      const def = loot.itemId ? ITEM_BY_ID.get(loot.itemId) : undefined;
      if (def) { // surplus: 55 % dismantled, 30 % sold, 15 % kept/ignored
        const rIdx = loot.rarity ? ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'].indexOf(loot.rarity) : 0;
        const roll = rng.next();
        if (roll < 0.55) { const o = Math.round(def.dismantleYield.oreAmount * (1 + rIdx * 0.25)), f = Math.round(def.dismantleYield.fragments * (1 + rIdx * 0.3)); ore += o; b.ore += o; frag += f; b.frag += f; }
        else if (roll < 0.85) gain += Math.round(def.scrapValue * 0.35 * RARITY_CONFIGS[loot.rarity ?? 'Common'].multiplier);
      }
      if (loot.ore) { ore += loot.ore.amount; b.ore += loot.ore.amount; }
      scrap += gain; b.faucet += gain;
      const kx = calculateKillXP(level, enemyLevel, elite, false); xp += kx; b.xpKill += kx;
    }
    // --- dailies: ~5 quests per 1.5 h of play
    const q = Math.round((5 * (80 + level * 40)) / 1.5); scrap += q; b.faucet += q;
    const qx = Math.round((5 * (120 + level * 60) * 0.5) / 1.5); xp += qx; b.xpOther += qx;
    // --- gates: 3 free runs per day (+3 per key pack for a payer), best gate the player qualifies for
    if (gate) {
      const runs = runsPerHour;
      const gs = Math.round(gate.rewards.scrap * runs), gx = Math.round(gate.rewards.xp * runs);
      scrap += gs; b.faucet += gs; xp += gx; b.xpOther += gx;
      const go = Math.round(gate.rewards.oreAmount * runs); ore += go; b.ore += go;
    }
    // --- level ups
    while (xp >= getXPForLevel(level + 1) && level < MAX_PLAYER_LEVEL) {
      xp -= getXPForLevel(level + 1); level++;
      if (!(level in hoursTo)) hoursTo[level] = hours;
    }
    // --- sinks: death (10 % of scrap on hand, about once an hour; payers buy "repair free day" = no loss), ammo, auction tax on part of the sales
    const death = style === 'payer' ? 0 : Math.round(scrap * 0.1); scrap -= death; b.sink += death;
    const ammo = Math.round(60 + level * 4); scrap -= ammo; b.sink += ammo;
    // --- crafting a better main weapon when one becomes available
    while (nextRecipe < recipes.length && recipes[nextRecipe].minLevel <= level) {
      const r = recipes[nextRecipe]; const oreCost = Object.values(r.costOre).reduce((a, c) => a + (c ?? 0), 0);
      if (scrap >= r.costScrap && ore >= oreCost && frag >= r.costFragments) { scrap -= r.costScrap; ore -= oreCost; frag -= r.costFragments; b.sink += r.costScrap; b.oreSink += oreCost; b.fragSink += r.costFragments; gear[0] = Math.min(gear[0], 3); nextRecipe++; } else break;
    }
    // a new item tier replaces the fitted items (drops/crafting); upgrades start again at +0
    if (itemTier(level) > curItemTier) { curItemTier = itemTier(level); gear.fill(0); }
    // --- upgrades (weakest slot first; from +10 a failed normal attempt costs one level, like the game)
    for (let guard = 0; guard < 40; guard++) {
      const i = gear.indexOf(Math.min(...gear));
      if (gear[i] >= MAX_UPGRADE) break;
      const safe = gear[i] >= 9; // from +10 the plain attempt can lose a level; sensible players pay the 2.5x safe-mode price
      const c = upgradeCost(gear[i], safe, itemTier(level));
      if (scrap < c.scrap || ore < c.ore || frag < c.fragments) break;
      scrap -= c.scrap; ore -= c.ore; frag -= c.fragments; b.sink += c.scrap; b.oreSink += c.ore; b.fragSink += c.fragments;
      if (rng.chance(UPGRADE_LEVEL_STATS[gear[i] + 1].successChance)) gear[i]++;
    }
    // --- vehicle tier
    const next = TIER_CONFIGS.find((t) => t.tier === tier + 1);
    if (next) { const v = VEHICLE_CATALOG.find((x) => x.vehicleClass === 'medium' && x.tier === next.tier)!; if (level >= v.minLevel && scrap >= v.costScrap && ore >= v.costOre) { scrap -= v.costScrap; ore -= v.costOre; b.sink += v.costScrap; b.oreSink += v.costOre; tier++; if (tier === 10 && gearHours.tier10 === Infinity) gearHours.tier10 = hours; } }
    // --- inventory expansion once the wallet is comfortable
    const ex = 2000 * (expansions + 1) ** 2;
    if (expansions < 9 && scrap > ex * 3) { scrap -= ex; b.sink += ex; expansions++; }
    const min = Math.min(...gear);
    if (curItemTier < 8) { /* best-gear milestones only count with the final item tier */ } else if (min >= 10 && gearHours.plus10 === Infinity) gearHours.plus10 = hours;
    if (curItemTier === 8 && min >= MAX_UPGRADE && gearHours.plus15 === Infinity) gearHours.plus15 = hours;
  }
  return { hoursTo, band, gearHours, finalLevel: level };
}

// ------------------------------------------------------------------------------------------------ run
const f0 = (n: number) => Math.round(n).toLocaleString('en');
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : 'never');
const med = (a: number[]) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : Infinity; };

export function milestones(players = PLAYERS, kills = KILLS_PER_HOUR, style: Style = 'free', seed = SEED): Record<number, number> {
  const out: Record<number, number> = {};
  const runs = Array.from({ length: players }, (_, p) => simulate(seed * 1000 + p, style, kills, false));
  for (const L of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) out[L] = med(runs.map((r) => r.hoursTo[L] ?? Infinity));
  return out;
}

/** Median hours until the tier 10 vehicle and all four items at +15 (full endgame grind). */
export function bestGearHours(players = 8, kills = KILLS_PER_HOUR, style: Style = 'free', seed = SEED): number {
  const runs = Array.from({ length: players }, (_, p) => simulate(seed * 1000 + p, style, kills, true));
  return med(runs.map((r) => Math.max(r.gearHours.plus15, r.gearHours.tier10)));
}

if (process.argv[1]?.endsWith('econ-sim.ts')) {
  const runsFree = Array.from({ length: PLAYERS }, (_, p) => simulate(SEED * 1000 + p, 'free', KILLS_PER_HOUR));
  const runsPay = Array.from({ length: PLAYERS }, (_, p) => simulate(SEED * 1000 + p, 'payer', KILLS_PER_HOUR));
  const lines: string[] = [];
  const P = (s = '') => lines.push(s);
  P('# Economy and progression report');
  P();
  P(`Generated by \`npm run econ-sim\` (${PLAYERS} simulated players per style, ${KILLS_PER_HOUR} kills per hour of play, ${HOURS_PER_DAY} h per day).`);
  P();
  P('## Hours to reach a level (median)');
  P();
  P('| level | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100 |');
  P('|---|---|---|---|---|---|---|---|---|---|---|');
  const m = (rs: Result[]) => [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((L) => f1(med(rs.map((r) => r.hoursTo[L] ?? Infinity))));
  P(`| free player | ${m(runsFree).join(' | ')} |`);
  P(`| hypothetical payer | ${m(runsPay).join(' | ')} |`);
  P();
  P('Design targets: level 30 in about 20 h, level 60 in about 120 h, level 100 in about 500 h.');
  P();
  P('## Faucets and sinks per level band (free player, per player)');
  P();
  P('| levels | hours | scrap faucet | scrap sink | sink / faucet | ore in | ore sink | fragments in | fragments sink | kill XP share |');
  P('|---|---|---|---|---|---|---|---|---|---|');
  for (let i = 0; i < BANDS; i++) {
    const ok = runsFree.filter((r) => r.band[i].hours > 0);
    if (!ok.length) continue;
    const sum = (k: keyof Result['band'][number]) => ok.reduce((a, r) => a + r.band[i][k], 0) / ok.length;
    P(`| ${i === BANDS - 1 ? 'max level' : `${i * 10 + 1}-${Math.min(99, i * 10 + 10)}`} | ${f1(sum('hours'))} | ${f0(sum('faucet'))} | ${f0(sum('sink'))} | ${(sum('sink') / Math.max(1, sum('faucet')) * 100).toFixed(0)} % | ${f0(sum('ore'))} | ${f0(sum('oreSink'))} | ${f0(sum('frag'))} | ${f0(sum('fragSink'))} | ${(sum('xpKill') / Math.max(1, sum('xpKill') + sum('xpOther')) * 100).toFixed(0)} % |`);
  }
  P();
  const wk = (h: number, hoursPerWeek: number) => (Number.isFinite(h) ? (h / hoursPerWeek).toFixed(1) : 'never');
  const g = (rs: Result[], k: keyof Result['gearHours']) => med(rs.map((r) => r.gearHours[k]));
  P('## Best gear: how long does it take?');
  P();
  P('"Best gear" = the vehicle of tier 10 and all four fitted items upgraded to +15 (the strongest state the game allows). Weeks assume a casual player (14 h/week) and a dedicated one (35 h/week).');
  P();
  P('| milestone | free player (h) | casual weeks | dedicated weeks | hypothetical payer (h) | payer saves |');
  P('|---|---|---|---|---|---|');
  for (const [label, key] of [['all items +10', 'plus10'], ['tier 10 vehicle', 'tier10'], ['all items +15', 'plus15']] as const) {
    const a = g(runsFree, key), b = g(runsPay, key);
    P(`| ${label} | ${f1(a)} | ${wk(a, 14)} | ${wk(a, 35)} | ${f1(b)} | ${Number.isFinite(a) && Number.isFinite(b) ? ((1 - b / a) * 100).toFixed(0) + ' %' : '-'} |`);
  }
  P();
  P('The payer model buys the only things the (disabled) premium shop sells that touch progression: "repair free day" (no death penalty) and gate key packs (+3 gate runs per day). Inventory slots, garage slots and skins do not change income. The result must show that paying shortens the grind only slightly.');
  const text = lines.join('\n') + '\n';
  if (OUT) { writeFileSync(OUT, text); console.log(`wrote ${OUT}`); } else console.log(text);
}
