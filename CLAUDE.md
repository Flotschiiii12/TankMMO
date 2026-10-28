# Treadfront (repo TankMMO) — notes for AI coding sessions

Online tank MMO (landscape, mobile first, browser too). Server-authoritative. Owner: Florian (speaks German; code, commits and docs are English, UI strings are DE/EN).
Live server: https://treadfront.213-199-44-82.sslip.io. Read `docs/GDD.md` (design), `docs/PROGRESS.md` (what exists + "Known gaps" + dated updates), `docs/PROTOCOL.md`, `docs/BALANCE.md`.

## Commands
- `npm test` — vitest, ~133 tests, must stay green. `npm run lint` — `tsc --noEmit`, must stay clean. `npm run build` — vite production build.
- `npm run dev` (client on :3000), `npm run server` (game server, env PORT / DB_PATH / STATIC_DIR / LOAD_TEST=1 / ADMIN_TOKEN).
- `npm run bots -- --count 200 --seconds 25 --url http://127.0.0.1:3000` — load test (server needs LOAD_TEST=1). `npm run econ-sim -- --players 100` — economy/levelling table.
- Needs Node >= 22 (`node:sqlite`). Docker image uses node:24.

## Layout
- `shared/` — pure TypeScript used by BOTH client and server: `sim/` (deterministic 30 Hz world, PvE AI, dungeons, PvP, war, map generator), `rules/` (combat, character, quests, arena, movement...), `data/` (50 vehicles, 188 items, 30 maps, enemies, quests, i18n...), `net/delta.ts`, `protocol.ts`.
- `server/` — `gameServer.ts` (instances, snapshots, sessions, actions), `app.ts` (REST + admin), `db.ts` (SQLite repos), `market.ts`, `social.ts`, `anticheat.ts`.
- `src/` — React + canvas client: `ui/` (GameShell is the main screen), `render/` (worldRenderer, vectorDraw, assets), `net/` (onlineClient, interpolation), `sim/`, `save/`.
- `test/` — vitest (unit + server integration with real sockets). `scripts/` — bots, econ-sim, backup. `public/assets/` — painted sprites.

## Invariants (break these and the game desyncs or cheats become possible)
- `shared/sim` must stay deterministic: no `Math.random`, `Date`, DOM. Use the world's `SimRNG`. Client and server run the same code, so a change in `shared/` changes both (e.g. map generation: add random draws only at the END of `mapGenerator`, otherwise every map layout shifts).
- The server decides everything (rewards, damage, loot). Never trust client values; validate in `server/gameServer.ts`.
- Entity fields are sent as deltas (`shared/net/delta.ts`); hidden/volatile fields are stripped in `viewFor`. New `SimEntity` fields are sent automatically unless stripped there.
- Sprites are only loaded if listed in `public/assets/manifest.json` (`spriteRegistry.isListed`). New sprite files MUST be added there. Missing sprites fall back to vector drawing.
- Never use canvas `shadowBlur` per sprite (very slow on phones); use the cheap ellipse shadows already in `vectorDraw.ts` / `worldRenderer.ts`.
- `.gitignore` ignores `/data/` only at the repo root. (An old `data/` rule once swallowed new files in `shared/data/`.)
- A test that generates all 30 maps (`test/pve.test.ts`) has a 30 s timeout on purpose.

## Hard rules
- **No code, art, names or texts from other games** (Red Galaxy, DarkOrbit, Seafight, Bigpoint/Gameforge titles). Everything is original. Copyright and brand risk. Do not read or copy their code even if you can reach it.
- Work on a `claude/...` branch. **Never push to `main`** — the owner merges. Currently all work lives on `claude/unify-client` (about 53 commits ahead of `main`).
- Deploying to the live server is done by the owner by hand (`git pull` + `docker compose up -d --build` on their VPS). You cannot and must not deploy.
- Use the commit trailers your session instructions give you. Keep commits focused, update `docs/PROGRESS.md` with a dated line for notable changes.
- Premium currency ("Cells") stays behind `FLAGS.premiumCurrencyEnabled = false`. No random loot boxes with real money. Fair play: strongest gear must stay earnable without paying (very grindy).

## Not in this repo
The generated art sheets (`docs/bildprompts-*.md` are the prompts) and the scripts that cut them live on the owner's server, not in Git. Do not try to regenerate art. Only wire up sprites that already exist in `public/assets`.

## Known gaps / good tasks for a cloud session (code only, no server or art tools needed)
1. Clan emblems: the 40 sprites exist (`public/assets/badges/emblem_*.png`), clans have no emblem field yet -> DB column + `social.ts` + clan create/edit UI + tests.
2. Wire the existing icons into the remaining UI: rarity gems (`icons/rarity_*.png`) in inventory/workshop, currency/ore icons in wallet bars, status icons (`st_*`) over name plates (`src/ui/GameIcon.tsx` has the helper).
3. i18n: many UI strings are still English literals (`src/i18n.ts`, `shared/data/i18n.ts`).
4. Capacitor mobile builds (see `docs/DEPLOY.md`; `VITE_SERVER_URL` is supported).
5. Clan storage of items, clan wars/alliances, spectator mode, cosmetic skin variety (see "Known gaps" in PROGRESS.md).
6. Server scaling: snapshot building/sending is ~50% of server CPU under load; one idea is moving it off the sim thread. Needs measurement (`npm run bots`), no guessing.
7. Review/hardening: anti-cheat (range / line-of-fire validation), rate limits, security review of `server/`.
8. Tests for new behaviour you add — the suite is the safety net.

## Context that explains some oddities
- The live VPS is a shared KVM guest: server ticks of 60–250 ms and ping spikes happen even with 1 player (host jitter, average tick ~2 ms). The client therefore draws remote vehicles slightly in the past (`src/net/interpolation.ts`).
- Enemy temperament: starter maps (level cap <= 5) have peaceful scouts until hurt (`acquireRange` in `shared/sim/pve.ts`); nobody hunts a player inside a safe zone; the invasion event is a capped small raid.
- The player's machine gun only fires with auto-fire on or a locked target.
