# Treadfront (working title)

Online 2D top-down tank MMO. Mobile-first landscape controls, desktop supported. TypeScript everywhere.

```
shared/   pure, deterministic game rules + data tables (runs in browser and Node): sim, rules, data, protocol, net/delta
server/   authoritative game server (Express + ws + node:sqlite), accounts, social, economy, arena, admin
src/      React UI + canvas renderer + online/offline clients
test/     Vitest: rules, sim, server integration (real sockets)
scripts/  bots.ts (load test), econ-sim.ts, generate_assets.mjs
docs/     GDD, BALANCE, PROTOCOL, PROGRESS (status + known gaps)
```

## Run
```bash
npm install --legacy-peer-deps
npm test                 # 117 tests
npm run lint             # tsc --noEmit
npm run build && npm run server        # serves the game and the API on :3000 (PORT, DB_PATH, STATIC_DIR, ADMIN_TOKEN)
npm run dev              # Vite dev server only (offline sandbox when no server answers /api/time)
npm run bots -- --count 200 --seconds 25 --url http://127.0.0.1:3000   # load test (set LOAD_TEST=1 on the server)
npm run econ-sim -- --players 100
```
Admin: `/admin` (token in `ADMIN_TOKEN`). Health `/health`, metrics `/metrics`.

## How it fits together
- The simulation (`shared/sim`) is pure and seeded: the same inputs give the same world. The server steps each map instance at 30 Hz and sends delta snapshots at 10 Hz; the browser predicts its own vehicle and interpolates the rest.
- Every number lives in `shared/data`, every rule in `shared/rules` or `shared/sim`. The client never sends damage, loot or currency; the server runs the same rules (`executeAction`) and decides.
- Premium currency ("Cells") is modelled and tested but disabled by `FLAGS.premiumCurrencyEnabled`.

See `docs/PROGRESS.md` for what is done and the list of known gaps.
