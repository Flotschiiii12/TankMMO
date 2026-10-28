# Cloud report 3 (branch `claude/cloud-batch-3`, based on `claude/unify-client`)

Final state: `npm test` **302 tests green** (baseline was 222), `npm run lint` clean, `npm run build` ok, `npm run e2e` ok (player moved 378 units in 5.9 s, frame time avg 16.7 ms / p95 16.8 ms in software-rendered headless Chromium), `npm run fuzz -- --seconds 20 --seed 11` ok (118k frames, 0 violations, includes the new `war_claim`, `war_status` and `feedback` ops), `npm run newbie` ok (a scripted new player finishes the 11 guided steps), `npm run layout-check` ok (0 violations at 4 viewports). 104 files changed, +4.6k / -0.3k lines. Every task has its own commit(s) and a dated line (27)-(36) in `docs/PROGRESS.md`. Nothing was pushed to `main`, nothing deployed.

| # | Task | Status |
|---|------|--------|
| 1 | Drones as real companions | **done** |
| 2 | Shots always hit (permanent rule) | **done** |
| 3 | Visible feedback for weapons, ammo, statuses | **done** |
| 4 | Combat readability | **done** |
| 5 | First-hour onboarding | **done** |
| 6 | World events end to end | **done** |
| 7 | Story and quests with NPC dialogue UI | **partly** (dialogue UI yes, NPCs standing in hubs no) |
| 8 | Faction war and PvP presentation | **done** |
| 9 | Telemetry, feedback, beta tooling | **done**, legal texts are drafts |
| 10 | Mobile UX pass with layout checks | **done**, emulation only |

## 1. Drones become real companions
- What: drones are no longer a hidden stat bonus. Each equipped drone is a `DroneSpec` on the owner; its position is a pure function of owner and time (`dronePosition`), so nothing extra is sent per frame (one small `drones` list on the owner, under 160 bytes, tested). `shared/sim/drones.ts` has the behaviours (gun drone shoots, repair drone heals, shield drone absorbs, mine layer drops real `mine` entities with a per-owner cap, radar drone widens the radar via `radarMult`). Drawn by `src/render/droneDraw.ts` (vector, no new art), listed in the inventory and the radar. Item texts in `shared/data/names/gear.ts` now say what each drone/module really does.
- Test by hand: (1) Equip a drone in the inventory (slot `drone0`). (2) Drive: the drone orbits your tank. (3) Fight: a gun drone shoots, a repair drone heals with a green pulse, a shield drone shows a ring and absorbs hits. (4) Mine layer: mines appear behind you and explode on enemies (not on you or your party).
- Numbers: `test/drones.test.ts` (new). Drones are not part of the balance harness, so their strength is hand-tuned, not simulated.
- Risks: **changes combat numbers**: the old drone `dmgAdd` is gone, drones now do their damage through `dealDirectDamage`. Mines are real entities and count against interest/snapshot size (cap per owner, 160 byte check). Modules that have no stat effect are still utility-only (names exist, no effect).
- Files: `shared/sim/drones.ts`, `shared/sim/world.ts`, `shared/sim/pve.ts`, `shared/rules/character.ts`, `src/render/droneDraw.ts`, `test/drones.test.ts`.

## 2. Shots always hit
- What: a permanent rule, no switch. Shells are guided: they carry `targetId`, aim with lead, steer toward the target at up to 7 rad/s and have a 1.5x range budget. Firing the fire button or auto-fire first acquires a target (`acquireTarget`); it never fires into empty space with a lock candidate in range. Written into `docs/GDD.md`.
- Test by hand: (1) Lock an enemy that moves and fire from medium range: shells curve onto it. (2) Strafe fast: still hits. (3) Fire at a target behind cover: shells still stop on obstacles (guidance does not go through walls).
- Numbers: because hits now land, enemy time-to-kill dropped. Elite hull multiplier raised from 5.5 to **6.4** (`ELITE_HULL_MULT`) to bring elites back into the 30-60 s band. `docs/BALANCE_REPORT.md` regenerated: **normal 50/50 cells in band, elite 50/50**, mean TTK 8.9 s (min 6.6, max 11.1).
- Risks: **changes combat numbers**. Boss/world-boss fights and PvP were not in the harness; PvP damage multiplier is unchanged. Watch the first live day for "too easy" feedback.
- Files: `shared/sim/world.ts`, `shared/data/balance.ts`, `docs/GDD.md`, `docs/BALANCE_REPORT.md`, `test/guided.test.ts`.

## 3. Visible feedback for weapons, ammo and statuses
- What: shell look per ammo type (colour, trail length, width) and per weapon family (rocket smoke trail, mortar lob shadow, railgun beam streak, flame blob), muzzle flash and hit sparks, status icons over name plates, `drone_fx` events. All drawn with vectors and the existing capped `ParticleSystem` (hard cap, smaller cap in reduced/performance mode); no `shadowBlur`.
- Test by hand: (1) Switch ammo (armor piercing vs explosive): different shell colour and trail. (2) Fire a rocket and a railgun: different effects. (3) Get frozen/burning: icon above the name plate. (4) Settings -> Reduced effects: fewer particles.
- Numbers: e2e frame time 16.7 ms avg while driving and shooting. `test/particles.test.ts` covers the caps.
- Risks: low-end phones: use performance mode (task 10).
- Files: `src/render/combatFx.ts`, `src/render/particles.ts`, `src/render/worldRenderer.ts`, `src/ui/GameShell.tsx`.

## 4. Combat readability
- What: name plate level of detail (far untouched enemies show nothing, damaged/targeted ones bars), merged floating damage numbers (200 ms per target, "-340 x3"), target panel, threat indicators at the screen edge, kill feed, low-hull pulse. Pure logic in `src/ui/combatLogic.ts`.
- Test by hand: (1) Fight a group: numbers merge instead of piling up. (2) Get shot from off-screen: edge arrow. (3) Drop below 25 % hull: red edge pulse (stops with reduced motion).
- Numbers: `test/combat_hud.test.ts`.
- Files: `src/ui/combatLogic.ts`, `src/ui/CombatHud.tsx`, `src/render/worldRenderer.ts`, `src/index.css`.

## 5. First-hour onboarding
- What: 11 guided steps (new: ammo, ability, gate) that are order-independent (a step done earlier completes at once; unknown steps cannot pollute the character), XP reward 30/120, marker on the radar and world map, `skip_tutorial` action, contextual hints, newbie protection (no scrap loss on death up to level 5). `npm run newbie` runs a scripted new player over the real protocol on a fake clock.
- Test by hand: (1) New guest account. (2) Follow the chip in the top-left block. (3) `Skip tutorial` completes it without rewards. (4) Settings -> How to play replays the lessons.
- Numbers: `test/onboarding.test.ts` (300 random orders, never stuck), `test/newbie_bot.test.ts`.
- Bug found: the bot found four dead ends (gate overshoot, ammo step needing owned ammo, the gate step needing the dungeon list opened, a maintenance reset blocking claims); all fixed.
- Files: `shared/data/quests.ts`, `shared/rules/quests.ts`, `shared/rules/hints.ts`, `src/ui/Guidance.tsx`, `scripts/newbie-bot.ts`.

## 6. World events end to end
- What: schedule as a pure function of the clock (`upcomingEvents`, `activeEvents`); everything an event creates carries `eventId` and is removed when it ends. Weekend XP now really applies (+50 %; it was defined but unused), convoy race spawns loot convoys, storms drop lightning rings, meteor nodes, capped invasion reward, event calendar UI with countdown, reward texts in DE/EN.
- Test by hand: (1) Open the event calendar from the HUD line. (2) Wait for or force an event (admin clock in tests) and join it. (3) Check the reward banner when it ends.
- Numbers: `test/world_events.test.ts` (schedule boundaries, weekend across the week edge, invasion cap).
- Risks: the HUD countdown uses the client's `Date.now()` (a clock-skewed phone shows a wrong countdown; the server decides the real start/end). **Weekend XP changes progression speed on Saturdays/Sundays.**
- Files: `shared/sim/events.ts`, `shared/sim/pve.ts`, `server/gameServer.ts`, `src/ui/EventCalendar.tsx`.

## 7. Story and quests with an NPC dialogue UI
- What: the Great Drought arc: 10 chapters x 6 dialogue scenes (60 scenes), speakers Varga, Mira, Dunmore, Ael, Rook with existing icons as portraits, flags/choices, 40 more quests, a journal tab with scene replay, DE/EN for everything. Scenes open on quest accept/claim; scene state lives in `ch.stats['scn_*']`.
- Test by hand: (1) Accept a story quest: the dialogue opens (Space/Enter advance, Esc skips). (2) Quest window -> Journal: replay a scene.
- Not done (honest): NPC quest-givers are **not** standing in the hubs as world entities; there is no "walk up and press talk". That needs art placement and a decision on interaction; the scenes work without it.
- Numbers: `test/story.test.ts` (every scene reachable, no dead ends, all keys translated).
- Files: `shared/data/storyText.ts`, `shared/data/story.ts`, `shared/data/names/story.ts`, `src/ui/Dialogue.tsx`, `src/ui/QuestModal.tsx`.

## 8. Faction war and PvP presentation
- What: control points are drawn on the ground (owner colour, capture progress arc, red dashes while contested) and polled every 2 s on maps 21-24; HUD chip with the nearest point; capture/loss banners; a War tab in the social window (weekly scores, time left, last result, rules in plain numbers); winners who spent at least 120 s on a point claim 1000 scrap + 40 season marks + title "War Victor" once per week (DB primary key `war_claims` decides races); PvP kills/deaths show a one-line summary that says why honor was withheld (level gap, repeat target); honor ranking tab.
- Test by hand: (1) Two accounts of different factions on map 21. (2) Stand on a point: the arc fills in about 13 s; the other account joins: dashes. (3) After the week rolls over (admin clock), the winning faction's War tab shows Claim; a second claim says already claimed.
- Numbers: `test/war_presentation.test.ts` (capture maths deterministic, claim once, week boundary, honor reasons), migration v5.
- Risks: **DB change (migration v5: `war_contrib`, `war_claims`)**. The reward amounts are hand-picked, not run through the economy sim (1000 scrap once a week is small next to the daily income in `ECONOMY_REPORT.md`).
- Files: `shared/sim/war.ts`, `shared/sim/pvp.ts`, `server/gameServer.ts`, `server/db.ts`, `server/migrations.ts`, `src/ui/WarPanel.tsx`, `src/render/worldRenderer.ts`.

## 9. Telemetry, feedback and beta tooling
- What: anonymous event log (`server/telemetry.ts`, migration v6): account created, tutorial step, first kill, first craft, level 5/10/20/30, gate entered/cleared, first purchase, session start/end with length. Stored: time, kind from a fixed list, HMAC hash of the account id (salt only in the DB), a short machine token. Not stored: chat, names, IPs, positions. Milestones once per player (unique index), 180-day prune, removed with the account (`forget`). Admin: `/admin/api/analytics` (D1/D7/D30 retention, tutorial funnel with conversion per step, average session length, players per hour, peak) with inline SVG charts on `/admin`; `/admin/api/feedback` lists reports. In game: Settings -> Send feedback (bug/idea/other, 1000 chars, 3 per hour); the server adds map, level, version and the last 20 error codes itself, ignoring what the client claims. German drafts in `docs/legal/` (Datenschutzerklaerung, Nutzungsbedingungen, Jugendschutz ab 13, Impressum-Vorlage) with a "needs legal review" header; they list exactly the stored fields and the test checks the table columns.
- Test by hand: (1) Play a minute with a new account, open `/admin` with the token: Analytics shows 1 account, the funnel and the session. (2) Settings -> Send feedback, send a report: it appears under "Player feedback". (3) Delete the account in the game: its rows disappear.
- Numbers: `test/telemetry.test.ts` (12 tests: retention/funnel/session/concurrency maths, privacy rules: only listed kinds, tokens refuse names and sentences, hash is salted, exact table columns, forget/prune, feedback rate limit, through the real server).
- Risks: **DB change (migration v6)**. Retention is only meaningful with a few hundred accounts. A crashed server leaves sessions open; they close at the next start (capped at one hour). Open legal decisions are listed in `docs/legal/README.md`: **chat is stored without a retention limit** (not changed here), consent for the statistics, age 13 vs 16, hoster contract.
- Files: `server/telemetry.ts`, `server/migrations.ts`, `server/app.ts`, `server/gameServer.ts`, `src/ui/FeedbackModal.tsx`, `docs/legal/`.

## 10. Mobile UX pass with automated layout checks
- What: `scripts/layout-check.ts` (`npm run layout-check`, opt-in CI job `layout`) drives the real UI in Playwright mobile emulation at 844x390, 740x360, 667x375 (notch insets) and 1280x720 and fails with a list. Checks: HUD vs joystick/fire cluster/other HUD blocks, targets >= 44 px, text >= 11 px, safe-area insets, windows fit or scroll, Escape closes, chat input leaves controls free, no page scroll, zoom slider and pinch zoom persist, left-handed swap, performance-mode DPR cap.
- Real problems it found and I fixed: the right menu column was 533 px tall on a 390 px screen (half the buttons off-screen) -> 4x2 block next to the radar on short screens; chat input and emote buttons sat on the joystick -> now in the free band between the controls, emotes behind one button; the guided-start chip overlapped the status block -> now inside it, old 4-card tutorial overlay removed; the settings window was 1386 px tall and clipped -> scrolls; the title screen could not scroll on short phones; Escape did not close quests/social; 10 px text -> 11 px; touch controls under 44 px (global `pointer: coarse` rule); the ammo button stuck into the home-bar inset; notch insets now use `--safe-*` variables everywhere.
- New settings: **Left-handed controls** (swaps joystick and fire cluster, mirrors the top bar), **Performance mode** (DPR cap 1.5, reduced particle cap, plain ground without grid; switches itself on once when frames stay above 22 ms for 5 s, with a banner; never re-enables after the player turned it off).
- Screenshots: `docs/screenshots/` (844x390 set, left-handed + performance mode, and desktop).
- Test by hand: (1) `npm run layout-check` (set `E2E_CHROMIUM`). (2) Open the game on a phone in landscape: no overlapping blocks, all buttons reachable. (3) Settings -> Left-handed controls. (4) Settings -> Performance mode: sharpness drops slightly, effects calmer.
- Numbers: `test/perf_monitor.test.ts` (trigger logic); layout check 0 violations at 4 viewports; e2e frame time 16.7 ms.
- **Only verified in emulation, not on a real phone**: real notch/home-indicator shapes (I used fixed insets), thumb reach and comfort of the new positions, iOS Safari browser chrome (`100dvh`), real GPU frame times (the 22 ms trigger was only unit tested, headless Chromium has no slow-frame case), haptics/audio on the first tap. Please try it once on a real phone before a tester round.
- Files: `scripts/layout-check.ts`, `src/index.css`, `src/ui/HUD.tsx`, `src/ui/ControlsOverlay.tsx`, `src/ui/ChatInput.tsx`, `src/ui/layoutStrip.ts`, `src/ui/perfMonitor.ts`, `src/ui/SettingsModal.tsx`, `.github/workflows/ci.yml`, `docs/MOBILE.md`.

## Measured numbers
- Tests 302 (was 222); lint clean; build ok.
- Snapshot cost: drones add one small `drones` list on the owner (under 160 bytes, asserted in `test/drones.test.ts`). `npm run snapshot-bench` (400 clustered bots, 4 instances, 30 Hz): avg tick 9.3 ms, p95 23 ms, p99 30 ms, max 34 ms, 28 % real-time load, snapshots 6.2 ms of the 9.3 ms; about 38 MB/s out in total for 400 bots (about 95 KB/s per bot in this synthetic clustered worst case). I did not run a before/after on the snapshot bench for each task, only this final run.
- Balance: normal enemies 50/50 cells in the 5-15 s band (mean 8.9 s), elite 50/50 in 30-60 s after `ELITE_HULL_MULT` 6.4.
- Frame budget: e2e 16.7 ms average, 16.8 ms p95 (headless, software rendering); a particle hard cap and a reduced cap keep effects bounded.

## Bugs found on the way
- Elite time-to-kill dropped to 43/50 cells in band once shots always hit (fixed with `ELITE_HULL_MULT`).
- Newbie bot dead ends in the tutorial (four, see task 5).
- World map modal existed but was never rendered in `GameShell` (now rendered).
- Weekend XP was defined but never applied.
- Settings window clipped, title screen unscrollable, Escape not closing quests/social, right menu column off-screen on phones (task 10).
- Duplicate i18n keys (TS1117) and wrongly informal German "Sie" false positives in the names test: reworded.

## Risks and what to deploy with care
- **Tasks 1, 2 and 9 change combat numbers, the protocol and the database.**
  - Combat: drones now do real damage; shots are guided (hit rate up) and elites have 6.4x hull; weekend XP +50 %. Watch the first live day (too easy? too much XP?).
  - Protocol: new ops `war_claim`, `war_status`, `feedback` and the `pvp_summary`/`drone_fx` events, a `drones` list on entities. `PROTOCOL_VERSION` was **not** bumped; old clients simply ignore what they do not know, but they will not show drones. Bump it if you want old clients to be forced to update.
  - Database: two migrations, v5 (`war_contrib`, `war_claims`) and v6 (`telemetry_meta`, `telemetry`, `feedback`). The server refuses to start on a database newer than it knows, so **take a backup (`scripts/backup-db.sh`) before the first start**. Rolling back the code needs the pre-migration backup.
- Deploying stays manual (`git pull`, `docker compose up -d --build`).
- Legal drafts are not legal advice; do not publish them without review (chat retention is the biggest open point).
- NPC quest-givers in the hubs, drone strength in the balance harness, and a real-phone pass are still open.

## Biggest files (lines changed vs `claude/unify-client`)
`shared/data/storyText.ts` (+310), `scripts/layout-check.ts` (+225), `shared/sim/drones.ts` (+217), `src/ui/GameShell.tsx` (+200), `test/drones.test.ts`, `test/world_events.test.ts`, `scripts/newbie-bot.ts`, `test/telemetry.test.ts`, `server/telemetry.ts`, `server/gameServer.ts` (+155), `src/render/worldRenderer.ts` (+134).

Setup note: `npm install --legacy-peer-deps --ignore-scripts`; Playwright needs `E2E_CHROMIUM=/opt/pw-browsers/chromium` here.
