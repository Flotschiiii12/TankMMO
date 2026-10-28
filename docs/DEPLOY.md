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
