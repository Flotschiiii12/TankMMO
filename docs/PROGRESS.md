# Treadfront — Engineering Progress & Milestone Tracker

## Milestone Overview

- [x] **Milestone 1 (M1)**: Repo skeleton, `/shared` types, deterministic RNG (`sfc32`), 30 Hz tick loop, vehicle/combat core (damage model, ammo types, abilities, status effects, collision broad-phase/soft-push), unit test suite (Vitest: 5 test files, 26 tests passing), deterministic 300-tick replay test, and local single-player sandbox with virtual joystick & compact HUD.
- [x] **Milestone 2 (M2)**: Complete data tables: 50 vehicles (5 classes $\times$ 10 tiers), 188 equipment items across all families/tiers/rarities, upgrade stats (+0..+15), crafting recipes, enemy archetypes & bosses, loot tables with pity counter (threshold 10), 36 talents across 3 branches, 21 military honor ranks, 50+ achievements, i18n localization dictionary (en/de), stat/power formulas, progression rules (XP curve, kill XP scaling, garage capacity), and `/docs/BALANCE.md` updates. Vitest suite: 9 test files, 41 unit tests passing.
- [x] **Milestone 3 (M3)**: Procedural map generator + 30 map definitions + portal graph + safe zones + weather/time-of-day + resource nodes; world map screen; single-player roaming of all 30 maps.
- [x] **Milestone 4 (M4)** (simulation side; client UI for gates/events still to do): PvE content: all enemy archetypes, AI state machines, elites, mini/world/group bosses, spawn zones, convoys, gates (6 instanced dungeons), world events.
- [x] **Milestone 5 (M5)** (rules + UI in the game; drones/modules not yet applied to stats): Progression: levels 1–100, talent tree (3 branches), ranks (21), reputation, codex, achievements, garage (8 slots), mastery, skins, inventory (60–150 slots), workshop (upgrade, dismantle, craft, reroll, fusion), NPC vendors.
- [x] **Milestone 6 (M6)** (rules, data, UI; clan quests/dungeon quests wait for their systems): Quests: framework + story (10 chapters), daily/weekly/bounty/explorer/clan quests, tutorial flow with non-blocking edge hints, season pass (free track, 50 tiers).
- [~] **Milestone 7 (M7)** (server done + tested; browser client still plays offline, RemoteGameClient with prediction/interpolation is next): Server core: accounts (guest + recovery code), persistence (`node:sqlite` schemas + repositories), instance manager, authoritative simulation, protocol, snapshots with interest management, client prediction/interpolation, online-only flow, version gate, rate limits.
- [ ] **Milestone 8 (M8)**: Social: chat channels (Global, Map, Faction, Clan, Party, Whisper, System), profanity filter, report/block, friends list, parties (up to 5), profile card, rankings, clans (storage, research, wars), moderation dashboard (`/admin`).
- [ ] **Milestone 9 (M9)**: PvP: protection rules (level 15+, ±5 levels, spawn protection, safe zones), honor, bounties, weekly faction war control points, competitive arena (1v1, 3v3, 5v5, leagues, rating).
- [ ] **Milestone 10 (M10)**: Economy: currencies (scrap, ore, honor, marks, keys, fragments), sinks/faucets, auction house (hub only), direct trade, premium currency model behind disabled flag (`FLAGS.premiumCurrencyEnabled=false`), `npm run econ-sim`.
- [ ] **Milestone 11 (M11)**: Anti-cheat basics, scheduler (events, bosses, daily/weekly resets), observability (`/health`, `/metrics`, debug overlay), load test bot client (`npm run bots -- --count 200`), performance pass (60 fps client, stable 30 Hz server tick).
- [ ] **Milestone 12 (M12)**: Full QA pass: end-to-end tests across every system, balance sweep, complete documentation, list of known gaps.

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
