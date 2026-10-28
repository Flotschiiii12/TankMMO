/**
 * Persistence behind interfaces (design doc section 0). SQLite via node:sqlite today; the SQL is plain so a
 * PostgreSQL implementation of the same interfaces can replace it later.
 */
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { normalizeCharacter, type CharacterState } from '../shared/rules/character.ts';
import { MIGRATIONS, runMigrations } from './migrations.ts';

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
  topByHonor(limit: number): Array<{ accountId: string; name: string; honor: number }>;
}

export interface ChatRepo {
  add(channel: string, sender: string, text: string, ts: number): void;
  recent(channel: string, limit: number): Array<{ sender: string; text: string; ts: number }>;
}

/** Opens (and migrates) the database. Throws SchemaTooNewError when the file was written by a newer server. */
export function openDatabase(path = ':memory:'): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
  try {
    runMigrations(db, MIGRATIONS, { path });
  } catch (err) {
    db.close();
    throw err;
  }
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
  topByHonor(limit: number) {
    return (this.db.prepare(`SELECT a.id AS id, a.name AS name, CAST(json_extract(p.character_json, '$.wallet.honor') AS INTEGER) AS honor FROM profiles p JOIN accounts a ON a.id = p.account_id WHERE honor > 0 ORDER BY honor DESC, p.updated_at ASC LIMIT ?`).all(limit) as any[])
      .map((r) => ({ accountId: r.id, name: r.name, honor: r.honor }));
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
  /** Seconds a player spent fighting for a control point of their own faction in `week`. */
  addContribution(week: string, accountId: string, seconds: number): void {
    this.db.prepare(`INSERT INTO war_contrib (week, account_id, seconds) VALUES (?, ?, ?) ON CONFLICT(week, account_id) DO UPDATE SET seconds = seconds + excluded.seconds`).run(week, accountId, seconds);
  }
  contribution(week: string, accountId: string): number {
    return ((this.db.prepare(`SELECT seconds FROM war_contrib WHERE week = ? AND account_id = ?`).get(week, accountId) as any)?.seconds as number | undefined) ?? 0;
  }
  hasClaimed(week: string, accountId: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM war_claims WHERE week = ? AND account_id = ?`).get(week, accountId);
  }
  /** True exactly once per (week, account): the primary key decides, so two simultaneous claims cannot both win. */
  claim(week: string, accountId: string, now: number): boolean {
    return Number(this.db.prepare(`INSERT OR IGNORE INTO war_claims (week, account_id, claimed_at) VALUES (?, ?, ?)`).run(week, accountId, now).changes) === 1;
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
