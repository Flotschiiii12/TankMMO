/**
 * Auction house (hub only), mail for returned items/proceeds, trade volume caps, and the disabled-by-flag premium wallet
 * ("Cells") with an idempotent ledger and a receipt-validation interface.
 */
import type { DatabaseSync } from 'node:sqlite';
import { FLAGS } from '../shared/flags.ts';
import { ITEM_BY_ID } from '../shared/data/items.ts';
import type { CharacterState, ItemInstance } from '../shared/rules/character.ts';
import { inventoryCapacity, reputationLevel, talentTotals } from '../shared/rules/character.ts';

export const AUCTION_TAX = 0.05;
export const AUCTION_MIN_ACCOUNT_AGE_MS = 3 * 86400_000;
export const AUCTION_MAX_LISTINGS = 10;
export const AUCTION_DURATIONS_HOURS = [12, 24, 48];
export const DAILY_TRADE_VOLUME_CAP = 2_000_000; // scrap per account per day (buy + sell)
/** Price band relative to the item's NPC value: stops dumping for nothing and laundering huge sums. */
export const PRICE_FLOOR_MULT = 0.5;
export const PRICE_CEILING_MULT = 60;

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export interface Listing { id: number; seller: string; sellerName: string; item: ItemInstance; price: number; expiresAt: number }

export function priceBand(defId: string): { min: number; max: number } | undefined {
  const def = ITEM_BY_ID.get(defId);
  if (!def) return undefined;
  return { min: Math.max(1, Math.round(def.scrapValue * PRICE_FLOOR_MULT)), max: Math.round(def.scrapValue * PRICE_CEILING_MULT) };
}

export function auctionTax(price: number, seller: CharacterState, warDiscount = 0): number {
  const rate = Math.max(0, AUCTION_TAX - (talentTotals(seller)['trade_tax_reduction'] ?? 0) - warDiscount - 0.002 * reputationLevel(seller));
  return Math.floor(price * rate);
}

export class MarketRepo {
  constructor(private db: DatabaseSync, private now: () => number = () => Date.now()) {}

  private day(): string { return new Date(this.now()).toISOString().slice(0, 10); }

  volumeToday(accountId: string): number {
    const r: any = this.db.prepare('SELECT scrap FROM trade_volume WHERE account_id = ? AND day = ?').get(accountId, this.day());
    return r?.scrap ?? 0;
  }
  addVolume(accountId: string, scrap: number): void {
    this.db.prepare('INSERT INTO trade_volume (account_id, day, scrap) VALUES (?, ?, ?) ON CONFLICT(account_id, day) DO UPDATE SET scrap = scrap + excluded.scrap').run(accountId, this.day(), scrap);
  }

  activeCount(seller: string): number {
    return (this.db.prepare(`SELECT COUNT(*) AS n FROM auctions WHERE seller = ? AND status = 'active'`).get(seller) as any).n;
  }

  /** Caller has already removed the item from the seller's inventory; on failure the caller must give it back. */
  list(seller: string, accountCreatedAt: number, item: ItemInstance, price: number, hours: number): R<{ id: number }> {
    if (this.now() - accountCreatedAt < AUCTION_MIN_ACCOUNT_AGE_MS) return fail('account_too_new');
    if (!AUCTION_DURATIONS_HOURS.includes(hours)) return fail('bad_duration');
    if (item.bound) return fail('item_bound');
    const band = priceBand(item.defId);
    if (!band) return fail('unknown_item');
    if (!Number.isInteger(price) || price < band.min || price > band.max) return fail('price_out_of_range');
    if (this.activeCount(seller) >= AUCTION_MAX_LISTINGS) return fail('too_many_listings');
    const r = this.db.prepare('INSERT INTO auctions (seller, item_json, def_id, price, listed_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(seller, JSON.stringify(item), item.defId, price, this.now(), this.now() + hours * 3600_000);
    return { ok: true, id: Number(r.lastInsertRowid) };
  }

  search(opts: { defId?: string; slot?: string; maxPrice?: number; limit?: number }): Listing[] {
    const rows = this.db.prepare(
      `SELECT a.id, a.seller, u.name AS sellerName, a.item_json, a.price, a.expires_at FROM auctions a JOIN accounts u ON u.id = a.seller
       WHERE a.status = 'active' AND a.expires_at > ? ${opts.defId ? 'AND a.def_id = ?' : ''} ORDER BY a.price ASC LIMIT ?`
    ).all(...([this.now(), ...(opts.defId ? [opts.defId] : []), opts.limit ?? 50] as any[])) as any[];
    return rows.map((r) => ({ id: r.id, seller: r.seller, sellerName: r.sellerName, item: JSON.parse(r.item_json), price: r.price, expiresAt: r.expires_at }))
      .filter((l) => (!opts.slot || ITEM_BY_ID.get(l.item.defId)?.slotType === opts.slot) && (!opts.maxPrice || l.price <= opts.maxPrice));
  }

  /** Last sale prices of one item definition (newest first), so sellers can see what it really goes for. */
  recentSales(defId: string, limit = 8): Array<{ price: number; at: number }> {
    return (this.db.prepare(`SELECT price, listed_at FROM auctions WHERE status = 'sold' AND def_id = ? ORDER BY id DESC LIMIT ?`).all(defId, Math.max(1, Math.min(20, limit))) as any[]).map((r) => ({ price: r.price, at: r.listed_at }));
  }

  mine(seller: string): Listing[] {
    return (this.db.prepare(`SELECT id, seller, item_json, price, expires_at FROM auctions WHERE seller = ? AND status = 'active'`).all(seller) as any[])
      .map((r) => ({ id: r.id, seller: r.seller, sellerName: '', item: JSON.parse(r.item_json), price: r.price, expiresAt: r.expires_at }));
  }

  get(id: number): (Listing & { status: string }) | undefined {
    const r: any = this.db.prepare(`SELECT a.id, a.seller, u.name AS sellerName, a.item_json, a.price, a.expires_at, a.status FROM auctions a JOIN accounts u ON u.id = a.seller WHERE a.id = ?`).get(id);
    return r ? { id: r.id, seller: r.seller, sellerName: r.sellerName, item: JSON.parse(r.item_json), price: r.price, expiresAt: r.expires_at, status: r.status } : undefined;
  }

  /** Atomically flips an active listing to sold/cancelled. Returns false if someone else got there first. */
  close(id: number, status: 'sold' | 'cancelled' | 'expired'): boolean {
    const r = this.db.prepare(`UPDATE auctions SET status = ? WHERE id = ? AND status = 'active'`).run(status, id);
    return Number(r.changes) > 0;
  }

  /** Marks expired listings and returns them so the items can be mailed back. */
  sweepExpired(): Array<{ id: number; seller: string; item: ItemInstance }> {
    const rows = this.db.prepare(`SELECT id, seller, item_json FROM auctions WHERE status = 'active' AND expires_at <= ?`).all(this.now()) as any[];
    const out: Array<{ id: number; seller: string; item: ItemInstance }> = [];
    for (const r of rows) if (this.close(r.id, 'expired')) out.push({ id: r.id, seller: r.seller, item: JSON.parse(r.item_json) });
    return out;
  }

  // ------------------------------------------------------------ mail
  sendItem(accountId: string, item: ItemInstance, note: string): void { this.db.prepare('INSERT INTO mail (account_id, kind, payload, note, ts) VALUES (?, ?, ?, ?, ?)').run(accountId, 'item', JSON.stringify(item), note, this.now()); }
  sendScrap(accountId: string, amount: number, note: string): void { this.db.prepare('INSERT INTO mail (account_id, kind, payload, note, ts) VALUES (?, ?, ?, ?, ?)').run(accountId, 'scrap', String(amount), note, this.now()); }
  mail(accountId: string): Array<{ id: number; kind: 'item' | 'scrap'; payload: string; note: string; ts: number }> { return this.db.prepare('SELECT id, kind, payload, note, ts FROM mail WHERE account_id = ? ORDER BY id').all(accountId) as any; }
  deleteMail(id: number): void { this.db.prepare('DELETE FROM mail WHERE id = ?').run(id); }
}

// ---------------------------------------------------------------------------
// Premium currency ("Cells"): ledger + catalogue. Everything is inert while the flag is off.
// ---------------------------------------------------------------------------

export interface ShopProduct { id: string; kind: 'time_saver' | 'convenience' | 'access' | 'cosmetic'; nameKey: string; priceCells: number }

/** Never random loot boxes: every product states exactly what it gives. */
export const SHOP_CATALOG: ShopProduct[] = [
  { id: 'inv_slots_10', kind: 'convenience', nameKey: 'shop.inv_slots_10', priceCells: 200 },
  { id: 'garage_slot', kind: 'convenience', nameKey: 'shop.garage_slot', priceCells: 400 },
  { id: 'gate_key_pack', kind: 'access', nameKey: 'shop.gate_key_pack', priceCells: 150 },
  { id: 'repair_free_day', kind: 'time_saver', nameKey: 'shop.repair_free_day', priceCells: 100 },
  { id: 'skin_desert_storm', kind: 'cosmetic', nameKey: 'shop.skin_desert_storm', priceCells: 500 },
];

export interface ReceiptValidator { validate(platform: 'apple' | 'google', receipt: string): Promise<{ ok: boolean; productId?: string; transactionId?: string; cells?: number }> }

/** Stub: a real implementation calls Apple/Google. Rejects everything so nothing can be granted by accident. */
export const rejectingValidator: ReceiptValidator = { async validate() { return { ok: false }; } };

export class PremiumWallet {
  constructor(private db: DatabaseSync, private now: () => number = () => Date.now()) {}

  /** Idempotent: a repeated `ref` (e.g. store transaction id) is ignored and reported as already applied. */
  credit(character: CharacterState, accountId: string, cells: number, reason: string, ref?: string): R<{ balance: number; duplicate?: boolean }> {
    if (!FLAGS.premiumCurrencyEnabled) return fail('disabled');
    if (cells <= 0) return fail('bad_amount');
    try {
      this.db.prepare('INSERT INTO wallet_tx (account_id, currency, amount, reason, ref, ts) VALUES (?, ?, ?, ?, ?, ?)').run(accountId, 'cells', cells, reason, ref ?? null, this.now());
    } catch {
      return { ok: true, balance: character.wallet.cells, duplicate: true };
    }
    character.wallet.cells += cells;
    return { ok: true, balance: character.wallet.cells };
  }

  purchase(character: CharacterState, accountId: string, productId: string): R<{ balance: number; product: ShopProduct }> {
    if (!FLAGS.premiumCurrencyEnabled) return fail('disabled');
    const product = SHOP_CATALOG.find((p) => p.id === productId);
    if (!product) return fail('unknown_product');
    if (character.wallet.cells < product.priceCells) return fail('not_enough_cells');
    character.wallet.cells -= product.priceCells;
    this.db.prepare('INSERT INTO wallet_tx (account_id, currency, amount, reason, ref, ts) VALUES (?, ?, ?, ?, ?, ?)').run(accountId, 'cells', -product.priceCells, `purchase:${productId}`, null, this.now());
    return { ok: true, balance: character.wallet.cells, product };
  }

  history(accountId: string, limit = 50): any[] { return this.db.prepare('SELECT amount, reason, ts FROM wallet_tx WHERE account_id = ? ORDER BY id DESC LIMIT ?').all(accountId, limit) as any[]; }
}

export const INVENTORY_FREE = (ch: CharacterState): number => inventoryCapacity(ch) - ch.inventory.length;
