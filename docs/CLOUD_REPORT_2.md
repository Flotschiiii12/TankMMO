# Cloud report 2 (branch `claude/cloud-batch-2`, based on `claude/unify-client`)

Final state: `npm test` **221 tests green** (was ~145 after the first run), `npm run lint` clean, `npm run build` ok, `npm run e2e` ok (player moved 383 units in 5.9 s, no browser errors), `npm run fuzz` ok. Nothing was pushed to `main`, nothing deployed. Every task was pushed as its own commit(s).

| # | Task | Status |
|---|------|--------|
| 1 | CI + end-to-end smoke test | **done** |
| 2 | Fuzzing and property tests | **done**, 5 real bugs fixed |
| 3 | Close the design-level security items | **done** |
| 4 | Combat balance simulator and tuning | **done**, with caveats (see 4) |
| 5 | Progression / economy tuning | **done** |
| 6 | Versioned DB migrations + backup verification | **done**, 1 real bug found |
| 7 | Clan item storage + alliances | **done** |
| 8 | Arena spectator mode | **done** |
| 9 | German names for all data-driven content | **done** (~1000 keys) |
| 10 | Server scaling spike | **done, one change kept: 400 clustered bots -41 % tick, memory leak fixed** |

Setup note: `npm install --legacy-peer-deps` (vite 8 vs esbuild peer conflict, same as the Dockerfile). Playwright's own browser version does not match the pre-installed Chromium here; `E2E_CHROMIUM=/opt/pw-browsers/chromium npm run e2e` points it at the installed one.

## 1. CI + e2e smoke test
- What: `.github/workflows/ci.yml` (lint, test, build on Node 24 with npm cache; an opt-in `e2e` job via manual dispatch or the PR label `e2e`), `scripts/e2e.ts` (real server on a free port with a temp DB, Chromium, age gate, deploy, drive, auto-fire, open the inventory, fail on page/console errors or movement < 20 units), `docs/TESTING.md`.
- Test by hand: (1) `npm run e2e` (needs a Chromium; set `E2E_CHROMIUM` if Playwright's does not match). (2) It prints `E2E OK: moved N units`. (3) Push a branch: the CI job runs lint/test/build.
- Numbers: 383 units in 5.9 s on this machine.
- Risks: the e2e job is opt-in on purpose (browser download in CI is slow); it drives the UI through the F3 debug position read-out, so a renamed overlay breaks it.
- Files: `.github/workflows/ci.yml`, `scripts/e2e.ts`, `docs/TESTING.md`.

## 2. Fuzzing and property tests
- What: seeded fuzz harness with real clients (`scripts/fuzzLib.ts`, `scripts/fuzz.ts`, `test/fuzz.test.ts`): malformed / oversized / binary frames, prototype keys, `Infinity`/`NaN`, reconnect storms, invariants after every round (wallet finite, item uids unique, no item or scrap created, database reload equals memory). Property tests for random action sequences (`test/properties.test.ts`: a failed action must not change the state; craft then sell is never profitable) and economy conservation (`test/economy_properties.test.ts`: trades and auctions create and destroy nothing, concurrent buys).
- Bugs found and fixed: (1) a failed `equip` unequipped the old item, (2) `fuse` with a non-array threw, (3) `ranking` and name ops without their fields threw, (4) `ah_search` with non-string filters threw inside SQLite binding, (5) `SelectAmmo` accepted any key. Also: requests and actions must now be flat records (no nested objects, prototype keys, Infinity; strings <= 2000 chars, arrays <= 50), `c_ping` needs a finite timestamp, `c_chat` field types are checked.
- Test by hand: `npm run fuzz -- --seconds 30 --seed 7` (prints `fuzz OK` or the failing seed; the same seed reproduces it).
- Risks: the strict flat-payload rule rejects any future request that wants a nested object; add an explicit exception then.
- Files: `server/gameServer.ts`, `scripts/fuzzLib.ts`, `shared/rules/actions.ts`, `test/properties.test.ts`.

## 3. Design-level security items
- What (all four items from `docs/SECURITY_REVIEW.md`, now marked resolved): abilities are gated by the loadout (`shared/rules/abilities.ts`), trading needs both players in a safe zone or within 500 units (`too_far`), failed logins and guest creation are backed off per IP (`server/throttle.ts`, accounts that already logged in from that IP are never blocked, `TRUST_PROXY` hops respected), a thrown error in one instance no longer stops the others (per-instance try/catch, three failures within 10 s quarantine the instance and move its players to a fresh one), movement and shot plausibility checks (`server/plausibility.ts`, `/metrics` shows corrections, dropped shots and the worst movement ratio).
- Numbers: 200-bot run, 0 false positives, worst displacement 0.51 of the allowed bound.
- Test by hand: `test/hardening.test.ts`; on a running server `curl /metrics | grep -E "teleport|shots_dropped|quarantined"` must stay at 0 during normal play.
- Risks: plausibility checks could flag very laggy clients; the bound has 2x margin. Instance ids changed to `i<map>-<n>`.
- Files: `server/gameServer.ts`, `server/plausibility.ts`, `server/throttle.ts`, `test/hardening.test.ts`.

## 4. Combat balance simulator and tuning
- What: a headless harness runs the real sim (`scripts/balanceLib.ts`), and a pipeline fits the game to targets: enemy stats per level (`shared/data/balance.ts`, `enemyScale`), archetype roles, class equalisation in PvP (Elo style), bosses and gates, written to `docs/BALANCE_REPORT.md` (`npm run balance`, method in `docs/BALANCE.md` section 9). Rule changes: machine gun floor 3 % of the main gun, speed bonus cap 1.5x for item multipliers, PvP damage x0.7, elites 5.5x hull, boss machine gun scaled.
- Numbers: normal enemies die in 5 - 15 s in 50 of 50 cells, elites 30 - 60 s in 47 of 50, PvP class spread ratio ~1.28, mirror duels 22 - 40 s, bosses ~5 min for a party of 4 with ~45 % of the party health left, gates ~9 min. Guard tests: `test/balance.test.ts`.
- Test by hand: `npm run balance-sim` (minutes) and read `docs/BALANCE_REPORT.md`; in game, walk a level-appropriate map and watch how long a normal enemy lives.
- Bugs found on the way: bosses and every player/NPC vehicle carry a machine gun with the default 18 damage that dominated long fights (now scaled); gate wipes came from boss phase-2 scout adds (the controller now targets adds first).
- Caveats, honest: class balance is only aggregate, per-tier swings remain (heavy is strong at T4 and weak at T10); artillery was balanced numerically because the sim has no terrain advantage; boss main-gun damage is low (25 - 650), the danger comes from adds and telegraphs; there is no repair / durability system.
- Risks: **this changes the live game's numbers** (class hull / damage, enemy scale, XP curve, upgrade costs, gate rewards). Existing characters keep their items; enemies hit and die differently. Announce it.
- Files: `shared/data/{balance,enemies,dungeons,vehicles}.ts`, `shared/sim/{pve,pvp,dungeon,world}.ts`, `shared/rules/character.ts`, `scripts/balance-*.ts`.

## 5. Progression / economy tuning
- What: XP curve `7.7 n^2.7`, top gate rewards cut, upgrade costs grow with the item tier (`upgradeCost(level, safe, itemTier)`), `scripts/econ-sim.ts` v2 (`--out docs/ECONOMY_REPORT.md`), guard tests `test/economy_targets.test.ts`.
- Numbers: level 30 / 60 / 100 after 20 / 124 / 505 h (before: 26 / 94 / 220 h); best gear (tier-10 vehicle plus four items at +15) 1129 h for a free player vs 961 h for the hypothetical payer (15 % faster, levelling is unchanged by paying); sinks cover 69 - 101 % of faucets.
- Test by hand: `npm run econ-sim -- --players 100`; in game open the Inventory and look at the upgrade cost of a tier-8 item vs a tier-1 item.
- Risks: slower levelling than before for everyone above level ~30. Together with 4 this is the biggest player-visible change.
- Files: `shared/rules/progression.ts`, `shared/rules/character.ts`, `scripts/econ-sim.ts`, `docs/ECONOMY_REPORT.md`.

## 6. Versioned DB migrations + backup verification
- What: `server/migrations.ts` (`schema_version` table, one transaction per migration, idempotent steps, pre-migration copy `<db>.pre-v<N>-<ts>.bak`, newer schemas are refused with `SchemaTooNewError`), baseline v1, v2 `accounts.start_faction`, v3 `clans.emblem`, v4 clan storage / alliances. Fixtures of five historical schemas from git history (`test/fixtures/schema_*.sql`), `npm run verify-backup`, backup retention / consistency / daily trigger tests, `docs/DEPLOY.md` section "Database migrations and backups".
- Bug found: databases created before the M9 release never got `accounts.start_faction` (now migration 2).
- Test by hand: (1) copy the live DB to a scratch dir. (2) Start the new server against the copy: it logs the migrations and writes a `.pre-v*.bak`. (3) `npm run verify-backup -- <backup file>`.
- Risks: the first start on the live DB runs migrations 2 - 4 (fast, additive). Keep the `.bak`. An older server on a migrated DB refuses to start (on purpose).
- Files: `server/migrations.ts`, `server/db.ts`, `test/migrations.test.ts`, `scripts/verify-backup.ts`.

## 7. Clan item storage + alliances
- What (`server/clanStorage.ts`, migration 4, ops `clan_storage|deposit|withdraw|storage_policy|allies|ally_propose|ally_accept|ally_decline|ally_break`, UI `src/ui/ClanExtras.tsx` in the clan tab): storage of 20 slots + 10 per `storage` research level; deposit and withdraw only in a safe zone, equipped and bound items refused; the item moves and the profile is saved in ONE database transaction with a conditional DELETE deciding races (a failed save rolls everything back); the leader sets the minimum role that may withdraw, daily limits (member 2 / officer 8 / leader 20), audit log, and the last member leaving mails the items back. Alliances: officer proposes, leader accepts or breaks, at most 2 per clan, 7-day cooldown after a break, crossing proposals become an alliance, new chat channel `A` (own clan plus allies), and allies cannot hurt each other on faction-war control points (`world.alliances`, `canEngage`). Reserved clan tags (CMD, BOSS, SYS, NPC, GM, ADMIN).
- Test by hand: (1) Two accounts, clan A and B (10,000 scrap each). (2) Clan tab > Item storage > deposit an item; the second member withdraws it (limit shown). (3) A proposes an alliance to B's tag, B's leader accepts; chat channel Allies reaches both. (4) On a war map stand on a control point with an ally from another faction: no damage between you.
- Risks: protocol additions only (no version bump). The immunity is keyed by clan tag; tags are unique. Players cannot yet see allies' tags in the war UI.
- Files: `server/clanStorage.ts`, `server/gameServer.ts` (`handleClanExtras`), `shared/sim/pvp.ts`, `test/clan_storage.test.ts`.

## 8. Arena spectator mode
- What (`server/spectate.ts`, ops `spectate_list|join|leave`): each running match records the public view of every entity (the same stripping an opponent gets: no reload timers, cooldowns, ammo); spectators receive the frame from **5 s ago**, are not part of the instance (no capacity use, their input is dropped, no entity in the arena world), are capped at 20 per match, and are returned to their own map when the match ends, the instance fails or they disconnect. Client: watch list in the arena tab, `SpectateBar` (previous / next fighter, free camera with arrows or WASD, leave), the existing arena HUD chip works because the delayed phase events are replayed.
- Test by hand: (1) Two accounts queue 1v1. (2) A third opens Social > Arena > Running matches > Watch. (3) The picture is a few seconds behind; Next / Previous cycles the camera, Free camera moves it; Leave returns you.
- Tests: spectator cannot affect the match, takes no capacity, receives no private data (reload / cooldown / ammo fields are the neutral values), cap, busy / queue refusals, cleanup on match end and on disconnect.
- Risks: the 5 s delay is fixed (`SPECTATE_DELAY_SECONDS`). Spectators use the encoder of their own session, so a spectator's hub entity just stands still while they watch.
- Files: `server/spectate.ts`, `server/gameServer.ts`, `src/ui/SpectateBar.tsx`, `src/ui/SpectateList.tsx`, `test/spectate.test.ts`.

## 9. German names for all data-driven content
- What: English + German texts for every `nameKey` / `descriptionKey` / `descKey` / `titleKey` in `shared/data` (`shared/data/names/{gear,world,progress}.ts`, merged into `TRANSLATIONS`): 50 vehicles, 188 items + 8 affixes, 30 maps with descriptions, 11 enemies, 5 bosses, 6 gates and gate bosses, 185 quests, 36 talents, 51 achievements, 21 ranks / titles, event names and notices (~1000 keys; names are composed from small tables, so a new tier or family is one new row). The client reads them with `nm(key, englishName)`, so English players see exactly the old text; enemy / boss name plates go through `localizeEntityName` ("Elite Gunner Truck [Lv.12]" -> "Elite-Kanonentruck [Lv.12]"); talents, achievements, quests, ranks, titles, maps, gates and event banners now show real names instead of ids.
- Tests: `test/names.test.ts` fails when a key used by the data tables or written literally in `shared/data/*.ts` has no text, when placeholders differ, when the English text differs from the data's own name, when German names collide, when more than 10 % of the German texts equal the English, or when formal address ("Sie") slips in.
- Test by hand: set the language to Deutsch in Settings (page reloads); open Garage (vehicle names and descriptions, talents), Inventory (item names), World map (zone names and texts), Quests, Social > Career (achievements, rank, titles).
- Not translated: server-sent chat lines other than the world-boss alert, the developer panel, plain player-visible numbers.
- Risks: German item names are `<Family> T<n>`; drones share one name across five tiers (as in English).
- Files: `shared/data/names/*`, `shared/data/i18n.ts`, `src/i18n.ts`, `test/names.test.ts`.

## 10. Server scaling spike (details in `docs/SCALING_REPORT.md`)
- What: new measurement tools (`npm run scaling`, `scripts/snapshot-bench.ts`, `scripts/cpuprofile-top.ts`, admin `GET /admin/api/tickstats`) and one kept change: the delta encoder cached diffs backwards in a `WeakMap`, so every new entity state kept all older ones alive, a **memory leak of ~0.3 MB per tick with 100 players** and, with it, GC stalls of up to 4.5 s. The cache now points forward from the previous state; plus two small allocation savers.
- Numbers (real sockets, bots in separate processes): 400 clustered bots **avg tick 28.0 -> 16.4 ms (-41 %)**, p95 62 -> 48 ms, **worst tick 4457 -> 91 ms**, busy 67 -> 49 %, the server holds 30 Hz instead of 24 Hz; 400 spread -33 % avg; 200 bots -15 %. Heap after a forced GC: 580 MB -> 15 MB after 2400 ticks. GC share of all CPU: 21 % -> 7 %.
- Test by hand: `npm run scaling -- --bots 400 --mode clustered --seconds 60` (about 2 min) and compare with the report; `curl /metrics | grep tick_ms_max` on the live server before and after the deploy, and watch the process memory over a day.
- Not done (written up with reasons): worker threads, process per map group, binary patch format, simulation spatial grid.
- Risks: low (no protocol, data or DB change). It touches the hot path of every snapshot, so deploy it separately from the balance changes if you want to attribute any change in behaviour.
- Files: `shared/net/delta.ts`, `server/gameServer.ts`, `test/delta.test.ts`, `docs/SCALING_REPORT.md`.

## Bugs found in running code (summary)
Failed `equip` unequipped the old item; `fuse` / `ranking` / name ops / `ah_search` / `SelectAmmo` accepted malformed input; databases from before M9 had no `start_faction`; boss and NPC machine guns dominated fights; boss adds wiped gate parties; **the delta cache leak and GC stalls**; the world-boss "Arc Drone Drone" name.

## What to deploy with care
1. **Scaling fix (task 10)**: safe and valuable, but it changes the memory profile; deploy it first and watch memory and `treadfront_tick_ms_max`.
2. **Migrations (6, 7)**: the first start on the live database runs migrations 2 - 4 and writes a `.bak`; take your own copy first (`npm run verify-backup`), and do not start an older server on the migrated file.
3. **Balance + economy (4, 5)**: changes the numbers the players know (class stats, enemy scale, XP curve, upgrade costs, gate rewards). Test on a copy, announce it.
4. **Strict payload validation and login back-off (2, 3)**: set `TRUST_PROXY=1` behind Caddy, otherwise all players share one IP for the back-off.
