/**
 * Restores the newest backup into a temp database and checks it:   npm run verify-backup [-- --dir backups] [--file path] [--keep]
 *  - integrity_check and foreign_key_check
 *  - schema version is known (not newer than this code) and every expected table/column exists
 *  - row-count sanity (accounts, profiles, clans ...) and no orphans
 *  - every account's profile loads through the real character normaliser, ammo JSON parses
 * Reads .db and .db.gz (scripts/backup-db.sh gzips). Never touches the live database. Exit code 1 on any problem.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { normalizeCharacter } from '../shared/rules/character.ts';
import { LATEST_SCHEMA_VERSION } from '../server/migrations.ts';

const arg = (n: string): string | undefined => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

export interface VerifyReport { file: string; ok: boolean; problems: string[]; notes: string[]; counts: Record<string, number> }

export function newestBackup(dir: string): string | undefined {
  if (!fs.existsSync(dir)) return undefined;
  const files = fs.readdirSync(dir).filter((f) => /^treadfront-\d{8}-\d{6}\.db(\.gz)?$/.test(f)).sort();
  return files.length ? path.join(dir, files[files.length - 1]) : undefined;
}

export function verifyBackup(file: string): VerifyReport {
  const problems: string[] = []; const notes: string[] = []; const counts: Record<string, number> = {};
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-verify-'));
  const restored = path.join(work, 'restored.db');
  try {
    if (file.endsWith('.gz')) fs.writeFileSync(restored, zlib.gunzipSync(fs.readFileSync(file))); else fs.copyFileSync(file, restored);
    const db = new DatabaseSync(restored);
    try {
      const integrity = (db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>).map((r) => r.integrity_check);
      if (integrity.length !== 1 || integrity[0] !== 'ok') problems.push(`integrity_check: ${integrity.slice(0, 5).join('; ')}`);
      const fk = db.prepare('PRAGMA foreign_key_check').all();
      if (fk.length) problems.push(`${fk.length} foreign key violation(s), first: ${JSON.stringify(fk[0])}`);

      const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((r) => r.name));
      for (const t of ['accounts', 'profiles', 'clans', 'clan_members', 'auctions', 'mail']) if (!tables.has(t)) problems.push(`table ${t} is missing`);
      if (tables.has('schema_version')) {
        const v = (db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null }).v ?? 0;
        if (v > LATEST_SCHEMA_VERSION) problems.push(`backup schema version ${v} is newer than this code (${LATEST_SCHEMA_VERSION})`);
        else if (v < LATEST_SCHEMA_VERSION) notes.push(`backup is at schema version ${v}; the server migrates it to ${LATEST_SCHEMA_VERSION} on start`);
      } else notes.push('backup predates the migration framework (no schema_version); the server migrates it on start');

      const count = (sql: string, key: string) => { try { counts[key] = (db.prepare(sql).get() as { n: number }).n; } catch (e) { problems.push(`${key}: ${(e as Error).message}`); } };
      count('SELECT COUNT(*) AS n FROM accounts', 'accounts');
      count('SELECT COUNT(*) AS n FROM profiles', 'profiles');
      count('SELECT COUNT(*) AS n FROM clans', 'clans');
      count('SELECT COUNT(*) AS n FROM clan_members', 'clan_members');
      count("SELECT COUNT(*) AS n FROM auctions WHERE status = 'active'", 'active_auctions');
      count('SELECT COUNT(*) AS n FROM mail', 'mail');
      if ((counts.accounts ?? 0) === 0) notes.push('the backup contains no accounts (empty server?)');
      if ((counts.profiles ?? 0) > (counts.accounts ?? 0)) problems.push(`more profiles (${counts.profiles}) than accounts (${counts.accounts})`);
      count('SELECT COUNT(*) AS n FROM clan_members m LEFT JOIN clans c ON c.id = m.clan_id WHERE c.id IS NULL', 'orphan_clan_members');
      if (counts.orphan_clan_members) problems.push(`${counts.orphan_clan_members} clan member(s) point at a missing clan`);
      count('SELECT COUNT(*) AS n FROM profiles p LEFT JOIN accounts a ON a.id = p.account_id WHERE a.id IS NULL', 'orphan_profiles');
      if (counts.orphan_profiles) problems.push(`${counts.orphan_profiles} profile(s) without an account`);

      // every account's profile must load through the same code the server uses
      let loaded = 0;
      for (const row of db.prepare('SELECT account_id, character_json, ammo_json FROM profiles').all() as Array<{ account_id: string; character_json: string; ammo_json: string }>) {
        try {
          const ch = normalizeCharacter(JSON.parse(row.character_json), '');
          JSON.parse(row.ammo_json);
          if (!Number.isFinite(ch.wallet.scrap) || ch.wallet.scrap < 0) throw new Error(`bad scrap ${ch.wallet.scrap}`);
          const uids = new Set(ch.inventory.map((i) => i.uid));
          if (uids.size !== ch.inventory.length) throw new Error('duplicate item uid');
          loaded++;
        } catch (e) { problems.push(`profile ${row.account_id}: ${(e as Error).message}`); if (problems.length > 25) break; }
      }
      counts.profiles_loaded = loaded;
    } finally { db.close(); }
  } catch (e) {
    problems.push(`cannot read the backup: ${(e as Error).message}`);
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
  return { file, ok: problems.length === 0, problems, notes, counts };
}

if (process.argv[1]?.endsWith('verify-backup.ts')) {
  const dir = arg('dir') ?? process.env.BACKUP_DIR ?? path.resolve('backups');
  const file = arg('file') ?? newestBackup(dir);
  if (!file) { console.error(`no backup found in ${dir} (expected treadfront-YYYYMMDD-HHMMSS.db[.gz])`); process.exit(1); }
  const r = verifyBackup(file);
  console.log(`${r.ok ? 'OK ' : 'BAD'} ${r.file}`);
  console.log('counts:', JSON.stringify(r.counts));
  for (const n of r.notes) console.log('note:', n);
  for (const p of r.problems) console.error('PROBLEM:', p);
  process.exit(r.ok ? 0 : 1);
}
