/**
 * Pure logic of the hangar (no React, no DOM): scoring, "equip best", loadout plans as server actions, live stat preview and
 * client-side presets. The server stays authoritative: every plan is just a list of the normal `equip` / `unequip` actions.
 */
import * as C from '../../../shared/rules/character.ts';
import { ITEM_BY_ID } from '../../../shared/data/items.ts';
import { calculateCombatPower } from '../../../shared/rules/power.ts';
import type { ClientAction } from '../../../shared/rules/actions.ts';

export type Loadout = Record<string, string | null>;
export const PRESET_SLOTS = 3;

/** Rough usefulness of an item inside its own slot type (higher is better); only used to order and to pick "best". */
export function itemScore(item: C.ItemInstance): number {
  const def = ITEM_BY_ID.get(item.defId); if (!def) return 0;
  const base = (def.baseDPS ?? 0) + (def.baseHullBonus ?? 0) * 0.05 + (def.baseArmorBonus ?? 0) * 0.05 + (def.baseSpeedBonus ?? 0) * 0.3 + (def.baseFlatReduction ?? 0) * 4 + def.tier * 8;
  return base * C.itemStatMultiplier(item) * (1 + item.affixes.length * 0.03);
}

const garageOf = (ch: C.CharacterState, vehicleId: string) => ch.garage.find((g) => g.vehicleId === vehicleId);
/** Equipped on a different vehicle: the server refuses to equip it here. */
export function equippedElsewhere(ch: C.CharacterState, vehicleId: string, uid: string): boolean {
  return ch.garage.some((g) => g.vehicleId !== vehicleId && Object.values(g.loadout).includes(uid));
}
export function canEquip(ch: C.CharacterState, vehicleId: string, slotType: string, item: C.ItemInstance): boolean {
  const def = ITEM_BY_ID.get(item.defId);
  return !!def && def.slotType === slotType && ch.level >= def.minLevel && !equippedElsewhere(ch, vehicleId, item.uid);
}

/** Best attainable item for every slot of the vehicle: greedy per slot type by score, each item used once. */
export function bestLoadout(ch: C.CharacterState, vehicleId: string): Loadout {
  const out: Loadout = {};
  const slots = C.slotKeysFor(vehicleId);
  for (const type of new Set(slots.map((s) => s.type))) {
    const pool = ch.inventory.filter((i) => canEquip(ch, vehicleId, type, i)).sort((a, b) => itemScore(b) - itemScore(a) || a.uid.localeCompare(b.uid));
    slots.filter((s) => s.type === type).forEach((s, i) => { out[s.key] = pool[i]?.uid ?? null; });
  }
  return out;
}
export function emptyLoadout(vehicleId: string): Loadout { return Object.fromEntries(C.slotKeysFor(vehicleId).map((s) => [s.key, null])); }

export interface Plan { actions: ClientAction[]; skipped: Array<{ slot: string; uid: string; reason: string }> }
/**
 * Turns a wanted loadout into the minimal ordered list of actions. Wanted items that cannot be equipped any more (sold, wrong
 * slot, level too low, on another vehicle, duplicated) are skipped with a reason instead of failing the whole plan.
 */
export function planLoadout(ch: C.CharacterState, vehicleId: string, target: Loadout): Plan {
  const g = garageOf(ch, vehicleId); const plan: Plan = { actions: [], skipped: [] };
  if (!g) return plan;
  const slots = C.slotKeysFor(vehicleId); const used = new Set<string>();
  const want: Record<string, string | null> = {};
  for (const s of slots) {
    const uid = target[s.key] ?? null; want[s.key] = null;
    if (!uid) continue;
    const item = C.findItem(ch, uid);
    if (!item) { plan.skipped.push({ slot: s.key, uid, reason: 'item_not_found' }); continue; }
    if (used.has(uid)) { plan.skipped.push({ slot: s.key, uid, reason: 'duplicate' }); continue; }
    if (!canEquip(ch, vehicleId, s.type, item)) { plan.skipped.push({ slot: s.key, uid, reason: equippedElsewhere(ch, vehicleId, uid) ? 'equipped_elsewhere' : 'cannot_equip' }); continue; }
    used.add(uid); want[s.key] = uid;
  }
  const wantedAnywhere = new Set(Object.values(want).filter(Boolean) as string[]);
  // free slots whose item is no longer wanted there (empty target) or is needed in another slot
  for (const s of slots) {
    const cur = g.loadout[s.key]; if (!cur || cur === want[s.key]) continue;
    if (want[s.key] === null || wantedAnywhere.has(cur)) plan.actions.push({ kind: 'unequip', vehicleId, slot: s.key });
  }
  for (const s of slots) { const w = want[s.key]; if (w && g.loadout[s.key] !== w) plan.actions.push({ kind: 'equip', vehicleId, slot: s.key, uid: w }); }
  return plan;
}

// ---------------------------------------------------------------- live preview
export interface StatRowData { key: string; label: string; before: number; after: number; unit?: string; percent?: boolean; lowerIsBetter?: boolean; digits?: number }
export interface Preview { rows: StatRowData[]; powerBefore: number; powerAfter: number }

const powerOf = (s: C.LoadoutStats) => calculateCombatPower({ dps: s.dps, maxHull: s.maxHull, maxArmor: s.maxArmor, tier: s.tier, flatReduction: s.flatReduction, critChance: s.critChance });
export function statRows(before: C.LoadoutStats, after: C.LoadoutStats): StatRowData[] {
  return [
    { key: 'hull', label: 'Hull', before: before.maxHull, after: after.maxHull },
    { key: 'armor', label: 'Armor', before: before.maxArmor, after: after.maxArmor },
    { key: 'speed', label: 'Speed', before: before.maxSpeed, after: after.maxSpeed },
    { key: 'damage', label: 'Damage', before: before.mainDamage, after: after.mainDamage },
    { key: 'dps', label: 'DPS', before: before.dps, after: after.dps, digits: 0 },
    { key: 'reload', label: 'Reload', before: before.mainReloadTime, after: after.mainReloadTime, unit: 's', lowerIsBetter: true, digits: 2 },
    { key: 'range', label: 'Range', before: before.mainRange, after: after.mainRange },
    { key: 'crit', label: 'Crit', before: before.critChance, after: after.critChance, percent: true },
    { key: 'reduction', label: 'Reduction', before: before.flatReduction, after: after.flatReduction },
  ];
}
export function currentPreview(ch: C.CharacterState, vehicleId: string): Preview | undefined {
  const s = C.computeLoadoutStats(ch, vehicleId); if (!s) return undefined;
  return { rows: statRows(s, s), powerBefore: powerOf(s), powerAfter: powerOf(s) };
}
/** What the stats would be after putting `uid` into `slot` (or emptying the slot when uid is null). Never touches `ch`. */
export function previewEquip(ch: C.CharacterState, vehicleId: string, slot: string, uid: string | null): Preview | undefined {
  const before = C.computeLoadoutStats(ch, vehicleId); if (!before) return undefined;
  const clone = structuredClone(ch);
  const g = garageOf(clone, vehicleId); if (!g) return undefined;
  if (uid === null) delete g.loadout[slot];
  else {
    for (const [k, v] of Object.entries(g.loadout)) if (v === uid && k !== slot) delete g.loadout[k];
    if (!C.equipItem(clone, vehicleId, slot, uid).ok) return undefined;
  }
  const after = C.computeLoadoutStats(clone, vehicleId)!;
  return { rows: statRows(before, after), powerBefore: powerOf(before), powerAfter: powerOf(after) };
}

// ---------------------------------------------------------------- presets (client side, per vehicle)
const PRESET_KEY = 'treadfront_loadout_presets_v1';
export type PresetStore = Record<string, Array<Loadout | null>>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export function loadPresets(storage: StorageLike | undefined = typeof localStorage !== 'undefined' ? localStorage : undefined): PresetStore {
  try { const v = JSON.parse(storage?.getItem(PRESET_KEY) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
export function savePreset(vehicleId: string, index: number, loadout: Loadout, storage: StorageLike | undefined = typeof localStorage !== 'undefined' ? localStorage : undefined): PresetStore {
  const all = loadPresets(storage); const list = (all[vehicleId] ??= []);
  while (list.length < PRESET_SLOTS) list.push(null);
  if (index >= 0 && index < PRESET_SLOTS) list[index] = Object.fromEntries(Object.entries(loadout).filter(([, v]) => !!v));
  try { storage?.setItem(PRESET_KEY, JSON.stringify(all)); } catch { /* private mode */ }
  return all;
}
/** The loadout currently equipped, as a preset value (only filled slots). */
export function currentLoadout(ch: C.CharacterState, vehicleId: string): Loadout { return { ...(garageOf(ch, vehicleId)?.loadout ?? {}) }; }
