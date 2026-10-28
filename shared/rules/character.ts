/**
 * Character progression and the workshop (design doc sections 4 and 5), as pure rules over a plain-data
 * CharacterState. Randomness comes from the SimRNG you pass in; nothing here touches time or the DOM.
 * All mutating functions return `{ ok: true, ... }` or `{ ok: false, error }` and leave the state untouched on failure.
 */
import type { DroneSpec } from '../types.ts';
import { MG_MAIN_DAMAGE_RATIO } from '../data/balance.ts';
import { AFFIX_POOL, AFFIX_ROLL_BIAS } from '../data/affixes.ts';
import {
  CRAFTING_RECIPES,
  ITEM_BY_ID,
  ItemAffix,
  ItemRarity,
  ItemSlotType,
  RARITY_CONFIGS,
  UPGRADE_LEVEL_STATS,
} from '../data/items.ts';
import { TALENT_BY_ID, TALENTS_CATALOG } from '../data/talents.ts';
import { VEHICLE_CATALOG } from '../data/vehicles.ts';
import { SimRNG } from '../prng.ts';
import type { QuestLog, SeasonState } from './quests.ts';
import { createQuestLog, createSeasonState } from './quests.ts';
import { getEarnedTalentPoints, getGarageCapacity, getXPForLevel, MAX_PLAYER_LEVEL } from './progression.ts';

export type PlayerFaction = 'coastal' | 'highland' | 'steppe';
export const FACTIONS: PlayerFaction[] = ['coastal', 'highland', 'steppe'];
export const HOME_MAP_BY_FACTION: Record<PlayerFaction, number> = { coastal: 1, highland: 5, steppe: 9 };
export const FACTION_CHANGE_COOLDOWN_SECONDS = 7 * 86400;
export const FACTION_CHANGE_COST = 20_000;

export type OreType = 'iron' | 'copper' | 'titanium' | 'crystal';
export const RARITIES: ItemRarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

export const BASE_INVENTORY_SLOTS = 60;
export const MAX_INVENTORY_SLOTS = 150;
export const INVENTORY_EXPANSION_STEP = 10;
export const MAX_REROLLS = 3;
export const MAX_UPGRADE = 15;
export const SAFE_MODE_COST_MULT = 2.5;
/** Upgrade costs grow with the item's tier (tier 1 = the table in items.ts): the endgame sink that keeps top gear very grindy. */
export const UPGRADE_TIER_SCRAP_GROWTH = 1.45;
export const UPGRADE_TIER_MATERIAL_GROWTH = 1.25;
export const FUSION_INPUT_COUNT = 3;
/** Item rarity/upgrade multiplier cap for speed bonuses. */
export const MAX_SPEED_ITEM_MULT = 1.5;
export const MASTERY_MAX = 10;
export const MASTERY_BONUS_PER_LEVEL = 0.01;

export interface ItemInstance {
  uid: string;
  defId: string;
  rarity: ItemRarity;
  upgrade: number;
  affixes: ItemAffix[];
  rerolls: number;
  bound: boolean;
}

export interface Wallet {
  scrap: number;
  ore: Record<OreType, number>;
  fragments: number;
  honor: number;
  factionMarks: number;
  seasonMarks: number;
  gateKeys: number;
  /** Premium currency ("Cells"). Model only: earning/buying is disabled while FLAGS.premiumCurrencyEnabled is false. */
  cells: number;
}

export interface GarageVehicle {
  vehicleId: string;
  masteryXp: number;
  /** slot key -> item uid. Keys: main0, main1, secondary0, armor0, engine0, module0..3, drone0..1 */
  loadout: Record<string, string>;
}

export interface CharacterState {
  name: string;
  level: number;
  xp: number; // xp into the current level
  talentRanks: Record<string, number>;
  wallet: Wallet;
  inventory: ItemInstance[];
  inventoryExpansions: number;
  garage: GarageVehicle[];
  activeVehicle: string;
  pityCounter: number;
  nextUid: number;
  respecs: number;
  quests: QuestLog;
  season: SeasonState;
  /** cosmetic: one of season.skins, shown to other players */
  activeSkin?: string;
  /** faction/general reputation points by faction key */
  reputation: Record<string, number>;
  faction: PlayerFaction;
  /** maps whose safe zones the player has reached (fast travel targets) */
  visitedMaps: number[];
  /** event counters feeding achievements (see achievements.ts) */
  stats: Record<string, number>;
  achievements: string[];
  codex: Record<string, string[]>;
  /** server seconds of the last change (0 = never changed after the free first choice) */
  factionChangedAt: number;
}

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export function createCharacter(name: string): CharacterState {
  return {
    name,
    level: 1,
    xp: 0,
    talentRanks: {},
    wallet: { scrap: 0, ore: { iron: 0, copper: 0, titanium: 0, crystal: 0 }, fragments: 0, honor: 0, factionMarks: 0, seasonMarks: 0, gateKeys: 0, cells: 0 },
    inventory: [],
    inventoryExpansions: 0,
    garage: [{ vehicleId: 'veh_medium_t1', masteryXp: 0, loadout: {} }],
    activeVehicle: 'veh_medium_t1',
    pityCounter: 0,
    nextUid: 1,
    respecs: 0,
    quests: createQuestLog(),
    season: createSeasonState(),
    reputation: {},
    faction: 'coastal',
    visitedMaps: [1],
    stats: {},
    achievements: [],
    codex: {},
    factionChangedAt: 0,
  };
}

// ---------------------------------------------------------------------------
// XP and levels
// ---------------------------------------------------------------------------

export function grantXP(ch: CharacterState, amount: number): { levelsGained: number } {
  if (amount <= 0 || ch.level >= MAX_PLAYER_LEVEL) return { levelsGained: 0 };
  ch.xp += Math.round(amount);
  let gained = 0;
  while (ch.level < MAX_PLAYER_LEVEL && ch.xp >= getXPForLevel(ch.level + 1)) {
    ch.xp -= getXPForLevel(ch.level + 1);
    ch.level++;
    gained++;
  }
  if (ch.level >= MAX_PLAYER_LEVEL) ch.xp = 0;
  return { levelsGained: gained };
}

// ---------------------------------------------------------------------------
// Talents
// ---------------------------------------------------------------------------

export function talentPointsSpent(ch: CharacterState): number {
  return Object.values(ch.talentRanks).reduce((a, b) => a + b, 0);
}

export function talentPointsAvailable(ch: CharacterState): number {
  return getEarnedTalentPoints(ch.level) - talentPointsSpent(ch);
}

/** Why a talent cannot get another rank right now (same checks, same order as rankUpTalent; the talent screen uses it for its states). */
export function canRankTalent(ch: CharacterState, id: string): Result {
  const def = TALENT_BY_ID.get(id);
  if (!def) return fail('unknown_talent');
  const rank = ch.talentRanks[id] ?? 0;
  if (rank >= def.maxRank) return fail('max_rank');
  if (ch.level < def.minLevel) return fail('level_too_low');
  if (talentPointsAvailable(ch) <= 0) return fail('no_points');
  for (const pre of def.prerequisites ?? []) if ((ch.talentRanks[pre] ?? 0) < 1) return fail('prerequisite_missing');
  return { ok: true };
}

export function rankUpTalent(ch: CharacterState, id: string): Result<{ rank: number }> {
  const can = canRankTalent(ch, id);
  if (!can.ok) return can;
  const rank = (ch.talentRanks[id] ?? 0) + 1;
  ch.talentRanks[id] = rank;
  return { ok: true, rank };
}

export function respecCost(ch: CharacterState): number {
  return Math.round(200 * ch.level * (1 + Math.min(ch.respecs, 5) * 0.25));
}

export function respecTalents(ch: CharacterState): Result<{ refundedPoints: number; cost: number }> {
  const cost = respecCost(ch);
  const spent = talentPointsSpent(ch);
  if (spent === 0) return fail('nothing_to_reset');
  if (ch.wallet.scrap < cost) return fail('not_enough_scrap');
  ch.wallet.scrap -= cost;
  ch.talentRanks = {};
  ch.respecs++;
  return { ok: true, refundedPoints: spent, cost };
}

/** Sum of talent effects per stat key (percent stats as fractions, e.g. 0.15 = +15 %). */
export function talentTotals(ch: CharacterState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of TALENTS_CATALOG) {
    const rank = ch.talentRanks[t.id] ?? 0;
    if (rank > 0) out[t.effectPerRank.stat] = (out[t.effectPerRank.stat] ?? 0) + t.effectPerRank.valuePerRank * rank;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export function inventoryCapacity(ch: CharacterState): number {
  const talentSlots = Math.round(talentTotals(ch)['inventory_slots'] ?? 0);
  return Math.min(MAX_INVENTORY_SLOTS, BASE_INVENTORY_SLOTS + ch.inventoryExpansions * INVENTORY_EXPANSION_STEP + talentSlots);
}

export function expansionCost(ch: CharacterState): number {
  return 2000 * (ch.inventoryExpansions + 1) ** 2;
}

export function expandInventory(ch: CharacterState): Result<{ capacity: number }> {
  if (inventoryCapacity(ch) >= MAX_INVENTORY_SLOTS) return fail('max_capacity');
  const cost = expansionCost(ch);
  if (ch.wallet.scrap < cost) return fail('not_enough_scrap');
  ch.wallet.scrap -= cost;
  ch.inventoryExpansions++;
  return { ok: true, capacity: inventoryCapacity(ch) };
}

export function rollAffixes(rng: SimRNG, rarity: ItemRarity, exclude: ItemAffix['stat'][] = []): ItemAffix[] {
  const count = RARITY_CONFIGS[rarity].affixCount;
  const pool = AFFIX_POOL.filter((a) => !exclude.includes(a.stat));
  const out: ItemAffix[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = rng.rangeInt(0, pool.length - 1);
    const a = pool.splice(idx, 1)[0];
    const t = Math.min(1, rng.next() * (1 - AFFIX_ROLL_BIAS[rarity]) + AFFIX_ROLL_BIAS[rarity]);
    out.push({ stat: a.stat, nameKey: a.nameKey, value: Math.round((a.min + (a.max - a.min) * t) * 10) / 10 });
  }
  return out;
}

export function createItem(ch: CharacterState, defId: string, rarity: ItemRarity, rng: SimRNG, bound = false): Result<{ item: ItemInstance }> {
  if (!ITEM_BY_ID.has(defId)) return fail('unknown_item');
  if (ch.inventory.length >= inventoryCapacity(ch)) return fail('inventory_full');
  const item: ItemInstance = { uid: `i${ch.nextUid++}`, defId, rarity, upgrade: 0, affixes: rollAffixes(rng, rarity), rerolls: 0, bound };
  ch.inventory.push(item);
  return { ok: true, item };
}

export function findItem(ch: CharacterState, uid: string): ItemInstance | undefined {
  return ch.inventory.find((i) => i.uid === uid);
}

export function isEquipped(ch: CharacterState, uid: string): boolean {
  return ch.garage.some((g) => Object.values(g.loadout).includes(uid));
}

// ---------------------------------------------------------------------------
// Garage and equipment
// ---------------------------------------------------------------------------

export function unlockedVehicleIds(ch: CharacterState): string[] {
  return ch.garage.map((g) => g.vehicleId);
}

export function buyVehicle(ch: CharacterState, vehicleId: string): Result {
  const v = VEHICLE_CATALOG.find((x) => x.id === vehicleId);
  if (!v) return fail('unknown_vehicle');
  if (ch.garage.some((g) => g.vehicleId === vehicleId)) return fail('already_owned');
  if (ch.garage.length >= getGarageCapacity(ch.level)) return fail('garage_full');
  if (ch.level < v.minLevel) return fail('level_too_low');
  if (ch.wallet.scrap < v.costScrap) return fail('not_enough_scrap');
  const ore = Object.keys(ch.wallet.ore) as OreType[];
  const have = ore.reduce((a, k) => a + ch.wallet.ore[k], 0);
  if (have < v.costOre) return fail('not_enough_ore');
  ch.wallet.scrap -= v.costScrap;
  // Ore is paid cheapest-first (iron, copper, titanium, crystal)
  let due = v.costOre;
  for (const k of ore) {
    const take = Math.min(due, ch.wallet.ore[k]);
    ch.wallet.ore[k] -= take;
    due -= take;
  }
  ch.garage.push({ vehicleId, masteryXp: 0, loadout: {} });
  return { ok: true };
}

export function slotKeysFor(vehicleId: string): Array<{ key: string; type: ItemSlotType }> {
  const v = VEHICLE_CATALOG.find((x) => x.id === vehicleId);
  if (!v) return [];
  const keys: Array<{ key: string; type: ItemSlotType }> = [];
  for (let i = 0; i < v.mainSlots; i++) keys.push({ key: `main${i}`, type: 'main' });
  for (let i = 0; i < v.secondarySlots; i++) keys.push({ key: `secondary${i}`, type: 'secondary' });
  for (let i = 0; i < v.armorSlots; i++) keys.push({ key: `armor${i}`, type: 'armor' });
  for (let i = 0; i < v.engineSlots; i++) keys.push({ key: `engine${i}`, type: 'engine' });
  for (let i = 0; i < v.moduleSlots; i++) keys.push({ key: `module${i}`, type: 'module' });
  for (let i = 0; i < v.droneSlots; i++) keys.push({ key: `drone${i}`, type: 'drone' });
  return keys;
}

export function equipItem(ch: CharacterState, vehicleId: string, slotKey: string, uid: string): Result {
  const g = ch.garage.find((x) => x.vehicleId === vehicleId);
  if (!g) return fail('vehicle_not_owned');
  const slot = slotKeysFor(vehicleId).find((s) => s.key === slotKey);
  if (!slot) return fail('no_such_slot');
  const item = findItem(ch, uid);
  if (!item) return fail('item_not_found');
  const def = ITEM_BY_ID.get(item.defId)!;
  if (def.slotType !== slot.type) return fail('wrong_slot_type');
  if (ch.level < def.minLevel) return fail('level_too_low');
  if (isEquipped(ch, uid)) return fail('already_equipped');
  g.loadout[slotKey] = uid;
  return { ok: true };
}

export function unequipItem(ch: CharacterState, vehicleId: string, slotKey: string): Result {
  const g = ch.garage.find((x) => x.vehicleId === vehicleId);
  if (!g || !g.loadout[slotKey]) return fail('nothing_equipped');
  delete g.loadout[slotKey];
  return { ok: true };
}

export function addMasteryXp(ch: CharacterState, vehicleId: string, xp: number): void {
  const g = ch.garage.find((x) => x.vehicleId === vehicleId);
  if (g) g.masteryXp += Math.max(0, Math.round(xp));
}

/** Mastery level 0..10: 400 * n^1.6 xp per level. */
export function masteryLevel(masteryXp: number): number {
  let lvl = 0;
  let need = 0;
  while (lvl < MASTERY_MAX) {
    need += Math.round(400 * (lvl + 1) ** 1.6);
    if (masteryXp < need) break;
    lvl++;
  }
  return lvl;
}

// ---------------------------------------------------------------------------
// Workshop: upgrade, dismantle, craft, reroll, fusion
// ---------------------------------------------------------------------------

function canPay(w: Wallet, scrap: number, ore: number, fragments: number): boolean {
  return w.scrap >= scrap && totalOre(w) >= ore && w.fragments >= fragments;
}
function totalOre(w: Wallet): number {
  return w.ore.iron + w.ore.copper + w.ore.titanium + w.ore.crystal;
}
function payOre(w: Wallet, amount: number, prefer?: OreType): void {
  const order: OreType[] = prefer ? [prefer, ...(['iron', 'copper', 'titanium', 'crystal'] as OreType[]).filter((k) => k !== prefer)] : ['iron', 'copper', 'titanium', 'crystal'];
  let due = amount;
  for (const k of order) {
    const take = Math.min(due, w.ore[k]);
    w.ore[k] -= take;
    due -= take;
  }
}

export function upgradeCost(level: number, safeMode: boolean, itemTier = 1): { scrap: number; ore: number; fragments: number } {
  const next = UPGRADE_LEVEL_STATS[level + 1];
  const mult = safeMode ? SAFE_MODE_COST_MULT : 1;
  const t = Math.max(1, itemTier) - 1;
  const scrapMult = mult * UPGRADE_TIER_SCRAP_GROWTH ** t, matMult = mult * UPGRADE_TIER_MATERIAL_GROWTH ** t;
  return { scrap: Math.round(next.costScrap * scrapMult), ore: Math.round(next.costOre * matMult), fragments: Math.round(next.costFragments * matMult) };
}

/**
 * +1 upgrade. Levels 1-9 always succeed. From +10 the chance is below 100 %: on failure a normal attempt
 * drops one level (never below +9); safe mode costs more but never drops. No real-money randomness.
 */
export function upgradeItem(ch: CharacterState, uid: string, rng: SimRNG, safeMode = false): Result<{ success: boolean; newLevel: number }> {
  const item = findItem(ch, uid);
  if (!item) return fail('item_not_found');
  if (item.upgrade >= MAX_UPGRADE) return fail('max_upgrade');
  const cost = upgradeCost(item.upgrade, safeMode, ITEM_BY_ID.get(item.defId)?.tier ?? 1);
  if (!canPay(ch.wallet, cost.scrap, cost.ore, cost.fragments)) return fail('not_enough_materials');
  ch.wallet.scrap -= cost.scrap;
  payOre(ch.wallet, cost.ore);
  ch.wallet.fragments -= cost.fragments;
  const next = UPGRADE_LEVEL_STATS[item.upgrade + 1];
  const success = next.successChance >= 1 || rng.chance(next.successChance);
  if (success) item.upgrade++;
  else if (!safeMode && item.upgrade >= 10) item.upgrade = Math.max(9, item.upgrade - 1);
  return { ok: true, success, newLevel: item.upgrade };
}

/** What dismantling an item yields (also used by the bulk-dismantle review screen, so preview and result can never differ). */
export function dismantleYieldOf(item: ItemInstance): { ore: OreType; oreAmount: number; fragments: number } {
  const def = ITEM_BY_ID.get(item.defId)!;
  const rarityIdx = RARITIES.indexOf(item.rarity);
  return {
    ore: def.dismantleYield.oreType,
    oreAmount: Math.round(def.dismantleYield.oreAmount * (1 + rarityIdx * 0.25) * (1 + item.upgrade * 0.1)),
    fragments: Math.round(def.dismantleYield.fragments * (1 + rarityIdx * 0.3) * (1 + item.upgrade * 0.15)),
  };
}

export function dismantleItem(ch: CharacterState, uid: string): Result<{ ore: OreType; oreAmount: number; fragments: number }> {
  const item = findItem(ch, uid);
  if (!item) return fail('item_not_found');
  if (isEquipped(ch, uid)) return fail('item_equipped');
  const def = ITEM_BY_ID.get(item.defId)!;
  const { oreAmount, fragments } = dismantleYieldOf(item);
  ch.wallet.ore[def.dismantleYield.oreType] += oreAmount;
  ch.wallet.fragments += fragments;
  ch.inventory = ch.inventory.filter((i) => i.uid !== uid);
  return { ok: true, ore: def.dismantleYield.oreType, oreAmount, fragments };
}

/** What a recipe costs this character right now (crafting talents lower it). Shared by craftItem and the workshop screen. */
export function craftCost(ch: CharacterState, recipe: { costScrap: number; costFragments: number; costOre: Partial<Record<OreType, number>> }): { scrap: number; fragments: number; ore: Array<[OreType, number]> } {
  const reduction = Math.min(0.5, talentTotals(ch)['crafting_cost_reduction'] ?? 0);
  return {
    scrap: Math.round(recipe.costScrap * (1 - reduction)),
    fragments: Math.round(recipe.costFragments * (1 - reduction)),
    ore: (Object.entries(recipe.costOre) as Array<[OreType, number]>).map(([k, n]) => [k, Math.round(n * (1 - reduction))]),
  };
}

export function craftItem(ch: CharacterState, recipeId: string, rng: SimRNG): Result<{ item: ItemInstance }> {
  const recipe = CRAFTING_RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return fail('unknown_recipe');
  if (ch.level < recipe.minLevel) return fail('level_too_low');
  const cost = craftCost(ch, recipe);
  const oreOk = cost.ore.every(([k, n]) => ch.wallet.ore[k] >= n);
  if (ch.wallet.scrap < cost.scrap || ch.wallet.fragments < cost.fragments || !oreOk) return fail('not_enough_materials');
  if (ch.inventory.length >= inventoryCapacity(ch)) return fail('inventory_full');
  ch.wallet.scrap -= cost.scrap;
  ch.wallet.fragments -= cost.fragments;
  for (const [k, n] of cost.ore) ch.wallet.ore[k] -= n;
  const def = ITEM_BY_ID.get(recipe.outputItemId)!;
  const made = createItem(ch, def.id, def.baseRarity, rng);
  if (!made.ok) return made;
  return { ok: true, item: made.item };
}

export function rerollCost(item: ItemInstance): { scrap: number; fragments: number } {
  const def = ITEM_BY_ID.get(item.defId)!;
  const n = item.rerolls + 1;
  return { scrap: Math.round(def.scrapValue * 2 * n * n), fragments: 10 * n * def.tier };
}

/** Rerolls ONE affix (index). Max 3 rerolls per item, cost grows quadratically. */
export function rerollAffix(ch: CharacterState, uid: string, affixIndex: number, rng: SimRNG): Result<{ affix: ItemAffix }> {
  const item = findItem(ch, uid);
  if (!item) return fail('item_not_found');
  if (item.affixes.length === 0) return fail('no_affixes');
  if (!Number.isInteger(affixIndex) || affixIndex < 0 || affixIndex >= item.affixes.length) return fail('bad_affix_index');
  if (item.rerolls >= MAX_REROLLS) return fail('max_rerolls');
  const cost = rerollCost(item);
  if (ch.wallet.scrap < cost.scrap || ch.wallet.fragments < cost.fragments) return fail('not_enough_materials');
  ch.wallet.scrap -= cost.scrap;
  ch.wallet.fragments -= cost.fragments;
  const keep = item.affixes.filter((_, i) => i !== affixIndex).map((a) => a.stat);
  const rolled = rollAffixes(rng, item.rarity, keep)[0];
  if (rolled) item.affixes[affixIndex] = rolled;
  item.rerolls++;
  return { ok: true, affix: item.affixes[affixIndex] };
}

export const FUSION_UPGRADE_CHANCE: Record<ItemRarity, number> = { Common: 0.30, Uncommon: 0.22, Rare: 0.15, Epic: 0.08, Legendary: 0 };

/** 3 identical items (same definition and rarity) -> 1 item with a chance of the next rarity up. */
export function fuseItems(ch: CharacterState, uids: string[], rng: SimRNG): Result<{ item: ItemInstance; upgraded: boolean }> {
  if (!Array.isArray(uids) || uids.length !== FUSION_INPUT_COUNT || new Set(uids).size !== FUSION_INPUT_COUNT) return fail('need_three_distinct');
  const items = uids.map((u) => findItem(ch, u));
  if (items.some((i) => !i)) return fail('item_not_found');
  const [a, b, c] = items as ItemInstance[];
  if (a.defId !== b.defId || a.defId !== c.defId || a.rarity !== b.rarity || a.rarity !== c.rarity) return fail('not_identical');
  if (uids.some((u) => isEquipped(ch, u))) return fail('item_equipped');
  const upgraded = rng.chance(FUSION_UPGRADE_CHANCE[a.rarity]);
  const rarity = upgraded ? RARITIES[Math.min(RARITIES.length - 1, RARITIES.indexOf(a.rarity) + 1)] : a.rarity;
  ch.inventory = ch.inventory.filter((i) => !uids.includes(i.uid));
  const made = createItem(ch, a.defId, rarity, rng, a.bound || b.bound || c.bound);
  if (!made.ok) return made;
  return { ok: true, item: made.item, upgraded };
}

// ---------------------------------------------------------------------------
// Stats: vehicle + level + gear + talents + mastery
// ---------------------------------------------------------------------------

export interface LoadoutStats {
  vehicleId: string;
  vehicleClass: string;
  tier: number;
  maxHull: number;
  maxArmor: number;
  maxSpeed: number;
  turnRate: number;
  turretTurnRate: number;
  mainDamage: number;
  mainReloadTime: number;
  mainRange: number;
  mgDamage: number;
  mgRange: number;
  critChance: number;
  critDamage: number;
  flatReduction: number;
  dps: number;
  drones: DroneSpec[];
  radarMult: number;
  mainFamily?: string;
}

/** Radar range factor from recon drones: +8 % per drone tier scaled by the drone's quality, capped at +60 %. */
export function radarMultiplier(drones: DroneSpec[]): number {
  let bonus = 0;
  for (const d of drones) if (d.type === 'recon') bonus += 0.08 * d.tier * Math.min(2, d.power / (40 * d.tier));
  return 1 + Math.min(0.6, bonus);
}

/** Module effects per tier (percent, or flat for 'flat_reduction'). Modules without a stat entry are utility only. */
export const MODULE_EFFECTS: Record<string, { stat: 'dps' | 'hull' | 'armor' | 'speed' | 'crit_chance' | 'flat_reduction' | 'reload_speed' | 'range'; perTier: number }> = {
  targeting_aid: { stat: 'crit_chance', perTier: 1 }, auto_repair: { stat: 'hull', perTier: 2 }, plating_hardener: { stat: 'armor', perTier: 3 },
  reinforced_tracks: { stat: 'speed', perTier: 2 }, stabilizer: { stat: 'range', perTier: 2 }, overclocker: { stat: 'reload_speed', perTier: 2 },
  energy_absorber: { stat: 'flat_reduction', perTier: 2 }, blast_shield: { stat: 'flat_reduction', perTier: 2 }, optics_suite: { stat: 'range', perTier: 3 },
  ammo_drum: { stat: 'dps', perTier: 2 }, emergency_shield: { stat: 'hull', perTier: 2 }, fuel_saver: { stat: 'speed', perTier: 1 },
};

export function itemStatMultiplier(item: ItemInstance): number {
  return RARITY_CONFIGS[item.rarity].multiplier * UPGRADE_LEVEL_STATS[item.upgrade].statMult;
}

export function computeLoadoutStats(ch: CharacterState, vehicleId = ch.activeVehicle): LoadoutStats | undefined {
  const v = VEHICLE_CATALOG.find((x) => x.id === vehicleId);
  const g = ch.garage.find((x) => x.vehicleId === vehicleId);
  if (!v || !g) return undefined;
  const tal = talentTotals(ch);
  const mastery = 1 + masteryLevel(g.masteryXp) * MASTERY_BONUS_PER_LEVEL;
  const levelMult = 1 + (ch.level - 1) * 0.02;

  const drones: DroneSpec[] = [];
  let mainFamily: string | undefined;
  let hullBonus = 0, armorBonus = 0, speedBonus = 0, flat = 0, dmgAdd = 0, mgAdd = 0, range = v.range, mgRange = 300;
  let affDps = 0, affHull = 0, affArmor = 0, affSpeed = 0, affCrit = 0, affFlat = 0, affReload = 0, affRange = 0;
  for (const uid of Object.values(g.loadout)) {
    const item = findItem(ch, uid);
    if (!item) continue;
    const def = ITEM_BY_ID.get(item.defId)!;
    const m = itemStatMultiplier(item);
    if (def.slotType === 'main') { mainFamily ??= def.family; dmgAdd += (def.baseDPS ?? 0) * m * 0.5; range = Math.max(range, def.baseRange ?? range); }
    if (def.slotType === 'secondary') { mgAdd += (def.baseDPS ?? 0) * m * 0.15; mgRange = Math.max(mgRange, def.baseRange ?? mgRange); }
    if (def.slotType === 'drone') {
      const dt = def.id.replace(/^drn_/, '').replace(/_t\d+$/, '');
      const slot = Number(/^drone(\d+)$/.exec(Object.entries(g.loadout).find(([, u]) => u === uid)?.[0] ?? '')?.[1] ?? drones.length);
      drones.push({ type: dt, tier: def.tier, slot, power: Math.round((def.baseDPS ?? 0) * m * (1 + (tal['drone_efficiency'] ?? 0))) }); // the drone's own gun / effect replaces the old flat damage bonus
    }
    hullBonus += (def.baseHullBonus ?? 0) * m;
    armorBonus += (def.baseArmorBonus ?? 0) * m;
    speedBonus += (def.baseSpeedBonus ?? 0) * Math.min(m, MAX_SPEED_ITEM_MULT); // rarity/upgrades make guns and plating stronger, not the vehicle ever faster (shells miss fast targets)
    flat += (def.baseFlatReduction ?? 0) * m;
    const mod = def.slotType === 'module' ? MODULE_EFFECTS[def.id.replace('mod_', '')] : undefined;
    const affixes = mod ? [...item.affixes, { stat: mod.stat, value: mod.perTier * def.tier * m, nameKey: 'module' }] : item.affixes;
    for (const a of affixes) {
      if (a.stat === 'dps') affDps += a.value / 100;
      else if (a.stat === 'hull') affHull += a.value / 100;
      else if (a.stat === 'armor') affArmor += a.value / 100;
      else if (a.stat === 'speed') affSpeed += a.value / 100;
      else if (a.stat === 'crit_chance') affCrit += a.value / 100;
      else if (a.stat === 'flat_reduction') affFlat += a.value;
      else if (a.stat === 'reload_speed') affReload += a.value / 100;
      else if (a.stat === 'range') affRange += a.value / 100;
    }
  }

  const maxHull = Math.round((v.baseHull * levelMult + hullBonus) * (1 + (tal['hull_max'] ?? 0) + affHull) * mastery);
  const maxArmor = Math.round((v.baseArmor * levelMult + armorBonus) * (1 + (tal['armor_max'] ?? 0) + affArmor) * mastery);
  const maxSpeed = Math.round((v.baseSpeed + speedBonus) * (1 + (tal['max_speed'] ?? 0) + affSpeed));
  const mainDamage = Math.round((v.baseDamage * levelMult + dmgAdd) * (1 + (tal['main_damage'] ?? 0) + affDps) * mastery);
  const reload = v.reloadTime / (1 + (tal['reload_speed'] ?? 0) + affReload);
  const crit = Math.min(0.75, 0.05 + (tal['crit_chance'] ?? 0) + affCrit);
  const flatReduction = Math.round(flat + (tal['flat_damage_reduction'] ?? 0) + affFlat);
  return {
    vehicleId,
    vehicleClass: v.vehicleClass,
    tier: v.tier,
    maxHull,
    maxArmor,
    maxSpeed,
    turnRate: v.turnRate * (1 + (tal['chassis_turn_rate'] ?? 0)),
    turretTurnRate: v.turretTurnRate,
    mainDamage,
    mainReloadTime: Math.round(reload * 100) / 100,
    mainRange: Math.round(range * (1 + (tal['main_range'] ?? 0) + affRange)),
    // the machine gun keeps pace with the main gun: without a floor it is 43 % of a tier-1 vehicle's damage but only 7 % at tier 10 (and flat armor eats it)
    mgDamage: Math.round(Math.max(18 + mgAdd, MG_MAIN_DAMAGE_RATIO * mainDamage)),
    mgRange,
    critChance: crit,
    critDamage: 1.5 + (tal['crit_damage'] ?? 0),
    flatReduction,
    dps: Math.round(mainDamage / reload),
    drones: drones.sort((x, y) => x.slot - y.slot),
    mainFamily,
    radarMult: radarMultiplier(drones),
  };
}

/** First choice is free (right after creating the character); later changes cost scrap and have a 7-day cooldown. */
export function changeFaction(ch: CharacterState, faction: PlayerFaction, nowSeconds: number, firstChoice = false): Result {
  if (!FACTIONS.includes(faction)) return fail('unknown_faction');
  if (faction === ch.faction) return fail('same_faction');
  if (!firstChoice) {
    if (ch.factionChangedAt > 0 && nowSeconds - ch.factionChangedAt < FACTION_CHANGE_COOLDOWN_SECONDS) return fail('faction_cooldown');
    if (ch.wallet.scrap < FACTION_CHANGE_COST) return fail('not_enough_scrap');
    ch.wallet.scrap -= FACTION_CHANGE_COST;
  }
  ch.faction = faction;
  ch.factionChangedAt = nowSeconds;
  return { ok: true };
}

/** Fills fields added after a character was saved (old saves keep working). */
export function normalizeCharacter(raw: any, name: string): CharacterState {
  const base = createCharacter(name);
  return { ...base, ...raw, wallet: { ...base.wallet, ...(raw?.wallet ?? {}), ore: { ...base.wallet.ore, ...(raw?.wallet?.ore ?? {}) } }, quests: { ...base.quests, ...(raw?.quests ?? {}) }, season: { ...base.season, ...(raw?.season ?? {}) } };
}

/** NPC vendors buy gear for a fraction of its base value (a scrap sink compared to the auction house). */
export const NPC_SELL_RATE = 0.35;

/**
 * Reputation with your own faction (1000 points per level, max 7). Per level: 3 % off ammo,
 * +2 points NPC sell rate, -0.2 points auction tax.
 */
export function reputationLevel(ch: CharacterState): number {
  return Math.min(7, Math.floor((ch.reputation[ch.faction] ?? 0) / 1000));
}
export function npcSellValue(item: ItemInstance, ch: CharacterState): number {
  const def = ITEM_BY_ID.get(item.defId)!;
  return Math.max(1, Math.round(def.scrapValue * (NPC_SELL_RATE + 0.02 * reputationLevel(ch)) * RARITY_CONFIGS[item.rarity].multiplier * (1 + item.upgrade * 0.1)));
}
export function sellItemToNpc(ch: CharacterState, uid: string): Result<{ scrap: number }> {
  const item = findItem(ch, uid);
  if (!item) return fail('item_not_found');
  if (isEquipped(ch, uid)) return fail('item_equipped');
  const scrap = npcSellValue(item, ch);
  ch.inventory = ch.inventory.filter((i) => i.uid !== uid);
  ch.wallet.scrap += scrap;
  return { ok: true, scrap };
}

/** Portal hops between two maps (BFS over the world graph); fast-travel cost grows with distance. */
export function fastTravelCost(hops: number): number { return 150 * hops; }
