/**
 * Closed-beta telemetry: anonymous, minimal and boring on purpose.
 * Stored per event: time, a kind from the fixed list below, a salted hash of the account id and a short token (never free text).
 * NOT stored: chat, names, IPs, device data, positions. `docs/legal/Datenschutzerklaerung.md` lists exactly this.
 */
import { createHmac, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export const TELEMETRY_KINDS = [
  'account_created', 'tutorial_step', 'first_kill', 'first_craft', 'level', 'gate_entered', 'gate_cleared', 'first_purchase', 'session_start', 'session_end',
] as const;
export type TelemetryKind = (typeof TELEMETRY_KINDS)[number];
/** Milestones that exist once per player (the database refuses duplicates), the others (sessions) repeat. */
const REPEATING: ReadonlySet<string> = new Set(['session_start', 'session_end']);
export const LEVEL_MILESTONES = [5, 10, 20, 30];
/** A detail is a short machine token such as `move`, `10` or `gate_1`; this rejects names, sentences and anything with spaces. */
export const DETAIL_PATTERN = /^[a-z0-9_.:-]{0,32}$/;

export interface TelemetryRow { ts: number; kind: string; who: string; detail: string }

export class TelemetryRepo {
  private salt: string;
  private cache = new Map<string, string>();
  constructor(private db: DatabaseSync, private nowSeconds: () => number = () => Math.floor(Date.now() / 1000)) {
    const row = db.prepare(`SELECT value FROM telemetry_meta WHERE key = 'salt'`).get() as { value: string } | undefined;
    if (row) this.salt = row.value;
    else { this.salt = randomBytes(24).toString('hex'); db.prepare(`INSERT INTO telemetry_meta (key, value) VALUES ('salt', ?)`).run(this.salt); }
  }
  /** Salted keyed hash; the salt lives only in this database, so the hash cannot be matched against account lists elsewhere. */
  hash(accountId: string): string {
    let h = this.cache.get(accountId);
    if (!h) { h = createHmac('sha256', this.salt).update(accountId).digest('hex').slice(0, 16); if (this.cache.size > 5000) this.cache.clear(); this.cache.set(accountId, h); }
    return h;
  }
  /** Returns false when the kind or detail is not allowed or the milestone was already recorded. Never throws. */
  log(kind: TelemetryKind, accountId: string, detail = ''): boolean {
    if (!(TELEMETRY_KINDS as readonly string[]).includes(kind) || !DETAIL_PATTERN.test(detail)) return false;
    try {
      const sql = REPEATING.has(kind) ? 'INSERT INTO telemetry (ts, kind, who, detail) VALUES (?, ?, ?, ?)' : 'INSERT OR IGNORE INTO telemetry (ts, kind, who, detail) VALUES (?, ?, ?, ?)';
      return Number(this.db.prepare(sql).run(this.nowSeconds(), kind, this.hash(accountId), detail).changes) === 1;
    } catch { return false; }
  }
  rows(sinceTs = 0): TelemetryRow[] { return this.db.prepare('SELECT ts, kind, who, detail FROM telemetry WHERE ts >= ? ORDER BY ts, id').all(sinceTs) as unknown as TelemetryRow[]; }
  /** Wipe everything of one account (used by account deletion). */
  forget(accountId: string): void { this.db.prepare('DELETE FROM telemetry WHERE who = ?').run(this.hash(accountId)); this.db.prepare('DELETE FROM feedback WHERE who = ?').run(this.hash(accountId)); }
  /** Delete raw events older than `days` (the legal draft promises 180 days). */
  prune(days = 180): number { return Number(this.db.prepare('DELETE FROM telemetry WHERE ts < ?').run(this.nowSeconds() - days * 86400).changes); }
}

// ------------------------------------------------------------------ feedback

export const FEEDBACK_MAX_TEXT = 1000;
export const FEEDBACK_PER_HOUR = 3;
export const FEEDBACK_KINDS = ['bug', 'idea', 'other'] as const;
export interface FeedbackState { map?: number; level?: number; version?: string; errors?: string[] }

/** Only these fields of the state dump are ever kept, in these shapes; everything else a client sends is dropped. */
export function sanitizeState(raw: any, serverErrors: string[]): FeedbackState {
  const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : undefined);
  const out: FeedbackState = {};
  const map = num(raw?.map, 999); if (map !== undefined) out.map = map;
  const level = num(raw?.level, 999); if (level !== undefined) out.level = level;
  if (typeof raw?.version === 'string' && /^[0-9a-z.+-]{1,20}$/i.test(raw.version)) out.version = raw.version;
  out.errors = serverErrors.filter((e) => /^[a-z0-9_]{1,40}$/.test(e)).slice(-20);
  return out;
}

export class FeedbackRepo {
  private recent = new Map<string, number[]>();
  constructor(private db: DatabaseSync, private tele: TelemetryRepo, private nowSeconds: () => number = () => Math.floor(Date.now() / 1000)) {}
  /** Stores one report; at most FEEDBACK_PER_HOUR per account and hour. */
  submit(accountId: string, kind: string, text: string, state: FeedbackState): { ok: boolean; error?: string } {
    const clean = String(text ?? '').trim().slice(0, FEEDBACK_MAX_TEXT);
    if (clean.length < 3) return { ok: false, error: 'too_short' };
    const now = this.nowSeconds();
    const list = (this.recent.get(accountId) ?? []).filter((t) => now - t < 3600);
    if (list.length >= FEEDBACK_PER_HOUR) return { ok: false, error: 'rate_limited' };
    list.push(now); this.recent.set(accountId, list);
    const k = (FEEDBACK_KINDS as readonly string[]).includes(kind) ? kind : 'other';
    this.db.prepare('INSERT INTO feedback (ts, who, kind, text, state_json) VALUES (?, ?, ?, ?, ?)').run(now, this.tele.hash(accountId), k, clean, JSON.stringify(state));
    return { ok: true };
  }
  list(limit = 100): Array<{ id: number; ts: number; who: string; kind: string; text: string; state: FeedbackState; status: string }> {
    return (this.db.prepare('SELECT id, ts, who, kind, text, state_json, status FROM feedback ORDER BY id DESC LIMIT ?').all(limit) as any[]).map((r) => ({ id: r.id, ts: r.ts, who: r.who, kind: r.kind, text: r.text, state: JSON.parse(r.state_json), status: r.status }));
  }
  close(id: number): void { this.db.prepare(`UPDATE feedback SET status = 'closed' WHERE id = ?`).run(id); }
}

// ------------------------------------------------------------------ aggregation (pure)

const DAY = 86400;
export interface Analytics {
  accounts: number;
  retention: Record<'d1' | 'd7' | 'd30', { eligible: number; retained: number; rate: number | null }>;
  funnel: Array<{ step: string; players: number; ofSignups: number | null; ofPrevious: number | null }>;
  milestones: Record<string, number>;
  sessions: { count: number; avgSeconds: number | null };
  concurrentByHour: Array<{ hourStart: number; players: number }>;
  peakConcurrent: number;
}

/** Everything the admin page shows, computed from raw rows only, so the maths is testable without a server. */
export function computeAnalytics(rows: TelemetryRow[], nowSeconds: number, tutorialSteps: readonly string[]): Analytics {
  const created = new Map<string, number>();
  const startsByWho = new Map<string, number[]>();
  const stepWho = new Map<string, Set<string>>();
  const milestones: Record<string, Set<string>> = {};
  const lengths: number[] = [];
  const intervals: Array<[number, number, string]> = [];
  const openStart = new Map<string, number>();
  for (const r of rows) {
    if (r.kind === 'account_created') { if (!created.has(r.who)) created.set(r.who, r.ts); continue; }
    if (r.kind === 'session_start') {
      (startsByWho.get(r.who) ?? startsByWho.set(r.who, []).get(r.who)!).push(r.ts);
      const prev = openStart.get(r.who); if (prev !== undefined) intervals.push([prev, r.ts, r.who]); // a crash left the previous session open: closes at the next start
      openStart.set(r.who, r.ts); continue;
    }
    if (r.kind === 'session_end') {
      const st = openStart.get(r.who);
      if (st !== undefined) { intervals.push([st, Math.max(st, r.ts), r.who]); openStart.delete(r.who); }
      const secs = Number(r.detail); if (Number.isFinite(secs) && secs >= 0 && secs < 86400) lengths.push(secs);
      continue;
    }
    if (r.kind === 'tutorial_step') { (stepWho.get(r.detail) ?? stepWho.set(r.detail, new Set()).get(r.detail)!).add(r.who); continue; }
    const key = r.kind === 'level' || r.kind === 'gate_entered' || r.kind === 'gate_cleared' ? `${r.kind}:${r.detail}` : r.kind;
    (milestones[key] ??= new Set()).add(r.who);
  }
  for (const [who, st] of openStart) intervals.push([st, Math.min(nowSeconds, st + 3600), who]); // still online (or crashed): cap at one hour

  const retention = (n: number) => {
    let eligible = 0; let retained = 0;
    for (const [who, ts] of created) {
      if (nowSeconds < (Math.floor(ts / DAY) + n + 1) * DAY) continue; // day n is not over yet
      eligible++;
      const day0 = Math.floor(ts / DAY);
      if ((startsByWho.get(who) ?? []).some((t) => Math.floor(t / DAY) - day0 === n)) retained++;
    }
    return { eligible, retained, rate: eligible ? retained / eligible : null };
  };
  const signups = created.size;
  let prev: number | null = null;
  const funnel = tutorialSteps.map((step) => {
    const players = stepWho.get(step)?.size ?? 0;
    const row = { step, players, ofSignups: signups ? players / signups : null, ofPrevious: prev === null ? (signups ? players / signups : null) : prev ? players / prev : null };
    prev = players; return row;
  });
  const hourNow = Math.floor(nowSeconds / 3600) * 3600;
  const concurrentByHour: Analytics['concurrentByHour'] = [];
  for (let i = 23; i >= 0; i--) {
    const h = hourNow - i * 3600; const set = new Set<string>();
    for (const [a, b, who] of intervals) if (a < h + 3600 && b >= h) set.add(who);
    concurrentByHour.push({ hourStart: h, players: set.size });
  }
  const counts: Record<string, number> = {}; for (const [k, v] of Object.entries(milestones)) counts[k] = v.size;
  return {
    accounts: signups, retention: { d1: retention(1), d7: retention(7), d30: retention(30) }, funnel, milestones: counts,
    sessions: { count: lengths.length, avgSeconds: lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : null },
    concurrentByHour, peakConcurrent: Math.max(0, ...concurrentByHour.map((c) => c.players)),
  };
}
