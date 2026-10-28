import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backupDatabase, openDatabase, SqliteProfileRepo } from '../server/db.ts';
import { LATEST_SCHEMA_VERSION, MIGRATIONS, SchemaTooNewError, currentVersion, runMigrations, type Migration } from '../server/migrations.ts';
import { createStarterCharacterForServer } from '../server/starter.ts';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tf-mig-'));
const FIXTURES: Array<{ id: string; label: string }> = [
  { id: '13ac65b', label: 'M7 server (accounts, profiles, chat)' },
  { id: '257004c', label: 'M8 social (friends, clans, reports)' },
  { id: 'dc40877', label: 'M9 PvP/arena/war, accounts.start_faction' },
  { id: '79bad9f', label: 'M10 economy (auctions, mail, wallet)' },
  { id: '82ba8d3', label: 'before the migration framework / clan emblems' },
];
const columns = (db: DatabaseSync, t: string): string[] => (db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map((c) => c.name);
const tables = (db: DatabaseSync): string[] => (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map((r) => r.name);
const indexes = (db: DatabaseSync): string[] => (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map((r) => r.name);

/** Inserts a row into `table`, ignoring keys the (historical) table does not have. */
function put(db: DatabaseSync, table: string, row: Record<string, unknown>) {
  const have = columns(db, table);
  const keys = Object.keys(row).filter((k) => have.includes(k));
  db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...(keys.map((k) => row[k]) as any[]));
}

function buildFixture(file: string, id: string) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', `schema_${id}.sql`), 'utf8'));
  const ch = createStarterCharacterForServer('Legacy', 'steppe');
  ch.wallet.scrap = 12345;
  for (let i = 1; i <= 3; i++) {
    put(db, 'accounts', { id: `acc${i}`, name: `Old-${i}`, secret_hash: `h${i}`, created_at: 1000 + i, banned_until: 0, muted_until: 0, age_confirmed: 1, last_seen: 2000 + i, start_faction: 'steppe' });
    put(db, 'profiles', { account_id: `acc${i}`, character_json: JSON.stringify({ ...ch, name: `Old-${i}` }), ammo_json: JSON.stringify({ STANDARD: -1, REINFORCED: i }), map_id: 9, level: 3 + i, updated_at: 3000 + i });
  }
  put(db, 'chat', { channel: 'G', sender: 'Old-1', text: 'hello from the past', ts: 4000 });
  if (tables(db).includes('clans')) {
    put(db, 'clans', { id: 1, name: 'Old Guard', tag: 'OLD', scrap: 777, research_json: '{"storage":1}', quest_json: '{}', created_at: 5000 });
    put(db, 'clan_members', { account_id: 'acc1', clan_id: 1, role: 'leader', joined_at: 5000 });
    put(db, 'clan_log', { clan_id: 1, ts: 5001, actor: 'acc1', text: 'Clan founded' });
  }
  if (tables(db).includes('auctions')) put(db, 'auctions', { seller: 'acc2', item_json: '{"uid":"i1"}', def_id: 'wpn_cannon_t1', price: 100, listed_at: 6000, expires_at: 9e12, status: 'active' });
  if (tables(db).includes('wallet_tx')) put(db, 'wallet_tx', { account_id: 'acc3', currency: 'cells', amount: 5, reason: 'test', ref: 'r1', ts: 7000 });
  db.close();
  return ch;
}

describe('versioned migrations', () => {
  const fresh = openDatabase(':memory:');
  const freshTables = tables(fresh);

  it('a fresh database ends at the latest version with every migration recorded', () => {
    expect(currentVersion(fresh)).toBe(LATEST_SCHEMA_VERSION);
    const rows = fresh.prepare('SELECT version, name FROM schema_version ORDER BY version').all() as Array<{ version: number; name: string }>;
    expect(rows.map((r) => r.version)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(MIGRATIONS.map((m) => m.version)).toEqual(MIGRATIONS.map((_, i) => i + 1)); // contiguous, ordered
  });

  for (const fx of FIXTURES) {
    it(`migrates the historical schema ${fx.id} (${fx.label}) to the latest with all data intact`, () => {
      const dir = tmp(); const file = path.join(dir, 'old.db');
      const ch = buildFixture(file, fx.id);
      const before = new DatabaseSync(file);
      const hadClans = tables(before).includes('clans');
      before.close();

      const db = openDatabase(file); // migrates in place
      try {
        expect(currentVersion(db)).toBe(LATEST_SCHEMA_VERSION);
        expect(tables(db)).toEqual(freshTables);
        expect(indexes(db)).toEqual(indexes(fresh));
        for (const t of freshTables) expect(columns(db, t).sort(), `columns of ${t}`).toEqual(columns(fresh, t).sort());
        // data survived
        expect((db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as any).n).toBe(3);
        const acc = db.prepare("SELECT name, start_faction, last_seen FROM accounts WHERE id = 'acc2'").get() as any;
        expect(acc).toMatchObject({ name: 'Old-2', last_seen: 2002 });
        expect(acc.start_faction).toBe(fx.id === '13ac65b' || fx.id === '257004c' ? 'coastal' : 'steppe'); // column added with its default for old rows
        const profile = new SqliteProfileRepo(db).get('acc3')!;
        expect(profile.character.wallet.scrap).toBe(12345);
        expect(profile.character.inventory.length).toBe(ch.inventory.length);
        expect(profile.mapId).toBe(9);
        expect((db.prepare("SELECT text FROM chat WHERE channel = 'G'").get() as any).text).toBe('hello from the past');
        if (hadClans) {
          expect(db.prepare('SELECT name, scrap, emblem FROM clans').get()).toMatchObject({ name: 'Old Guard', scrap: 777, emblem: null });
          expect((db.prepare('SELECT COUNT(*) AS n FROM clan_members').get() as any).n).toBe(1);
        }
        // the migrated database is fully usable by the current code
        db.prepare("UPDATE accounts SET start_faction = 'highland' WHERE id = 'acc1'").run();
        expect(db.prepare('PRAGMA integrity_check').get()).toMatchObject({ integrity_check: 'ok' });
        expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      } finally { db.close(); }
      // a consistent copy was made before the first migration
      expect(fs.readdirSync(dir).some((f) => /^old\.db\.pre-v0-\d+\.bak$/.test(f))).toBe(true);
      fs.rmSync(dir, { recursive: true, force: true });
    });
  }

  it('is idempotent: opening an up-to-date database changes nothing and writes no backup', () => {
    const dir = tmp(); const file = path.join(dir, 'x.db');
    openDatabase(file).close();
    const db = openDatabase(file);
    expect(runMigrations(db, MIGRATIONS, { path: file })).toMatchObject({ applied: [] });
    db.close();
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.bak'))).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('refuses a database written by a newer server and leaves it untouched', () => {
    const dir = tmp(); const file = path.join(dir, 'new.db');
    const db = openDatabase(file);
    db.prepare('INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)').run(LATEST_SCHEMA_VERSION + 1, 'from the future', 1);
    db.close();
    expect(() => openDatabase(file)).toThrow(SchemaTooNewError);
    expect(() => openDatabase(file)).toThrow(/newer than this server supports/);
    const raw = new DatabaseSync(file);
    expect((raw.prepare('SELECT MAX(version) AS v FROM schema_version').get() as any).v).toBe(LATEST_SCHEMA_VERSION + 1);
    raw.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('runs each migration in a transaction: a failing one leaves no trace and stops the chain', () => {
    const db = new DatabaseSync(':memory:');
    const list: Migration[] = [
      { version: 1, name: 'ok', up: (d) => d.exec('CREATE TABLE a (x INTEGER)') },
      { version: 2, name: 'half done then boom', up: (d) => { d.exec('CREATE TABLE b (x INTEGER)'); d.exec('INSERT INTO a VALUES (1)'); throw new Error('boom'); } },
      { version: 3, name: 'never runs', up: (d) => d.exec('CREATE TABLE c (x INTEGER)') },
    ];
    expect(() => runMigrations(db, list)).toThrow(/Migration 2 \(half done then boom\) failed and was rolled back: boom/);
    expect(currentVersion(db)).toBe(1);
    expect(tables(db)).toEqual(['a', 'schema_version']);
    expect((db.prepare('SELECT COUNT(*) AS n FROM a').get() as any).n).toBe(0);
    // fixing the migration lets it continue from where it stopped
    list[1] = { version: 2, name: 'fixed', up: (d) => d.exec('CREATE TABLE b (x INTEGER)') };
    expect(runMigrations(db, list)).toMatchObject({ from: 1, to: 3 });
    expect(tables(db)).toEqual(['a', 'b', 'c', 'schema_version']);
  });
});

describe('daily backup', () => {
  it('keeps the newest 14 files and every backup is a restorable, consistent snapshot while writes happen', () => {
    const dir = tmp(); const dbFile = path.join(dir, 'live.db'); const backups = path.join(dir, 'backups');
    const db = openDatabase(dbFile);
    db.exec("INSERT INTO accounts (id, name, secret_hash, created_at) VALUES ('a', 'Alpha', 'x', 1), ('b', 'Beta', 'x', 1)");
    db.exec("INSERT INTO clans (id, name, tag, scrap, created_at) VALUES (1, 'One', 'ONE', 500, 1), (2, 'Two', 'TWO', 500, 1)");
    // a second connection (like another process) keeps a write transaction open: moves 100 scrap between clans, not committed yet
    const writer = new DatabaseSync(dbFile);
    writer.exec('PRAGMA journal_mode = WAL;');
    writer.exec('BEGIN IMMEDIATE');
    writer.exec('UPDATE clans SET scrap = scrap - 100 WHERE id = 1');
    const open = backupDatabase(db, backups, 14, new Date(Date.UTC(2026, 0, 1, 3, 30, 0)));
    writer.exec('UPDATE clans SET scrap = scrap + 100 WHERE id = 2');
    writer.exec('COMMIT');
    writer.close();
    const snap = new DatabaseSync(open);
    expect((snap.prepare('SELECT SUM(scrap) AS s FROM clans').get() as any).s).toBe(1000); // never half of the transfer
    expect(snap.prepare('PRAGMA integrity_check').get()).toMatchObject({ integrity_check: 'ok' });
    snap.close();

    for (let day = 2; day <= 20; day++) backupDatabase(db, backups, 14, new Date(Date.UTC(2026, 0, day, 3, 30, 0)));
    const files = fs.readdirSync(backups).filter((f) => /^treadfront-\d{8}-\d{6}\.db$/.test(f)).sort();
    expect(files).toHaveLength(14);
    expect(files[0]).toBe('treadfront-20260107-033000.db'); // days 7..20 survive
    expect(files[13]).toBe('treadfront-20260120-033000.db');
    // the newest backup opens through the normal path, with all rows
    const restored = openDatabase(path.join(backups, files[13]));
    expect((restored.prepare('SELECT COUNT(*) AS n FROM accounts').get() as any).n).toBe(2);
    restored.close();
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('the scheduler takes one backup when the day changes (not on the first run, not twice a day)', async () => {
    const { createApp } = await import('../server/app.ts');
    const dir = tmp();
    let now = Date.UTC(2026, 5, 1, 12, 0, 0);
    const ctx = createApp({ dbPath: path.join(dir, 'live.db'), backupDir: path.join(dir, 'backups'), adminToken: 'x', clock: { nowMs: () => now } });
    const count = () => (fs.existsSync(path.join(dir, 'backups')) ? fs.readdirSync(path.join(dir, 'backups')).filter((f) => f.endsWith('.db')).length : 0);
    ctx.game.runScheduler();
    expect(count()).toBe(0);           // first run only learns the current day
    now += 3600_000; ctx.game.runScheduler();
    expect(count()).toBe(0);           // same day
    now += 24 * 3600_000; ctx.game.runScheduler();
    expect(count()).toBe(1);           // new day: one backup
    ctx.game.runScheduler();
    expect(count()).toBe(1);
    ctx.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('verify-backup', () => {
  it('accepts a healthy backup (also gzipped), and flags corruption, orphans and broken profiles', async () => {
    const { verifyBackup, newestBackup } = await import('../scripts/verify-backup.ts');
    const zlib = await import('node:zlib');
    const dir = tmp(); const backups = path.join(dir, 'backups');
    const db = openDatabase(path.join(dir, 'live.db'));
    const ch = createStarterCharacterForServer('P', 'coastal');
    for (const id of ['a', 'b']) {
      db.prepare("INSERT INTO accounts (id, name, secret_hash, created_at) VALUES (?, ?, 'x', 1)").run(id, `Name-${id}`);
      new SqliteProfileRepo(db).save({ accountId: id, character: ch, ammo: { STANDARD: -1 }, mapId: 1, updatedAt: 1 });
    }
    const good = backupDatabase(db, backups, 14, new Date(Date.UTC(2026, 0, 2, 3, 0, 0)));
    expect(newestBackup(backups)).toBe(good);
    const r = verifyBackup(good);
    expect(r.problems).toEqual([]);
    expect(r).toMatchObject({ ok: true, counts: { accounts: 2, profiles: 2, profiles_loaded: 2 } });

    const gz = `${good}.gz`;
    fs.writeFileSync(gz, zlib.gzipSync(fs.readFileSync(good)));
    expect(verifyBackup(gz).ok).toBe(true);

    // a profile that cannot be loaded
    db.prepare("UPDATE profiles SET character_json = '{not json' WHERE account_id = 'b'").run();
    const broken = backupDatabase(db, backups, 14, new Date(Date.UTC(2026, 0, 3, 3, 0, 0)));
    const rb = verifyBackup(broken);
    expect(rb.ok).toBe(false);
    expect(rb.problems.join('\n')).toMatch(/profile b/);
    // a duplicated item uid (item duplication bug) and an orphan clan member
    db.prepare("UPDATE profiles SET character_json = ? WHERE account_id = 'b'").run(JSON.stringify({ ...ch, inventory: [ch.inventory[0], ch.inventory[0]] }));
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec("INSERT INTO clan_members (account_id, clan_id, role, joined_at) VALUES ('a', 99, 'member', 1)");
    const dup = verifyBackup(backupDatabase(db, backups, 14, new Date(Date.UTC(2026, 0, 4, 3, 0, 0))));
    expect(dup.problems.join('\n')).toMatch(/duplicate item uid/);
    expect(dup.problems.join('\n')).toMatch(/clan member/);

    // a truncated file
    const trunc = path.join(backups, 'treadfront-20260105-030000.db');
    fs.writeFileSync(trunc, fs.readFileSync(good).subarray(0, 3000));
    expect(verifyBackup(trunc).ok).toBe(false);
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
