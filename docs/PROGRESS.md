# Treadfront — Engineering Progress & Milestone Tracker

## Milestone Overview

- [x] **Milestone 1 (M1)**: Repo skeleton, `/shared` types, deterministic RNG (`sfc32`), 30 Hz tick loop, vehicle/combat core (damage model, ammo types, abilities, status effects, collision broad-phase/soft-push), unit test suite (Vitest: 5 test files, 26 tests passing), deterministic 300-tick replay test, and local single-player sandbox with virtual joystick & compact HUD.
- [x] **Milestone 2 (M2)**: Complete data tables: 50 vehicles (5 classes $\times$ 10 tiers), 188 equipment items across all families/tiers/rarities, upgrade stats (+0..+15), crafting recipes, enemy archetypes & bosses, loot tables with pity counter (threshold 10), 36 talents across 3 branches, 21 military honor ranks, 50+ achievements, i18n localization dictionary (en/de), stat/power formulas, progression rules (XP curve, kill XP scaling, garage capacity), and `/docs/BALANCE.md` updates. Vitest suite: 9 test files, 41 unit tests passing.
- [x] **Milestone 3 (M3)**: Procedural map generator + 30 map definitions + portal graph + safe zones + weather/time-of-day + resource nodes; world map screen; single-player roaming of all 30 maps.
- [x] **Milestone 4 (M4)** (simulation side; client UI for gates/events still to do): PvE content: all enemy archetypes, AI state machines, elites, mini/world/group bosses, spawn zones, convoys, gates (6 instanced dungeons), world events.
- [x] **Milestone 5 (M5)** (rules + UI in the game; drones/modules not yet applied to stats): Progression: levels 1–100, talent tree (3 branches), ranks (21), reputation, codex, achievements, garage (8 slots), mastery, skins, inventory (60–150 slots), workshop (upgrade, dismantle, craft, reroll, fusion), NPC vendors.
- [x] **Milestone 6 (M6)** (rules, data, UI; clan quests/dungeon quests wait for their systems): Quests: framework + story (10 chapters), daily/weekly/bounty/explorer/clan quests, tutorial flow with non-blocking edge hints, season pass (free track, 50 tiers).
- [x] **Milestone 7 (M7)** (server done + tested; browser client still plays offline, RemoteGameClient with prediction/interpolation is next): Server core: accounts (guest + recovery code), persistence (`node:sqlite` schemas + repositories), instance manager, authoritative simulation, protocol, snapshots with interest management, client prediction/interpolation, online-only flow, version gate, rate limits.
- [x] **Milestone 8 (M8)** (server + UI; faction chat channel not implemented, factions chosen at account creation): Social: chat channels (Global, Map, Faction, Clan, Party, Whisper, System), profanity filter, report/block, friends list, parties (up to 5), profile card, rankings, clans (storage, research, wars), moderation dashboard (`/admin`).
- [x] **Milestone 9 (M9)** (server rules + tests; no PvP/arena/war UI yet beyond the generic social modal): PvP: protection rules (level 15+, ±5 levels, spawn protection, safe zones), honor, bounties, weekly faction war control points, competitive arena (1v1, 3v3, 5v5, leagues, rating).
- [x] **Milestone 10 (M10)**: Economy: currencies (scrap, ore, honor, marks, keys, fragments), sinks/faucets, auction house (hub only), direct trade, premium currency model behind disabled flag (`FLAGS.premiumCurrencyEnabled=false`), `npm run econ-sim`.
- [x] **Milestone 11 (M11)** (single-thread server; worker threads are the next scaling step): Anti-cheat basics, scheduler (events, bosses, daily/weekly resets), observability (`/health`, `/metrics`, debug overlay), load test bot client (`npm run bots -- --count 200`), performance pass (60 fps client, stable 30 Hz server tick).
- [x] **Milestone 12 (M12)** (QA pass done; see known gaps): Full QA pass: end-to-end tests across every system, balance sweep, complete documentation, list of known gaps.

---

## Milestone 1 Implementation Details

### What was completed:
1. **Repository Structure**:
   - `/shared`: Pure TypeScript deterministic simulation, math helpers, types, flags, and rules.
     - `/shared/types.ts`: Vector math, vehicle classes, ammo types, abilities, status effects, commands, events.
     - `/shared/flags.ts`: Feature flags (`premiumCurrencyEnabled: false`, `pvpEnabled: true`, `auctionEnabled: true`).
     - `/shared/prng.ts`: `SimRNG` (sfc32) with fork, range, chance, and serializable state.
     - `/shared/rules/combat.ts`: Section 2 exact damage model (Front $0.7\times$, Side $1.0\times$, Rear $1.4\times$, 80/20 armor split, flat reduction clamp $\ge 10\%$, crits $1.5\times$, Marked $+15\%$).
     - `/shared/rules/ammo.ts`: Ammo configs (`STANDARD`, `REINFORCED`, `ARMOR_PIERCING`, `SHAPED_CHARGE`, `EXPLOSIVE`) with dynamic target scaling and auto-fallback.
     - `/shared/rules/status.ts`: Status effect durations, Burning DoT, and EMP stun diminishing returns.
     - `/shared/rules/collision.ts`: Circle-circle soft push, obstacle penetration resolution, water slow zones.
     - `/shared/rules/power.ts`: Vehicle combat power rating calculation.
     - `/shared/sim/world.ts`: Pure 30 Hz fixed-timestep world simulation, command dispatcher, and state hashing.
     - `/shared/protocol.ts`: Client-server message types and version handshake.
2. **Unit Tests (Vitest)**:
   - Configured `vitest` in `package.json` (`npm test`).
   - `test/combat.test.ts`: 11 tests verifying all combat angles, armor absorption, flat reduction clamps, crits, and invulnerability.
   - `test/ammo.test.ts`: 6 tests verifying ammo multipliers, target scaling, and inventory consumption fallback.
   - `test/status.test.ts`: 4 tests verifying duration ticks, burn DoT, and EMP diminishing returns.
   - `test/collision.test.ts`: 4 tests verifying obstacle blocking, water slow, and vehicle push.
   - `test/determinism.test.ts`: 300-tick replay test verifying bit-identical world state hash between independent runs.
   - **Total**: 5 test files, 26 unit tests passing.
3. **Documentation**:
   - `/docs/GDD.md`: Concise game design document mirroring the prompt requirements.
   - `/docs/BALANCE.md`: Exact combat formulas, ammo tables, tier scaling, and XP curves.
   - `/docs/PROTOCOL.md`: Network protocol, message types, and sequence synchronization.
   - `/docs/PROGRESS.md`: This milestone tracking document.
4. **Local Playable Sandbox**:
   - Responsive landscape HUD with left joystick, right target/auto-fire button, radial ability buttons, ammo cycler, radar, and non-blocking tutorial cards.

---

## How to Run & Test

```bash
# Run all unit tests (determinism, combat, ammo, status, collision)
npm test

# Run type check & linter
npm run lint

# Start development server
npm run dev

# Build production bundle
npm run build
```

---

## Known Gaps (Advancing to M2)
- Vehicles currently load from prototype data tables; M2 will expand to the complete 50 vehicle roster (5 classes $\times$ 10 tiers) and full itemization/crafting catalogs.
- Ground rendering currently uses procedural raster textures and props from `/public/assets`; M3 will wire the procedural 30-map world graph.


---

## Status update (Claude takeover, branch claude/unify-client)

- Client now runs on the shared deterministic simulation; the old src/sim/world.ts is gone.
- shared/sim/pve.ts: enemy AI, elites (3 per PvE map), bosses with phases/escorts/telegraphs, world boss reward tiers by damage share, loot, portals (3 s hold), mining (3 s), wrecks, respawns, MG.
- shared/sim/dungeon.ts + shared/data/dungeons.ts: 6 gates, 5 waves + boss, party scaling (1-5), 15 min timer, deterministic.
- shared/sim/events.ts: pure event schedule (invasion, convoy race, storm, meteor shower, weekend XP) and world boss rotation (maps 19/27, 2 h).
- 50 vehicles are in the garage (class tabs); old saves migrate (ids and ammo keys).
- Not yet wired in the client: dungeon entry UI, event banners, world boss UI, the 188 items/inventory/workshop (M5).
- Tests: 58 (npm test), tsc clean.
- M5: shared/rules/character.ts (XP, talents, respec, garage, mastery, inventory, upgrade/dismantle/craft/reroll/fusion, loadout stats). In game: Loadout & Workshop modal, talents tab, kill XP + loot.
- M6: shared/data/quests.ts (tutorial 8 steps, story 10 chapters x 10, daily pool 40, weekly pool 9, bounty, explorer, faction, clan), shared/rules/quests.ts (framework, rotation, rewards, season pass free track 50 tiers). In game: Quest modal, HUD tracker, auto tutorial.
- Tests: 77, tsc clean.

### M7 server (server/, shared/net/delta.ts)
- Run: `npm run server` (PORT, DB_PATH, STATIC_DIR env). REST: /api/guest, /api/recovery-code, /api/recover, /api/rename, /api/export, /api/delete-account, /api/time, /api/leaderboard, /health, /metrics. WebSocket: /ws.
- Authoritative: 30 Hz instances (cap 100 players, extra instances open automatically), 10 Hz delta snapshots with interest radius 1500 and half-rate updates beyond 700, server-side rewards (XP, loot, scrap, ore, quests), gate travel, respawn, autosave every 30 s and on disconnect.
- Validation: protocol version gate (close code 4426), credential check (4404 unknown/bad, 4403 banned), one connection per account (4409), input clamping, unknown commands dropped, command budget (90/s), replayed seq rejected, workshop actions only in safe zones, chat slow mode and filter.
- Persistence behind interfaces (AccountRepo, ProfileRepo, ChatRepo), SQLite schema in plain SQL.
- Load test: `npm run bots -- --count 200 --seconds 25 --url http://127.0.0.1:3000` (set LOAD_TEST=1 on the server to bypass REST rate limits). Optimizations after the first run: per-snapshot shared views and cached diffs (tick cost 237 ms -> ~20 ms at 190 clustered bots).
- Tests: test/server.test.ts (9 integration tests with real sockets).
- Load test result (200 bots, 2 instances of 100, all clustered at the spawn = worst case, same VPS core): 0 errors, 0 disconnects, ping p50 53 ms / p95 239 ms, avg tick 26 ms (budget 33 ms), spikes up to 577 ms, ~52 KB/s per bot. Conclusion: one Node thread holds about 150-200 clustered players; spread out players cost far less. Next scaling step: one worker thread per instance.

### M8 / M9 (server)
- Social: friends (requests/accept/list/online), blocks (hide chat, drop whispers), reports (10/h limit), parties (5, +10 % shared XP per extra member for nearby members, shared quest credit), clans (create 10,000 scrap, tag, roles leader/officer/member, invites, kick/promote, donations log, research, clan quests progress, ranking), chat channels G/M/C/P/W/T with slow mode + filter, profile card, rankings (level/clans/arena/honor).
- Admin: /admin page + /admin/api (token): stats, online list, ban/mute/kick/rename/delete, announcements, reports, audit log.
- PvP (shared/sim/pvp.ts): only maps 21-29 vs other factions; level >= 15, +-5 levels, respawn/portal protection, no damage in safe zones or within 400 of a portal, kill cap (3rd kill in 30 min -> 1 h immunity), honor once per victim per 30 min, streak bounty from 5 kills.
- Faction war (shared/sim/war.ts): 3 control points on maps 21-24, capture/contested/decay, score per owned point, weekly totals in the database, last-week winner query.
- Arena (shared/rules/arena.ts + server): leagues by combat power, Elo per mode (1v1/3v3/5v5), queue + league-widening after 30 s, countdown, best of 3, forfeit/dodge penalty (10 min), rewards, return to the hub.
- Faction chosen at account creation (start region 1/5/9); change costs 20,000 scrap and has a 7-day cooldown (action `change_faction`).
- Tests: 104.

### M10 / M11
- Economy: auction house (hub only, 5 % tax reduced by talent/war discount, price band 0.5x-60x NPC value, 10 listings, 12/24/48 h, account >= 3 days, 2M scrap/day volume cap, escrow + mail for returns/proceeds), direct trade (friends or clan, both confirm, any change resets, atomic swap), NPC vendors (35 % of value), fast travel between visited maps (150 scrap per portal hop), premium "Cells" wallet with idempotent ledger and receipt-validation interface, all inert while FLAGS.premiumCurrencyEnabled is false, no random loot boxes.
- `npm run econ-sim -- --players 100`: per-10-level faucet/sink table. Finding: sinks ~60-100 % of faucets after adding upgrades of all 4 gear pieces; levelling 1->60 takes ~44 simulated hours at 220 kills/h, which is FAR faster than the design target (months) -> XP curve / kill XP must be tuned before launch.
- Anti-cheat basics: server authority, input clamping, command budget, replay rejection, bot heuristics (regular timing, floods, 20 h sessions) in /admin/api/flagged and the online list.
- Scheduler (once a minute): daily/weekly quest rotation, season rollover, weekly war result announcement; events and world bosses run in instances; world messages are forwarded as system chat. Structured JSON logs, /health, /metrics.
- Persistence: autosave 30 s plus immediate saves for craft/upgrade/trade/purchase/level-up/quest claims, save on disconnect and SIGTERM.
- Tests: 113.

## M12: QA pass, final status

- Automated: 21 test files, 117+ tests (rules, sim, determinism, PvP, arena, economy, social, server integration with real sockets), `tsc` clean, production build OK.
- Manually verified in a real browser (Playwright): offline sandbox (combat, abilities, kills -> XP/loot, quests, workshop, garage, gate travel, mining), online mode against the real server (age gate, guest account, join, prediction, movement). Painted vehicle/enemy sprites load.
- Achievements (50, data-driven counters) + codex + titles, dungeons (gates) on the server with keys and rewards, explorer secrets, world-boss damage-share rewards.

### Known gaps (honest list)
1. **Balance:** levelling 1->60 takes ~44 simulated hours at 220 kills/hour; the design target is months. XP curve / kill XP / enemy density need tuning with real playtests. Economy sinks look balanced in `econ-sim` but are untested with real players.
2. **Scaling:** one Node thread; ~150-200 players when all clustered in 2 instances (avg tick 26 ms of 33 ms). Next step: a worker thread per instance, and spreading players across instances by region.
3. **Localisation (DE/EN):** the i18n tables exist in `shared/data/i18n.ts`, but most UI strings are still English literals. No language switch yet.
4. **Art:** vector placeholders everywhere except the painted pack for tiers 1-3 vehicles, 4 enemy types, ground/props/landmark/fx sprites. Tiers 4-10, artillery/bosses, class-specific sprites and UI icons are still placeholders. No audio files (procedural sounds only).
5. **UI gaps:** no dedicated screens for event banners, boss health bars, dungeon wave progress, arena HUD (round score/timer), party markers on the radar, emotes, and settings beyond sound/zoom. The social/market/arena/gates screens are functional but plain.
6. **Not implemented:** faction chat channel; drones/modules do not affect stats yet; clan wars over bases and alliances; clan storage of items (scrap only); spectator mode; map-specific ground/weather rendering beyond the existing basics; reputation levels/vendor discounts (counter exists, no vendor effects); cosmetic skin application; accessibility options (colour-blind mode, reduced motion).
7. **Anti-cheat:** server authority + heuristics only; no server-side line-of-fire/range validation beyond the sim itself, no IP/device reputation, bans are account-based.
8. **Ops:** SQLite single file (backup via file copy / `VACUUM INTO`), no automatic backups yet, no TLS/domain setup (use a reverse proxy), no CI.
9. **Mobile builds:** Capacitor/iOS/Android wrappers are not set up for this project yet (the web build works on mobile browsers).
