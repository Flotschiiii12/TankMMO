/**
 * Persistence behind interfaces (design doc section 0). SQLite via node:sqlite today; the SQL is plain so a
 * PostgreSQL implementation of the same interfaces can replace it later.
 */
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { normalizeCharacter, type CharacterState } from '../shared/rules/character.ts';

export interface AccountRow {
  id: string;
  name: string;
  secretHash: string;
  recoveryHash: string | null;
  createdAt: number;
  bannedUntil: number;
  mutedUntil: number;
  ageConfirmed: boolean;
  lastSeen: number;
  startFaction: string;
}

export interface ProfileRow {
  accountId: string;
  character: CharacterState;
  ammo: Record<string, number>;
  mapId: number;
  updatedAt: number;
}

export interface AccountRepo {
  create(a: Pick<AccountRow, 'id' | 'name' | 'secretHash' | 'createdAt'> & { startFaction?: string }): void;
  get(id: string): AccountRow | undefined;
  getByRecoveryHash(hash: string): AccountRow | undefined;
  getByName(name: string): AccountRow | undefined;
  setSecretHash(id: string, hash: string): void;
  setRecoveryHash(id: string, hash: string): void;
  setName(id: string, name: string): void;
  setBan(id: string, until: number): void;
  setMute(id: string, until: number): void;
  touch(id: string, now: number): void;
  delete(id: string): void;
  count(): number;
}

export interface ProfileRepo {
  get(accountId: string): ProfileRow | undefined;
  save(row: ProfileRow): void;
  topByLevel(limit: number): Array<{ accountId: string; name: string; level: number }>;
}

export interface ChatRepo {
  add(channel: string, sender: string, text: string, ts: number): void;
  recent(channel: string, limit: number): Array<{ sender: string; text: string; ts: number }>;
}

export const SCHEMA = `
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
  created_at INTEGER NOT NULL,
  emblem TEXT
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

export function openDatabase(path = ':memory:'): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // Backwards-compatible column additions for databases created before the column existed.
  const clanCols = db.prepare('PRAGMA table_info(clans)').all() as Array<{ name: string }>;
  if (!clanCols.some((c) => c.name === 'emblem')) db.exec('ALTER TABLE clans ADD COLUMN emblem TEXT');
  return db;
}

const toAccount = (r: any): AccountRow => ({
  id: r.id, name: r.name, secretHash: r.secret_hash, recoveryHash: r.recovery_hash, createdAt: r.created_at,
  bannedUntil: r.banned_until, mutedUntil: r.muted_until, ageConfirmed: !!r.age_confirmed, lastSeen: r.last_seen, startFaction: r.start_faction,
});

export class SqliteAccountRepo implements AccountRepo {
  constructor(private db: DatabaseSync) {}
  create(a: Pick<AccountRow, 'id' | 'name' | 'secretHash' | 'createdAt'> & { startFaction?: string }): void {
    this.db.prepare('INSERT INTO accounts (id, name, secret_hash, created_at, start_faction) VALUES (?, ?, ?, ?, ?)').run(a.id, a.name, a.secretHash, a.createdAt, a.startFaction ?? 'coastal');
  }
  get(id: string) { const r = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id); return r ? toAccount(r) : undefined; }
  getByRecoveryHash(h: string) { const r = this.db.prepare('SELECT * FROM accounts WHERE recovery_hash = ?').get(h); return r ? toAccount(r) : undefined; }
  getByName(n: string) { const r = this.db.prepare('SELECT * FROM accounts WHERE name = ? COLLATE NOCASE').get(n); return r ? toAccount(r) : undefined; }
  setSecretHash(id: string, h: string) { this.db.prepare('UPDATE accounts SET secret_hash = ? WHERE id = ?').run(h, id); }
  setRecoveryHash(id: string, h: string) { this.db.prepare('UPDATE accounts SET recovery_hash = ? WHERE id = ?').run(h, id); }
  setName(id: string, n: string) { this.db.prepare('UPDATE accounts SET name = ? WHERE id = ?').run(n, id); }
  setBan(id: string, until: number) { this.db.prepare('UPDATE accounts SET banned_until = ? WHERE id = ?').run(until, id); }
  setMute(id: string, until: number) { this.db.prepare('UPDATE accounts SET muted_until = ? WHERE id = ?').run(until, id); }
  touch(id: string, now: number) { this.db.prepare('UPDATE accounts SET last_seen = ? WHERE id = ?').run(now, id); }
  delete(id: string) { this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id); }
  count() { return (this.db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as any).n as number; }
}

export class SqliteProfileRepo implements ProfileRepo {
  constructor(private db: DatabaseSync) {}
  get(accountId: string): ProfileRow | undefined {
    const r: any = this.db.prepare('SELECT * FROM profiles WHERE account_id = ?').get(accountId);
    return r ? { accountId, character: normalizeCharacter(JSON.parse(r.character_json), ''), ammo: JSON.parse(r.ammo_json), mapId: r.map_id, updatedAt: r.updated_at } : undefined;
  }
  save(row: ProfileRow): void {
    this.db.prepare(
      `INSERT INTO profiles (account_id, character_json, ammo_json, map_id, level, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id) DO UPDATE SET character_json = excluded.character_json, ammo_json = excluded.ammo_json,
       map_id = excluded.map_id, level = excluded.level, updated_at = excluded.updated_at`
    ).run(row.accountId, JSON.stringify(row.character), JSON.stringify(row.ammo), row.mapId, row.character.level, row.updatedAt);
  }
  topByLevel(limit: number) {
    return (this.db.prepare('SELECT a.id AS id, a.name AS name, p.level AS level FROM profiles p JOIN accounts a ON a.id = p.account_id ORDER BY p.level DESC, p.updated_at ASC LIMIT ?').all(limit) as any[])
      .map((r) => ({ accountId: r.id, name: r.name, level: r.level }));
  }
}

export class SqliteChatRepo implements ChatRepo {
  constructor(private db: DatabaseSync) {}
  add(channel: string, sender: string, text: string, ts: number) { this.db.prepare('INSERT INTO chat (channel, sender, text, ts) VALUES (?, ?, ?, ?)').run(channel, sender, text, ts); }
  recent(channel: string, limit: number) {
    return (this.db.prepare('SELECT sender, text, ts FROM chat WHERE channel = ? ORDER BY id DESC LIMIT ?').all(channel, limit) as any[]).reverse();
  }
}

export class SqliteArenaRepo {
  constructor(private db: DatabaseSync) {}
  get(accountId: string, mode: string, season = 1): { rating: number; wins: number; losses: number } {
    const r: any = this.db.prepare('SELECT rating, wins, losses FROM arena_ratings WHERE account_id = ? AND mode = ? AND season = ?').get(accountId, mode, season);
    return r ? { rating: r.rating, wins: r.wins, losses: r.losses } : { rating: 1000, wins: 0, losses: 0 };
  }
  record(accountId: string, mode: string, delta: number, won: boolean, season = 1): number {
    const cur = this.get(accountId, mode, season);
    const rating = Math.max(0, cur.rating + delta);
    this.db.prepare(
      `INSERT INTO arena_ratings (account_id, mode, season, rating, wins, losses) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, mode, season) DO UPDATE SET rating = excluded.rating, wins = excluded.wins, losses = excluded.losses`
    ).run(accountId, mode, season, rating, cur.wins + (won ? 1 : 0), cur.losses + (won ? 0 : 1));
    return rating;
  }
  top(mode: string, limit = 20, season = 1): Array<{ name: string; rating: number; wins: number; losses: number }> {
    return this.db.prepare(
      `SELECT a.name AS name, r.rating AS rating, r.wins AS wins, r.losses AS losses FROM arena_ratings r JOIN accounts a ON a.id = r.account_id WHERE r.mode = ? AND r.season = ? ORDER BY r.rating DESC LIMIT ?`
    ).all(mode, season, limit) as any;
  }
}

export class SqliteWarRepo {
  constructor(private db: DatabaseSync) {}
  add(week: string, faction: string, points: number): void {
    this.db.prepare(`INSERT INTO war_scores (week, faction, score) VALUES (?, ?, ?) ON CONFLICT(week, faction) DO UPDATE SET score = score + excluded.score`).run(week, faction, points);
  }
  scores(week: string): Record<string, number> {
    const out: Record<string, number> = { coastal: 0, highland: 0, steppe: 0 };
    for (const r of this.db.prepare(`SELECT faction, score FROM war_scores WHERE week = ?`).all(week) as any[]) out[r.faction] = r.score;
    return out;
  }
}

/** Consistent online backup (VACUUM INTO) as <dir>/treadfront-YYYYMMDD-HHMMSS.db; keeps the newest `keep` files. */
export function backupDatabase(db: DatabaseSync, dir: string, keep = 14, now = new Date()): string {

  fs.mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const file = `${dir}/treadfront-${stamp.slice(0, 8)}-${stamp.slice(8)}.db`;
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const all = fs.readdirSync(dir).filter((f) => /^treadfront-\d{8}-\d{6}\.db$/.test(f)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep))) fs.rmSync(`${dir}/${old}`);
  return file;
}
