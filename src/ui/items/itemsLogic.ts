/** Pure logic of the inventory, workshop and market screens (no React): filtering, sorting, bulk dismantle review, craft/upgrade previews, price suggestion. */
import * as C from '../../../shared/rules/character.ts';
import { CRAFTING_RECIPES, ITEM_BY_ID, RARITY_CONFIGS, UPGRADE_LEVEL_STATS } from '../../../shared/data/items.ts';
import { itemScore } from '../hangar/hangarLogic.ts';
import { RARITIES } from '../kit/logic.ts';

export type SortKey = 'score' | 'rarity' | 'tier' | 'upgrade' | 'name';
export interface ItemFilter { slot: string; rarities: ReadonlySet<string>; search: string; hideEquipped?: boolean }

/** Inventory filter: slot type ('all' = any), rarity set (empty = any) and a text search on the translated name. */
export function filterItems(ch: C.CharacterState, items: C.ItemInstance[], f: ItemFilter, nameOf: (i: C.ItemInstance) => string): C.ItemInstance[] {
  const q = f.search.trim().toLowerCase();
  return items.filter((i) => {
    const def = ITEM_BY_ID.get(i.defId); if (!def) return false;
    if (f.slot !== 'all' && def.slotType !== f.slot) return false;
    if (f.rarities.size && !f.rarities.has(i.rarity)) return false;
    if (f.hideEquipped && C.isEquipped(ch, i.uid)) return false;
    return !q || nameOf(i).toLowerCase().includes(q) || i.rarity.toLowerCase().includes(q);
  });
}
export function sortItems(items: C.ItemInstance[], key: SortKey, nameOf: (i: C.ItemInstance) => string): C.ItemInstance[] {
  const tier = (i: C.ItemInstance) => ITEM_BY_ID.get(i.defId)?.tier ?? 0;
  const cmp: Record<SortKey, (a: C.ItemInstance, b: C.ItemInstance) => number> = {
    score: (a, b) => itemScore(b) - itemScore(a),
    rarity: (a, b) => RARITIES.indexOf(b.rarity as never) - RARITIES.indexOf(a.rarity as never) || itemScore(b) - itemScore(a),
    tier: (a, b) => tier(b) - tier(a) || itemScore(b) - itemScore(a),
    upgrade: (a, b) => b.upgrade - a.upgrade || itemScore(b) - itemScore(a),
    name: (a, b) => nameOf(a).localeCompare(nameOf(b)),
  };
  return [...items].sort((a, b) => cmp[key](a, b) || a.uid.localeCompare(b.uid));
}

// ---------------------------------------------------------------- bulk dismantle
export interface DismantleRow { uid: string; rarity: string; upgrade: number; ore: string; oreAmount: number; fragments: number; risky: boolean }
/** Items that are safe to suggest for dismantling: not equipped, Common/Uncommon, no upgrades. The player can change the selection in the review. */
export function suggestDismantle(ch: C.CharacterState): string[] {
  return ch.inventory.filter((i) => !C.isEquipped(ch, i.uid) && (i.rarity === 'Common' || i.rarity === 'Uncommon') && i.upgrade === 0).map((i) => i.uid);
}
/** Review list for a selection: equipped / unknown items are dropped, valuable ones are flagged "risky" (Rare and up, or upgraded). */
export function dismantleReview(ch: C.CharacterState, uids: string[]): { rows: DismantleRow[]; totals: Record<string, number>; fragments: number; dropped: string[] } {
  const rows: DismantleRow[] = []; const dropped: string[] = []; const totals: Record<string, number> = {}; let fragments = 0;
  for (const uid of new Set(uids)) {
    const it = C.findItem(ch, uid);
    if (!it || C.isEquipped(ch, uid)) { dropped.push(uid); continue; }
    const y = C.dismantleYieldOf(it);
    rows.push({ uid, rarity: it.rarity, upgrade: it.upgrade, ore: y.ore, oreAmount: y.oreAmount, fragments: y.fragments, risky: RARITIES.indexOf(it.rarity as never) >= 2 || it.upgrade > 0 });
    totals[y.ore] = (totals[y.ore] ?? 0) + y.oreAmount; fragments += y.fragments;
  }
  return { rows, totals, fragments, dropped };
}

// ---------------------------------------------------------------- workshop previews
export interface CostLine { kind: 'scrap' | 'fragments' | 'iron' | 'copper' | 'titanium' | 'crystal'; need: number; have: number; ok: boolean }
export interface CraftStatus { levelOk: boolean; inventoryFull: boolean; lines: CostLine[]; canCraft: boolean; missing: number }
export function craftStatus(ch: C.CharacterState, recipe: (typeof CRAFTING_RECIPES)[number]): CraftStatus {
  const cost = C.craftCost(ch, recipe);
  const lines: CostLine[] = [{ kind: 'scrap', need: cost.scrap, have: ch.wallet.scrap, ok: ch.wallet.scrap >= cost.scrap }, ...cost.ore.map(([k, n]) => ({ kind: k, need: n, have: ch.wallet.ore[k], ok: ch.wallet.ore[k] >= n })), { kind: 'fragments', need: cost.fragments, have: ch.wallet.fragments, ok: ch.wallet.fragments >= cost.fragments }];
  const levelOk = ch.level >= recipe.minLevel; const inventoryFull = ch.inventory.length >= C.inventoryCapacity(ch);
  return { levelOk, inventoryFull, lines, canCraft: levelOk && !inventoryFull && lines.every((l) => l.ok), missing: lines.filter((l) => !l.ok).length };
}
export interface UpgradePreview { maxed: boolean; next: number; chance: number; normal: { scrap: number; ore: number; fragments: number; canPay: boolean }; safe: { scrap: number; ore: number; fragments: number; canPay: boolean } | null; failure: 'none' | 'drop' }
export function upgradePreview(ch: C.CharacterState, item: C.ItemInstance): UpgradePreview {
  const tier = ITEM_BY_ID.get(item.defId)?.tier ?? 1; const ore = ch.wallet.ore.iron + ch.wallet.ore.copper + ch.wallet.ore.titanium + ch.wallet.ore.crystal;
  const pay = (c: { scrap: number; ore: number; fragments: number }) => ch.wallet.scrap >= c.scrap && ore >= c.ore && ch.wallet.fragments >= c.fragments;
  if (item.upgrade >= C.MAX_UPGRADE) return { maxed: true, next: item.upgrade, chance: 0, normal: { scrap: 0, ore: 0, fragments: 0, canPay: false }, safe: null, failure: 'none' };
  const next = item.upgrade + 1; const chance = UPGRADE_LEVEL_STATS[next].successChance;
  const n = C.upgradeCost(item.upgrade, false, tier); const s = C.upgradeCost(item.upgrade, true, tier);
  return { maxed: false, next, chance, normal: { ...n, canPay: pay(n) }, safe: chance < 1 ? { ...s, canPay: pay(s) } : null, failure: chance < 1 && item.upgrade >= 10 ? 'drop' : 'none' };
}
export function fusionPreview(item: C.ItemInstance): { chance: number; nextRarity: string | null } {
  const chance = C.FUSION_UPGRADE_CHANCE[item.rarity]; const i = RARITIES.indexOf(item.rarity as never);
  return { chance, nextRarity: chance > 0 && i < RARITIES.length - 1 ? RARITIES[i + 1] : null };
}
export function fusionCandidates(ch: C.CharacterState, item: C.ItemInstance): C.ItemInstance[] {
  return ch.inventory.filter((i) => i.defId === item.defId && i.rarity === item.rarity && !C.isEquipped(ch, i.uid));
}

// ---------------------------------------------------------------- market price suggestion
export interface PriceAdvice { suggested: number; min: number; max: number; basis: 'recent' | 'listings' | 'npc' }
/** Suggested asking price: median of recent sales, else just under the cheapest active listing, else a multiple of the NPC value. Always inside the allowed band. */
export function suggestPrice(band: { min: number; max: number }, recentPrices: number[], cheapestListing: number | undefined, npcValue: number): PriceAdvice {
  const clamp = (v: number) => Math.max(band.min, Math.min(band.max, Math.round(v)));
  if (recentPrices.length) { const s = [...recentPrices].sort((a, b) => a - b); const mid = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; return { suggested: clamp(mid), ...band, basis: 'recent' }; }
  if (cheapestListing) return { suggested: clamp(cheapestListing * 0.97), ...band, basis: 'listings' };
  return { suggested: clamp(npcValue * 2), ...band, basis: 'npc' };
}
/** Time left of a listing as "3h 12m" / "42m" / "expired". */
export function timeLeft(expiresAt: number, now: number): string {
  const ms = expiresAt - now; if (ms <= 0) return 'expired';
  const m = Math.floor(ms / 60000); const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${Math.max(1, m)}m`;
}
export const RARITY_COLOR = (r: string): string => RARITY_CONFIGS[r as keyof typeof RARITY_CONFIGS]?.color ?? '#94a3b8';
