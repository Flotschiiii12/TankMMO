/**
 * Versioned schema migrations. `schema_version` holds one row per applied migration; on start every pending migration runs in
 * its own transaction, in order. Migrations must be idempotent (they may meet a database that is half-way there, for example
 * a pre-framework production database), and a database that is NEWER than this code is refused with a clear error instead
 * of being "repaired" by an old server.
 */
import fs from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

export interface Migration { version: number; name: string; up(db: DatabaseSync): void }

/** Everything that existed before the framework (server/db.ts as of the daily-backup commit). Safe on any older state: only creates what is missing. */
const BASELINE_SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,
  recovery_hash TEXT,
  created_at INTEGER NOT NULL,
  banned_until INTEGER NOT NULL DEFAULT 0,
  muted_until INTEGER NOT NULL DEFAULT 0,
  age_confirmed INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER NOT NULL DEFAULT 0,
  start_faction TEXT NOT NULL DEFAULT 'coastal'
);
CREATE INDEX IF NOT EXISTS idx_accounts_recovery ON accounts(recovery_hash);
CREATE TABLE IF NOT EXISTS profiles (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  character_json TEXT NOT NULL,
  ammo_json TEXT NOT NULL,
  map_id INTEGER NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profiles_level ON profiles(level DESC);
CREATE TABLE IF NOT EXISTS chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_channel ON chat(channel, id DESC);
CREATE TABLE IF NOT EXISTS friends (
  a TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  b TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL, -- 'pending' (a asked b) | 'accepted'
  created_at INTEGER NOT NULL,
  PRIMARY KEY (a, b)
);
CREATE TABLE IF NOT EXISTS blocks (
  blocker TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  blocked TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (blocker, blocked)
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter TEXT NOT NULL,
  target TEXT NOT NULL,
  reason TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  ts INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
);
CREATE TABLE IF NOT EXISTS clans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  tag TEXT NOT NULL UNIQUE COLLATE NOCASE,
  scrap INTEGER NOT NULL DEFAULT 0,
  research_json TEXT NOT NULL DEFAULT '{}',
  quest_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS clan_members (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- leader | officer | member
  joined_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS clan_invites (
  clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  ts INTEGER NOT NULL,
  PRIMARY KEY (clan_id, account_id)
);
CREATE TABLE IF NOT EXISTS clan_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  ts INTEGER NOT NULL,
  actor TEXT NOT NULL,
  text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS arena_ratings (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  season INTEGER NOT NULL DEFAULT 1,
  rating INTEGER NOT NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, mode, season)
);
CREATE TABLE IF NOT EXISTS war_scores (
  week TEXT NOT NULL,
  faction TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week, faction)
);
CREATE TABLE IF NOT EXISTS auctions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  item_json TEXT NOT NULL,
  def_id TEXT NOT NULL,
  price INTEGER NOT NULL,
  listed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' -- active | sold | expired | cancelled
);
CREATE INDEX IF NOT EXISTS idx_auctions_active ON auctions(status, expires_at);
CREATE TABLE IF NOT EXISTS mail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, -- item | scrap
  payload TEXT NOT NULL,
  note TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS trade_volume (
  account_id TEXT NOT NULL,
  day TEXT NOT NULL,
  scrap INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day)
);
CREATE TABLE IF NOT EXISTS wallet_tx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT,
  ts INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_ref ON wallet_tx(account_id, currency, ref) WHERE ref IS NOT NULL;
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL
);
`;

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((c) => c.name === column);
}
function addColumnIfMissing(db: DatabaseSync, table: string, column: string, ddl: string): void {
  if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

export const MIGRATIONS: Migration[] = [
  { version: 1, name: 'baseline tables and indexes', up: (db) => db.exec(BASELINE_SCHEMA) },
  // Databases created before faction choice (13ac65b, 257004c) have no accounts.start_faction; the server reads it on every login.
  { version: 2, name: 'accounts.start_faction', up: (db) => addColumnIfMissing(db, 'accounts', 'start_faction', "TEXT NOT NULL DEFAULT 'coastal'") },
  { version: 3, name: 'clans.emblem', up: (db) => addColumnIfMissing(db, 'clans', 'emblem', 'TEXT') },
  {
    version: 4,
    name: 'clan item storage and alliances',
    up: (db) => {
      addColumnIfMissing(db, 'clans', 'storage_min_role', "TEXT NOT NULL DEFAULT 'member'");
      db.exec(`
CREATE TABLE IF NOT EXISTS clan_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  item_json TEXT NOT NULL,
  def_id TEXT NOT NULL,
  deposited_by TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clan_items_clan ON clan_items(clan_id);
CREATE TABLE IF NOT EXISTS clan_item_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL, -- deposit | withdraw
  item_json TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clan_item_log_clan ON clan_item_log(clan_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_clan_item_log_member ON clan_item_log(clan_id, account_id, kind, ts);
CREATE TABLE IF NOT EXISTS clan_alliances (
  clan_a INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  clan_b INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  status TEXT NOT NULL, -- pending | active | broken (kept for the re-alliance cooldown)
  proposed_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (clan_a, clan_b),
  CHECK (clan_a < clan_b)
);`);
    },
  },
  {
    version: 5,
    name: 'faction war contribution and weekly reward claims',
    up: (db) => db.exec(`
CREATE TABLE IF NOT EXISTS war_contrib (
  week TEXT NOT NULL,
  account_id TEXT NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week, account_id)
);
CREATE TABLE IF NOT EXISTS war_claims (
  week TEXT NOT NULL,
  account_id TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (week, account_id)
);`),
  },
  {
    version: 6,
    name: 'anonymous telemetry and feedback reports',
    up: (db) => db.exec(`
CREATE TABLE IF NOT EXISTS telemetry_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  who TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_telemetry_ts ON telemetry(ts);
CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetry_once ON telemetry(kind, who, detail) WHERE kind NOT IN ('session_start', 'session_end');
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  who TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  state_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
);`),
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export class SchemaTooNewError extends Error {
  constructor(public found: number, public supported: number) {
    super(`Database schema version ${found} is newer than this server supports (${supported}). Refusing to start so the data is not damaged: deploy a newer server, or restore a backup made by this version.`);
    this.name = 'SchemaTooNewError';
  }
}

export function currentVersion(db: DatabaseSync): number {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)');
  const r = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null };
  return r.v ?? 0;
}

/**
 * Applies pending migrations. `path` (file databases with existing data) gets a consistent copy `<path>.pre-v<N>-<time>.bak`
 * before the first pending migration, so a bad migration can be rolled back by copying the file back.
 */
export function runMigrations(db: DatabaseSync, migrations: Migration[] = MIGRATIONS, opts: { path?: string; now?: () => number } = {}): { from: number; to: number; applied: string[] } {
  const latest = migrations[migrations.length - 1]?.version ?? 0;
  const from = currentVersion(db);
  if (from > latest) throw new SchemaTooNewError(from, latest);
  const pending = migrations.filter((m) => m.version > from).sort((a, b) => a.version - b.version);
  const applied: string[] = [];
  const now = opts.now ?? Date.now;
  if (pending.length && opts.path && opts.path !== ':memory:' && fs.existsSync(opts.path) && hasUserData(db)) {
    const copy = `${opts.path}.pre-v${from}-${now()}.bak`;
    db.exec(`VACUUM INTO '${copy.replace(/'/g, "''")}'`);
  }
  for (const m of pending) {
    db.exec('BEGIN IMMEDIATE');
    try {
      m.up(db);
      db.prepare('INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)').run(m.version, m.name, now());
      db.exec('COMMIT');
      applied.push(`${m.version}:${m.name}`);
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
      throw new Error(`Migration ${m.version} (${m.name}) failed and was rolled back: ${(err as Error).message}`);
    }
  }
  return { from, to: Math.max(from, ...pending.map((m) => m.version)), applied };
}

function hasUserData(db: DatabaseSync): boolean {
  const t = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'accounts'").get();
  return !!t && (db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number }).n > 0;
}
