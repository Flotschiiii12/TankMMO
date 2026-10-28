/**
 * Clan item storage and clan alliances (second cloud run). Both are server-authoritative and persisted in SQLite.
 *
 * Storage is duplication-proof by construction: the item leaves one place and enters the other inside ONE database
 * transaction that also persists the player's profile; the conditional INSERT/DELETE decides races (only one of two
 * simultaneous withdrawals can delete the row). A crash can therefore neither duplicate nor lose an item.
 */
import type { DatabaseSync } from 'node:sqlite';
import type { ItemInstance } from '../shared/rules/character.ts';
import type { ClanRole } from './social.ts';

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const RANK: Record<ClanRole, number> = { member: 0, officer: 1, leader: 2 };

export const STORAGE_BASE_SLOTS = 20;
export const STORAGE_SLOTS_PER_RESEARCH_LEVEL = 10; // research "storage", max level 5 (see CLAN_RESEARCH)
export const STORAGE_DAILY_WITHDRAW: Record<ClanRole, number> = { member: 2, officer: 8, leader: 20 };
export const DAY_MS = 86_400_000;

export interface StoredItem { id: number; item: ItemInstance; depositedBy: string; depositedByName: string; ts: number }
export interface StorageLogEntry { ts: number; actor: string; kind: 'deposit' | 'withdraw'; defId: string; rarity: string }

export class ClanStorageRepo {
  constructor(private db: DatabaseSync, private now: () => number = () => Date.now()) {}

  capacity(clanId: number): number {
    const row = this.db.prepare('SELECT research_json FROM clans WHERE id = ?').get(clanId) as { research_json: string } | undefined;
    const level = row ? Number(JSON.parse(row.research_json)?.storage ?? 0) : 0;
    return STORAGE_BASE_SLOTS + STORAGE_SLOTS_PER_RESEARCH_LEVEL * Math.max(0, Math.min(5, level));
  }

  count(clanId: number): number { return (this.db.prepare('SELECT COUNT(*) AS n FROM clan_items WHERE clan_id = ?').get(clanId) as { n: number }).n; }

  list(clanId: number): StoredItem[] {
    return (this.db.prepare('SELECT s.id, s.item_json, s.deposited_by, s.ts, a.name AS name FROM clan_items s LEFT JOIN accounts a ON a.id = s.deposited_by WHERE s.clan_id = ? ORDER BY s.id').all(clanId) as any[])
      .map((r) => ({ id: r.id, item: JSON.parse(r.item_json), depositedBy: r.deposited_by, depositedByName: r.name ?? '?', ts: r.ts }));
  }

  log(clanId: number, limit = 20): StorageLogEntry[] {
    return (this.db.prepare('SELECT l.ts, a.name AS actor, l.kind, l.item_json FROM clan_item_log l LEFT JOIN accounts a ON a.id = l.account_id WHERE l.clan_id = ? ORDER BY l.id DESC LIMIT ?').all(clanId, limit) as any[])
      .map((r) => { const it = JSON.parse(r.item_json) as ItemInstance; return { ts: r.ts, actor: r.actor ?? '?', kind: r.kind, defId: it.defId, rarity: it.rarity }; });
  }

  getPolicy(clanId: number): ClanRole {
    const r = this.db.prepare('SELECT storage_min_role AS r FROM clans WHERE id = ?').get(clanId) as { r: ClanRole } | undefined;
    return r?.r ?? 'member';
  }

  setPolicy(clanId: number, actorRole: ClanRole, minRole: unknown): R {
    if (actorRole !== 'leader') return fail('no_permission');
    if (minRole !== 'member' && minRole !== 'officer' && minRole !== 'leader') return fail('bad_request');
    this.db.prepare('UPDATE clans SET storage_min_role = ? WHERE id = ?').run(minRole, clanId);
    return { ok: true };
  }

  withdrawnLast24h(clanId: number, accountId: string): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM clan_item_log WHERE clan_id = ? AND account_id = ? AND kind = 'withdraw' AND ts > ?").get(clanId, accountId, this.now() - DAY_MS) as { n: number }).n;
  }

  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const out = fn(); this.db.exec('COMMIT'); return out; } catch (e) { try { this.db.exec('ROLLBACK'); } catch { /* nothing open */ } throw e; }
  }

  /**
   * `take()` removes the item from the player's inventory (returns it, or undefined if it is gone), `giveBack()` undoes that
   * if the transaction fails, `persist()` writes the profile inside the same transaction.
   */
  deposit(clanId: number, accountId: string, role: ClanRole, hooks: { take(): ItemInstance | undefined; giveBack(item: ItemInstance): void; persist(): void }): R<{ id: number }> {
    void role;
    let taken: ItemInstance | undefined;
    try {
      return this.tx(() => {
        if (this.count(clanId) >= this.capacity(clanId)) return fail('storage_full');
        taken = hooks.take();
        if (!taken) return fail('item_not_found');
        const r = this.db.prepare('INSERT INTO clan_items (clan_id, item_json, def_id, deposited_by, ts) VALUES (?, ?, ?, ?, ?)').run(clanId, JSON.stringify(taken), taken.defId, accountId, this.now());
        this.db.prepare("INSERT INTO clan_item_log (clan_id, account_id, kind, item_json, ts) VALUES (?, ?, 'deposit', ?, ?)").run(clanId, accountId, JSON.stringify(taken), this.now());
        hooks.persist();
        return { ok: true as const, id: Number(r.lastInsertRowid) };
      });
    } catch (e) {
      if (taken) hooks.giveBack(taken);
      return fail(`storage_error:${(e as Error).message}`.slice(0, 80));
    }
  }

  /** `give()` adds the item to the player's inventory (false = no room); `remove()` takes it out again if the transaction fails. */
  withdraw(clanId: number, accountId: string, role: ClanRole, rowId: number, hooks: { hasRoom(): boolean; give(item: ItemInstance): void; remove(item: ItemInstance): void; persist(): void }): R<{ item: ItemInstance }> {
    if (RANK[role] < RANK[this.getPolicy(clanId)]) return fail('no_permission');
    if (!Number.isInteger(rowId)) return fail('not_found');
    let given: ItemInstance | undefined;
    try {
      return this.tx(() => {
        if (this.withdrawnLast24h(clanId, accountId) >= STORAGE_DAILY_WITHDRAW[role]) return fail('daily_limit');
        if (!hooks.hasRoom()) return fail('inventory_full');
        const row = this.db.prepare('SELECT item_json FROM clan_items WHERE id = ? AND clan_id = ?').get(rowId, clanId) as { item_json: string } | undefined;
        if (!row) return fail('not_found');
        const del = this.db.prepare('DELETE FROM clan_items WHERE id = ? AND clan_id = ?').run(rowId, clanId);
        if (Number(del.changes) !== 1) return fail('not_found'); // someone else was faster
        const item = JSON.parse(row.item_json) as ItemInstance;
        hooks.give(item); given = item;
        this.db.prepare("INSERT INTO clan_item_log (clan_id, account_id, kind, item_json, ts) VALUES (?, ?, 'withdraw', ?, ?)").run(clanId, accountId, row.item_json, this.now());
        hooks.persist();
        return { ok: true as const, item };
      });
    } catch (e) {
      if (given) hooks.remove(given);
      return fail(`storage_error:${(e as Error).message}`.slice(0, 80));
    }
  }

  /** All items of a clan that is about to disappear (last member left): returned so the caller can mail them to that member. */
  drain(clanId: number): ItemInstance[] {
    return this.tx(() => {
      const items = this.list(clanId).map((s) => s.item);
      this.db.prepare('DELETE FROM clan_items WHERE clan_id = ?').run(clanId);
      return items;
    });
  }
}

// ------------------------------------------------------------------------------------------------ alliances

export const ALLIANCE_MAX = 2;
export const ALLIANCE_REALLY_COOLDOWN_MS = 7 * DAY_MS;
export interface AllianceView { clanId: number; name: string; tag: string; emblem: string | null; status: 'active' | 'incoming' | 'outgoing'; since: number }

export class AllianceRepo {
  constructor(private db: DatabaseSync, private now: () => number = () => Date.now()) {}
  private pair(x: number, y: number): [number, number] { return x < y ? [x, y] : [y, x]; }
  private row(x: number, y: number): any { const [a, b] = this.pair(x, y); return this.db.prepare('SELECT * FROM clan_alliances WHERE clan_a = ? AND clan_b = ?').get(a, b); }

  activeCount(clanId: number): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM clan_alliances WHERE status = 'active' AND (clan_a = ? OR clan_b = ?)").get(clanId, clanId) as { n: number }).n;
  }
  allyIds(clanId: number): number[] {
    return (this.db.prepare("SELECT clan_a, clan_b FROM clan_alliances WHERE status = 'active' AND (clan_a = ? OR clan_b = ?)").all(clanId, clanId) as any[]).map((r) => (r.clan_a === clanId ? r.clan_b : r.clan_a));
  }
  areAllied(x: number, y: number): boolean { return x !== y && this.row(x, y)?.status === 'active'; }

  list(clanId: number): AllianceView[] {
    const rows = this.db.prepare("SELECT * FROM clan_alliances WHERE status IN ('active', 'pending') AND (clan_a = ? OR clan_b = ?)").all(clanId, clanId) as any[];
    return rows.map((r) => {
      const other = r.clan_a === clanId ? r.clan_b : r.clan_a;
      const c = this.db.prepare('SELECT name, tag, emblem FROM clans WHERE id = ?').get(other) as any;
      return { clanId: other, name: c?.name ?? '?', tag: c?.tag ?? '?', emblem: c?.emblem ?? null, status: r.status === 'active' ? 'active' : r.proposed_by === clanId ? 'outgoing' : 'incoming', since: r.updated_at } as AllianceView;
    });
  }

  /** Pairs of clan tags that are allied (for the simulation's war-point rule). Tags are unique per clan. */
  activeTagPairs(): Array<[string, string]> {
    return (this.db.prepare("SELECT a.tag AS ta, b.tag AS tb FROM clan_alliances l JOIN clans a ON a.id = l.clan_a JOIN clans b ON b.id = l.clan_b WHERE l.status = 'active'").all() as any[]).map((r) => [String(r.ta).toUpperCase(), String(r.tb).toUpperCase()]);
  }

  /** A leader/officer proposes an alliance to another clan (by tag). A matching proposal in the other direction becomes an alliance at once. */
  propose(from: number, toTag: unknown): R<{ clanId: number; allied: boolean }> {
    if (typeof toTag !== 'string' || !toTag) return fail('unknown_clan');
    const target = this.db.prepare('SELECT id FROM clans WHERE tag = ? COLLATE NOCASE').get(toTag) as { id: number } | undefined;
    if (!target) return fail('unknown_clan');
    const to = target.id;
    if (to === from) return fail('self');
    const [a, b] = this.pair(from, to);
    const existing = this.row(from, to);
    if (existing?.status === 'active') return fail('already_allied');
    if (existing?.status === 'pending') {
      if (existing.proposed_by === from) return fail('already_proposed');
      return this.accept(from, to).ok ? { ok: true, clanId: to, allied: true } : fail('ally_limit');
    }
    if (existing?.status === 'broken' && this.now() - existing.updated_at < ALLIANCE_REALLY_COOLDOWN_MS) return fail('ally_cooldown');
    if (this.activeCount(from) >= ALLIANCE_MAX) return fail('ally_limit');
    if (this.activeCount(to) >= ALLIANCE_MAX) return fail('target_ally_limit');
    this.db.prepare(
      `INSERT INTO clan_alliances (clan_a, clan_b, status, proposed_by, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?, ?)
       ON CONFLICT(clan_a, clan_b) DO UPDATE SET status = 'pending', proposed_by = excluded.proposed_by, updated_at = excluded.updated_at`
    ).run(a, b, from, this.now(), this.now());
    return { ok: true, clanId: to, allied: false };
  }

  /** The clan that received the proposal accepts it (limits are checked again for both sides). */
  accept(clanId: number, proposerId: unknown): R<{ clanId: number }> {
    if (!Number.isInteger(proposerId)) return fail('no_proposal');
    const p = proposerId as number;
    const row = this.row(clanId, p);
    if (!row || row.status !== 'pending' || row.proposed_by !== p) return fail('no_proposal');
    if (this.activeCount(clanId) >= ALLIANCE_MAX) return fail('ally_limit');
    if (this.activeCount(p) >= ALLIANCE_MAX) return fail('target_ally_limit');
    this.db.prepare("UPDATE clan_alliances SET status = 'active', updated_at = ? WHERE clan_a = ? AND clan_b = ? AND status = 'pending'").run(this.now(), row.clan_a, row.clan_b);
    return { ok: true, clanId: p };
  }

  /** Declines an incoming proposal or withdraws an outgoing one (no cooldown). */
  decline(clanId: number, otherId: unknown): R {
    if (!Number.isInteger(otherId)) return fail('no_proposal');
    const row = this.row(clanId, otherId as number);
    if (!row || row.status !== 'pending') return fail('no_proposal');
    this.db.prepare("DELETE FROM clan_alliances WHERE clan_a = ? AND clan_b = ? AND status = 'pending'").run(row.clan_a, row.clan_b);
    return { ok: true };
  }

  /** Ends an active alliance; the same two clans cannot ally again for 7 days. */
  break(clanId: number, otherId: unknown): R {
    if (!Number.isInteger(otherId)) return fail('not_allied');
    const row = this.row(clanId, otherId as number);
    if (!row || row.status !== 'active') return fail('not_allied');
    this.db.prepare("UPDATE clan_alliances SET status = 'broken', updated_at = ? WHERE clan_a = ? AND clan_b = ?").run(this.now(), row.clan_a, row.clan_b);
    return { ok: true };
  }
}
