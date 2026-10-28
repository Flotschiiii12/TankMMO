# Deploying Treadfront on the VPS

1. `cp .env.example .env` and set `ADMIN_TOKEN` to a long random value (`openssl rand -hex 24`).
2. `docker compose up -d --build` (listens on 127.0.0.1:3200; data in `./data`).
3. Reverse proxy with TLS, e.g. Caddy: `treadfront.example.com { reverse_proxy 127.0.0.1:3200 }` (WebSocket upgrade works automatically).
4. Backups: `crontab -e` -> `30 3 * * * /path/to/scripts/backup-db.sh`.
5. Check: `curl https://treadfront.example.com/health`, `/metrics`, admin at `/admin`.
6. Update: `git pull && docker compose up -d --build`. Clients older than the minimum protocol are told to update.

Resources: one Node process (about 1 core at ~150-200 clustered players). The VPS is shared with other services, so watch `/metrics` (`treadfront_tick_ms_avg` should stay under ~25).

## Mobile apps (Capacitor)
Prepared in the repo, see `docs/MOBILE.md` (config, `npm run mobile:sync`, landscape lock, store steps). Short version: `VITE_SERVER_URL=https://your-server npm run mobile:sync`. The game is online-only; the offline sandbox only starts when no server answers.

## Reverse proxy and rate limits
The REST rate limits (guest creation, recovery, rename, ...) are per client IP. Behind Caddy/nginx set `TRUST_PROXY=1` (hops) in the container environment, otherwise all players share the proxy's address and therefore one limit.

## Database migrations and backups
- **Migrations** (`server/migrations.ts`): a `schema_version` table records every applied migration; on start the server applies the pending ones, each in its own transaction. Before the first pending migration on a database that already has accounts, a consistent copy `<db>.pre-v<N>-<timestamp>.bak` is written next to the file (restore = stop the server, copy it back over the database, remove the `-wal`/`-shm` files).
- A database written by a **newer** server is refused with `Database schema version X is newer than this server supports`. Never start an older image on a newer database; restore a backup instead.
- Production databases created before the framework are detected automatically (no `schema_version` yet) and brought up to date; the old `ALTER TABLE` ad-hoc checks are gone. Databases that are older than the M9 release also get the missing `accounts.start_faction` column, which the previous code did not add.
- Adding a migration: append `{ version: N+1, name, up(db) }` to `MIGRATIONS` (idempotent: it may meet a half-migrated database), never edit an existing one, and add the SQL of the previous schema as a fixture if it is a new historical state (`test/fixtures`).
- **Backups**: the server writes `treadfront-YYYYMMDD-HHMMSS.db` into `BACKUP_DIR` once a day (14 kept); `scripts/backup-db.sh` (cron) writes gzipped copies. Check the newest one at any time, also on the VPS, without touching the live database:
  ```bash
  docker compose exec treadfront npm run verify-backup -- --dir /data/backups
  ```
  It restores the newest backup into a temp file and checks `integrity_check`, foreign keys, the schema version, row counts, orphans and that every account's profile loads (no duplicate item uids, finite wallet). Exit code 1 on any problem, so it can be used in cron/monitoring.
