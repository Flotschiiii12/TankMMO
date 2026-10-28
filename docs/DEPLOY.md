# Deploying Treadfront on the VPS

1. `cp .env.example .env` and set `ADMIN_TOKEN` to a long random value (`openssl rand -hex 24`).
2. `docker compose up -d --build` (listens on 127.0.0.1:3200; data in `./data`).
3. Reverse proxy with TLS, e.g. Caddy: `treadfront.example.com { reverse_proxy 127.0.0.1:3200 }` (WebSocket upgrade works automatically).
4. Backups: `crontab -e` -> `30 3 * * * /path/to/scripts/backup-db.sh`.
5. Check: `curl https://treadfront.example.com/health`, `/metrics`, admin at `/admin`.
6. Update: `git pull && docker compose up -d --build`. Clients older than the minimum protocol are told to update.

Resources: one Node process (about 1 core at ~150-200 clustered players). The VPS is shared with other services, so watch `/metrics` (`treadfront_tick_ms_avg` should stay under ~25).

## Mobile apps (Capacitor), when you want them
The web build already works in a phone browser. For store apps: `npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`, `npx cap init`, then build with the server address baked in:
`VITE_SERVER_URL=https://treadfront.213-199-44-82.sslip.io npm run build && npx cap sync`. (The game is online-only; the offline sandbox only starts when no server answers.) Reuse the signing/release scripts from the Aether Strike project.
