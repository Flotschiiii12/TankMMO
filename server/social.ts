/**
 * Friends, blocks, reports, clans (roles, storage, log, research), plus rankings and profile cards.
 * Everything is keyed by account id; names are resolved here. SQL is plain so it ports to PostgreSQL.
 */
import type { DatabaseSync } from 'node:sqlite';
import { isClanEmblem } from '../shared/data/emblems.ts';

export const CLAN_CREATE_COST = 10_000;
export const CLAN_MAX_MEMBERS = 50;
export const FRIEND_MAX = 100;
export const CLAN_ROLES = ['leader', 'officer', 'member'] as const;
export type ClanRole = (typeof CLAN_ROLES)[number];

export const CLAN_RESEARCH: Array<{ id: string; name: string; maxLevel: number; costPerLevel: number; effect: string }> = [
  { id: 'banner', name: 'Clan banner styles', maxLevel: 5, costPerLevel: 20_000, effect: 'cosmetic' },
  { id: 'storage', name: 'Storage space', maxLevel: 5, costPerLevel: 30_000, effect: 'convenience: +10 storage slots per level' },
  { id: 'xpshare', name: 'Shared XP', maxLevel: 3, costPerLevel: 50_000, effect: 'convenience: +2% party XP per level' },
];

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const TAG_RE = /^[A-Za-z0-9]{2,5}$/;
const CLAN_NAME_RE = /^[A-Za-z0-9 _\-]{3,20}$/;

export class SocialRepo {
  constructor(private db: DatabaseSync, private now: () => number = () => Date.now()) {}

  // ---------------------------------------------------------------- friends & blocks
  friendList(id: string): Array<{ id: string; name: string; status: 'accepted' | 'incoming' | 'outgoing' }> {
    const rows = this.db.prepare(
      `SELECT f.a, f.b, f.status, aa.name AS aname, bb.name AS bname FROM friends f JOIN accounts aa ON aa.id = f.a JOIN accounts bb ON bb.id = f.b WHERE f.a = ? OR f.b = ?`
    ).all(id, id) as any[];
    return rows.map((r) => {
      const other = r.a === id ? { id: r.b, name: r.bname } : { id: r.a, name: r.aname };
      const status = r.status === 'accepted' ? 'accepted' : r.a === id ? 'outgoing' : 'incoming';
      return { ...other, status } as any;
    });
  }

  areFriends(a: string, b: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM friends WHERE status = 'accepted' AND ((a = ? AND b = ?) OR (a = ? AND b = ?))`).get(a, b, b, a);
  }

  requestFriend(from: string, to: string): R<{ autoAccepted?: boolean }> {
    if (from === to) return fail('self');
    if (this.isBlocked(to, from) || this.isBlocked(from, to)) return fail('blocked');
    if (this.areFriends(from, to)) return fail('already_friends');
    if (this.friendList(from).filter((f) => f.status === 'accepted').length >= FRIEND_MAX) return fail('friend_list_full');
    const reverse = this.db.prepare(`SELECT 1 FROM friends WHERE a = ? AND b = ? AND status = 'pending'`).get(to, from);
    if (reverse) { this.db.prepare(`UPDATE friends SET status = 'accepted' WHERE a = ? AND b = ?`).run(to, from); return { ok: true, autoAccepted: true }; }
    if (this.db.prepare(`SELECT 1 FROM friends WHERE a = ? AND b = ?`).get(from, to)) return fail('already_requested');
    this.db.prepare(`INSERT INTO friends (a, b, status, created_at) VALUES (?, ?, 'pending', ?)`).run(from, to, this.now());
    return { ok: true };
  }

  acceptFriend(me: string, from: string): R {
    const r = this.db.prepare(`UPDATE friends SET status = 'accepted' WHERE a = ? AND b = ? AND status = 'pending'`).run(from, me);
    return Number(r.changes) > 0 ? { ok: true } : fail('no_request');
  }

  removeFriend(a: string, b: string): R {
    const r = this.db.prepare(`DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)`).run(a, b, b, a);
    return Number(r.changes) > 0 ? { ok: true } : fail('not_friends');
  }

  block(blocker: string, blocked: string): R {
    if (blocker === blocked) return fail('self');
    this.db.prepare(`INSERT OR IGNORE INTO blocks (blocker, blocked) VALUES (?, ?)`).run(blocker, blocked);
    this.removeFriend(blocker, blocked);
    return { ok: true };
  }
  unblock(blocker: string, blocked: string): R { this.db.prepare(`DELETE FROM blocks WHERE blocker = ? AND blocked = ?`).run(blocker, blocked); return { ok: true }; }
  isBlocked(blocker: string, blocked: string): boolean { return !!this.db.prepare(`SELECT 1 FROM blocks WHERE blocker = ? AND blocked = ?`).get(blocker, blocked); }
  blockedBy(blocked: string): string[] { return (this.db.prepare(`SELECT blocker FROM blocks WHERE blocked = ?`).all(blocked) as any[]).map((r) => r.blocker); }
  blockList(blocker: string): Array<{ id: string; name: string }> {
    return this.db.prepare(`SELECT a.id AS id, a.name AS name FROM blocks b JOIN accounts a ON a.id = b.blocked WHERE b.blocker = ?`).all(blocker) as any;
  }

  // ---------------------------------------------------------------- reports
  report(reporter: string, target: string, reason: string, context = ''): R {
    const recent = this.db.prepare(`SELECT COUNT(*) AS n FROM reports WHERE reporter = ? AND ts > ?`).get(reporter, this.now() - 3600_000) as any;
    if (recent.n >= 10) return fail('too_many_reports');
    this.db.prepare(`INSERT INTO reports (reporter, target, reason, context, ts) VALUES (?, ?, ?, ?, ?)`).run(reporter, target, reason.slice(0, 200), context.slice(0, 500), this.now());
    return { ok: true };
  }
  openReports(limit = 100): any[] { return this.db.prepare(`SELECT * FROM reports WHERE status = 'open' ORDER BY id DESC LIMIT ?`).all(limit) as any[]; }
  closeReport(id: number): void { this.db.prepare(`UPDATE reports SET status = 'closed' WHERE id = ?`).run(id); }

  // ---------------------------------------------------------------- clans
  clanOf(accountId: string): { id: number; name: string; tag: string; emblem?: string; role: ClanRole } | undefined {
    const r: any = this.db.prepare(`SELECT c.id, c.name, c.tag, c.emblem, m.role FROM clan_members m JOIN clans c ON c.id = m.clan_id WHERE m.account_id = ?`).get(accountId);
    return r ? { id: r.id, name: r.name, tag: r.tag, emblem: r.emblem ?? undefined, role: r.role } : undefined;
  }

  createClan(founder: string, name: string, tag: string, emblem?: string): R<{ clanId: number }> {
    if (!CLAN_NAME_RE.test(name)) return fail('invalid_clan_name');
    if (!TAG_RE.test(tag)) return fail('invalid_tag');
    if (emblem !== undefined && !isClanEmblem(emblem)) return fail('invalid_emblem');
    if (this.clanOf(founder)) return fail('already_in_clan');
    try {
      const r = this.db.prepare(`INSERT INTO clans (name, tag, created_at, emblem) VALUES (?, ?, ?, ?)`).run(name, tag.toUpperCase(), this.now(), emblem ?? null);
      const id = Number(r.lastInsertRowid);
      this.db.prepare(`INSERT INTO clan_members (account_id, clan_id, role, joined_at) VALUES (?, ?, 'leader', ?)`).run(founder, id, this.now());
      this.log(id, founder, `Clan founded`);
      return { ok: true, clanId: id };
    } catch { return fail('name_or_tag_taken'); }
  }

  /** Leader/officer only; the id must be on the whitelist. */
  setEmblem(actor: string, emblem: string): R {
    const c = this.clanOf(actor);
    if (!c) return fail('no_clan');
    if (c.role === 'member') return fail('no_permission');
    if (!isClanEmblem(emblem)) return fail('invalid_emblem');
    this.db.prepare(`UPDATE clans SET emblem = ? WHERE id = ?`).run(emblem, c.id);
    this.log(c.id, actor, `Changed the emblem to ${emblem}`);
    return { ok: true };
  }

  members(clanId: number): Array<{ id: string; name: string; role: ClanRole; level: number }> {
    return this.db.prepare(
      `SELECT a.id AS id, a.name AS name, m.role AS role, COALESCE(p.level, 1) AS level FROM clan_members m JOIN accounts a ON a.id = m.account_id LEFT JOIN profiles p ON p.account_id = a.id
       WHERE m.clan_id = ? ORDER BY CASE m.role WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END, a.name`
    ).all(clanId) as any;
  }

  invite(actor: string, target: string): R {
    const c = this.clanOf(actor);
    if (!c) return fail('no_clan');
    if (c.role === 'member') return fail('no_permission');
    if (this.clanOf(target)) return fail('target_in_clan');
    if (this.members(c.id).length >= CLAN_MAX_MEMBERS) return fail('clan_full');
    if (this.isBlocked(target, actor)) return fail('blocked');
    this.db.prepare(`INSERT OR REPLACE INTO clan_invites (clan_id, account_id, ts) VALUES (?, ?, ?)`).run(c.id, target, this.now());
    return { ok: true };
  }

  invitesFor(accountId: string): Array<{ clanId: number; name: string; tag: string; emblem: string | null }> {
    return this.db.prepare(`SELECT c.id AS clanId, c.name AS name, c.tag AS tag, c.emblem AS emblem FROM clan_invites i JOIN clans c ON c.id = i.clan_id WHERE i.account_id = ?`).all(accountId) as any;
  }

  acceptInvite(accountId: string, clanId: number): R {
    if (this.clanOf(accountId)) return fail('already_in_clan');
    if (!this.db.prepare(`SELECT 1 FROM clan_invites WHERE clan_id = ? AND account_id = ?`).get(clanId, accountId)) return fail('no_invite');
    if (this.members(clanId).length >= CLAN_MAX_MEMBERS) return fail('clan_full');
    this.db.prepare(`INSERT INTO clan_members (account_id, clan_id, role, joined_at) VALUES (?, ?, 'member', ?)`).run(accountId, clanId, this.now());
    this.db.prepare(`DELETE FROM clan_invites WHERE account_id = ?`).run(accountId);
    this.log(clanId, accountId, 'Joined the clan');
    return { ok: true };
  }

  leave(accountId: string): R {
    const c = this.clanOf(accountId);
    if (!c) return fail('no_clan');
    const others = this.members(c.id).filter((m) => m.id !== accountId);
    if (c.role === 'leader' && others.length > 0) {
      const heir = others.find((m) => m.role === 'officer') ?? others[0];
      this.db.prepare(`UPDATE clan_members SET role = 'leader' WHERE account_id = ?`).run(heir.id);
      this.log(c.id, accountId, `Leadership passed to ${heir.name}`);
    }
    this.db.prepare(`DELETE FROM clan_members WHERE account_id = ?`).run(accountId);
    if (others.length === 0) this.db.prepare(`DELETE FROM clans WHERE id = ?`).run(c.id);
    else this.log(c.id, accountId, 'Left the clan');
    return { ok: true };
  }

  kick(actor: string, target: string): R {
    const a = this.clanOf(actor); const t = this.clanOf(target);
    if (!a || !t || a.id !== t.id) return fail('not_in_same_clan');
    const rank = (r: ClanRole) => CLAN_ROLES.length - CLAN_ROLES.indexOf(r);
    if (a.role === 'member' || rank(a.role) <= rank(t.role)) return fail('no_permission');
    this.db.prepare(`DELETE FROM clan_members WHERE account_id = ?`).run(target);
    this.log(a.id, actor, `Removed a member`);
    return { ok: true };
  }

  setRole(actor: string, target: string, role: ClanRole): R {
    const a = this.clanOf(actor); const t = this.clanOf(target);
    if (!a || !t || a.id !== t.id) return fail('not_in_same_clan');
    if (a.role !== 'leader') return fail('no_permission');
    if (target === actor) return fail('self');
    if (role === 'leader') {
      this.db.prepare(`UPDATE clan_members SET role = 'officer' WHERE account_id = ?`).run(actor);
    }
    this.db.prepare(`UPDATE clan_members SET role = ? WHERE account_id = ?`).run(role, target);
    this.log(a.id, actor, `Set a member to ${role}`);
    return { ok: true };
  }

  /** Donations leave the player's wallet (caller deducts) and enter the clan storage; every deposit is logged. */
  donate(accountId: string, amount: number): R {
    const c = this.clanOf(accountId);
    if (!c) return fail('no_clan');
    const n = Math.floor(amount);
    if (n <= 0) return fail('bad_amount');
    this.db.prepare(`UPDATE clans SET scrap = scrap + ? WHERE id = ?`).run(n, c.id);
    this.log(c.id, accountId, `Donated ${n} scrap`);
    return { ok: true };
  }

  clanInfo(clanId: number): any {
    const c: any = this.db.prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId);
    if (!c) return undefined;
    return {
      id: c.id, name: c.name, tag: c.tag, emblem: c.emblem ?? null, scrap: c.scrap, research: JSON.parse(c.research_json), members: this.members(clanId),
      log: this.db.prepare(`SELECT l.ts AS ts, a.name AS actor, l.text AS text FROM clan_log l LEFT JOIN accounts a ON a.id = l.actor WHERE l.clan_id = ? ORDER BY l.id DESC LIMIT 30`).all(clanId),
    };
  }

  research(actor: string, researchId: string): R<{ level: number }> {
    const c = this.clanOf(actor);
    if (!c) return fail('no_clan');
    if (c.role === 'member') return fail('no_permission');
    const def = CLAN_RESEARCH.find((r) => r.id === researchId);
    if (!def) return fail('unknown_research');
    const row: any = this.db.prepare(`SELECT scrap, research_json FROM clans WHERE id = ?`).get(c.id);
    const lv = JSON.parse(row.research_json) as Record<string, number>;
    const cur = lv[researchId] ?? 0;
    if (cur >= def.maxLevel) return fail('max_level');
    const cost = def.costPerLevel * (cur + 1);
    if (row.scrap < cost) return fail('clan_scrap_too_low');
    lv[researchId] = cur + 1;
    this.db.prepare(`UPDATE clans SET scrap = scrap - ?, research_json = ? WHERE id = ?`).run(cost, JSON.stringify(lv), c.id);
    this.log(c.id, actor, `Researched ${def.name} ${cur + 1}`);
    return { ok: true, level: cur + 1 };
  }

  /** Shared clan quest progress: {questId: points}. Returns the new total. */
  addClanProgress(clanId: number, questId: string, amount: number): number {
    const row: any = this.db.prepare(`SELECT quest_json FROM clans WHERE id = ?`).get(clanId);
    if (!row) return 0;
    const q = JSON.parse(row.quest_json) as Record<string, number>;
    q[questId] = (q[questId] ?? 0) + amount;
    this.db.prepare(`UPDATE clans SET quest_json = ? WHERE id = ?`).run(JSON.stringify(q), clanId);
    return q[questId];
  }

  clanRanking(limit = 20): Array<{ name: string; tag: string; emblem: string | null; members: number; totalLevel: number }> {
    return this.db.prepare(
      `SELECT c.name AS name, c.tag AS tag, c.emblem AS emblem, COUNT(m.account_id) AS members, COALESCE(SUM(p.level), 0) AS totalLevel FROM clans c LEFT JOIN clan_members m ON m.clan_id = c.id
       LEFT JOIN profiles p ON p.account_id = m.account_id GROUP BY c.id ORDER BY totalLevel DESC LIMIT ?`
    ).all(limit) as any;
  }

  private log(clanId: number, actor: string, text: string): void {
    this.db.prepare(`INSERT INTO clan_log (clan_id, ts, actor, text) VALUES (?, ?, ?, ?)`).run(clanId, this.now(), actor, text);
  }

  // ---------------------------------------------------------------- announcements, audit
  addAnnouncement(text: string): void { this.db.prepare(`INSERT INTO announcements (ts, text) VALUES (?, ?)`).run(this.now(), text.slice(0, 300)); }
  latestAnnouncements(limit = 3): Array<{ ts: number; text: string }> { return this.db.prepare(`SELECT ts, text FROM announcements ORDER BY id DESC LIMIT ?`).all(limit) as any; }
  audit(actor: string, action: string, detail: string): void { this.db.prepare(`INSERT INTO audit_log (ts, actor, action, detail) VALUES (?, ?, ?, ?)`).run(this.now(), actor, action, detail.slice(0, 500)); }
  auditLog(limit = 100): any[] { return this.db.prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT ?`).all(limit) as any[]; }
}
