# Cloud report 4: UI/UX overhaul (branch `claude/cloud-batch-4`)

Based on `claude/unify-client`, 10 commits, nothing pushed to `main`, nothing deployed. No game rules, balance, protocol version or database schema changed. Server additions are read-only or additive: ops `ah_recent`, `ranking_me`, `players_nearby`, extra public `profile` fields, `GET /api/news`, `GET /api/status`, `GET /legal/:doc`, admin `GET/POST /admin/api/news`.

## Status per task

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | Design system / UI kit | done | tokens, 3 faction themes, 20+ components, gallery (`#/ui-gallery`), `docs/UI_KIT.md` |
| 2 | Window manager, main nav, top bar | done | one stack, float (desktop, draggable, remembered) or full-screen sheet (phones), Esc / back button, shortcut help (`?`), pips on menu buttons |
| 3 | HUD redesign | done | status cluster, target frame, hotbar, chat dock, notification centre, worst-case fixture page checked by layout-check |
| 4 | Hangar | done | carousel, preview, drag and drop, best-loadout planner, presets |
| 5 | Inventory, workshop, market, mail | done | virtual grid, filters, compare, bulk dismantle with review, auction + trade + mail in one window |
| 6 | World map, quests, career | done | 30-node map with fog and markers, quest log with tracker, talents / achievements / codex / season pass |
| 7 | Social suite | done | friends, party finder, clan hub, chat window, public profile, leaderboards with own rank |
| 8 | Title, login, loading, settings | done | see below |
| 9 | Audio and motion | done (logic tested, sound not listened to) | see below |
| 10 | Visual QA harness | done | see below |

### Task 8 in detail
Title screen with logo, news panel (server JSON, admin editor field), live server status (players, ping), language switch, faction picker with theme preview, 13+ gate, guest or recovery-code login. Loading screen with progress bar and 61 DE/EN tips; the last step is the "deploy" button (also the browser audio unlock). Zone change: fade plus zone-name banner with level range. Settings: Graphics / Audio / Controls (keybinding remap with conflict + swap) / Interface / Accessibility / Account (recovery code, data export, delete with typed confirmation, sign out) / About (version, protocol, legal links served from `docs/legal`). Recovery code, export and delete existed on the server but had **no button anywhere** before; they are reachable now.

### Task 9 in detail
Bus graph master / music / effects / interface with a mixer in Settings, per-family weapon sounds, hit and explosion layers, distance falloff, UI sounds, level-up / rank-up / quest fanfares, loot chime by rarity, per-biome ambience, generative adaptive music (calm / tension / combat / boss, default volume 30 %). Motion: window fade / sheet slide, count-up on currency chips (DOM text write, no per-frame React state), banner queue, loot reveal for Rare and up, all off under Reduce motion and `prefers-reduced-motion`. Screen shake untouched (stays off). "Rank-up" means season tier.

### Task 10 in detail
`npm run ui-shots`, token contrast test, keyboard walk in layout-check, bundle budget, first-render check, `docs/bildprompts-ui.md` (all slots wired in code, see `docs/UI_KIT.md`).

## Hand test (5 minutes)
1. Open the live URL in a private window. Pick each faction (the colours change), read the news box, tick "13 years", press Play. Loading screen shows a tip and a bar, then "Deploy".
2. In the game press `O`, open Controls, click "Smoke screen", press `Z`, close, press `Z` in the game (smoke fires). Reset keys to default.
3. Press `G I J C M K X Y` one after another (windows stack), use Tab / Shift+Tab inside one, `Esc` closes the top one. On a phone each window is a full-screen sheet.
4. Settings > Audio: drag Music up, drive to an enemy: the music gets busier in a fight and calms down about 8 s later. Pick up a Rare item: chime plus glow.
5. Open `/admin`, load with the token, paste a news item into the "News" box, Save. Reload the title screen in a private window: the item is there.

## Screenshots to look at first
`docs/screenshots/ui/` (jpeg; EN at 844x390 / 667x375 / 1280x720 in coastal, EN highland + steppe at 844x390, DE at 844x390):
1. `en/844x390/coastal_title.jpg` (title, news, faction picker)
2. `en/844x390/coastal_hud.jpg` and `steppe_hud.jpg` (HUD, two themes)
3. `en/844x390/coastal_garage.jpg` (hangar)
4. `en/1280x720/coastal_inventory.jpg` (desktop window) and `en/1280x720/coastal_map.jpg`
5. `en/844x390/coastal_settings_controls.jpg`, `de/844x390/coastal_career.jpg`

## Measured numbers
- Tests: 65 files, 406 tests green. `tsc --noEmit` clean. `npm run build` ok.
- Bundle: entry JS 269.7 KB gzip (limit 330), all JS 275.4 KB, CSS 13.7 KB (limit 24). The main chunk is one 880 KB file (minified); no code splitting except gallery and fixture.
- Frame time (e2e, software-rendered headless Chromium, so a floor not a phone number): avg 16.7 ms, p95 16.8 ms over 177 frames.
- First render: title screen 254 ms, first contentful paint 180 ms (budget 5000 / 3000 ms, headless).
- layout-check: 0 violations on 844x390, 740x360, 667x375 and 1280x720 (hud overlaps, 44 px targets, 11 px text, safe areas, modal fit, window manager, hangar drag and drop, hud fixture, tab walks, keyboard walk of 9 windows, settings tabs, key remap, page errors).
- e2e: ok (drives 380 units, full flow guest -> game).
- Contrast: all token pairs pass in the default and the three faction themes (text 7:1, muted 4.5:1, accents 4.5:1).
- Screenshot run: 134 images, 5.1 MB.

## Bugs found and fixed on the way
- Game key handler swallowed Tab and Space inside windows: keyboard users could not tab through any window (found by the new keyboard walk).
- In-game faction theme was never applied (only gallery and title did); now follows the character.
- Two art-slot hooks sat after early returns (React error 310 on first window open); caught by layout-check, now guarded by a `page-error` rule.
- Recovery code, export and account deletion had no UI.
- A screenshot mask hid the whole screen (canvas is full size); diff mode hides the canvas with CSS instead.

## Risks and things to know
- **Sound is untested by ear.** No audio device here; mixer maths, music state machine and phrase generator are unit tested, the actual sound design (levels, timbre, whether the music is pleasant) needs your ears. Everything is in `src/audio/soundEngine.ts`; music defaults low (30 %) and can be switched off in Settings.
- **Docker image changed**: it now copies `docs/legal` (for `/legal/:doc`). Rebuild needed, `docker compose up -d --build` as usual. News live in `news.json` next to the database file (kept on the `/data` volume).
- German tips and new UI texts are written by me; please read the DE of the 61 tips (`src/ui/title/tips.ts`) once.
- Keybindings are per device (localStorage), not per account. Arrow keys always drive; Esc, Enter, F1, F3 and a few more are reserved.
- The loading bar is cosmetic (stage based), not real asset progress.
- Mail pip is polled every 30 s. The social "war" tab still has the old WarPanel look. The old 4-card tutorial overlay is gone (guided start chip replaced it). How-to is no longer a menu button (key `H` or Settings > Controls). Quests are `J` because `Q` stays smoke.
- Item links in chat are cosmetic: the server does not verify ownership. The auction tax shown is approximate (5 %).
- Level-up now shows both the banner and the old notice line.
- No real art exists: every slot falls back to CSS. A painted frame needs an opaque dark centre (see `docs/bildprompts-ui.md`).
- The committed screenshots are a subset. Full matrix (DE+EN, 3 viewports, 3 themes, about 300 images) is `npm run ui-shots`, roughly 6 minutes.
- `GameShell.tsx` is still the biggest UI file (1145 lines); it was split a lot (hud/, wm/, items/, hangar/, social/, career/, title/, settings/, motion/) but the game loop and sim event handling still live in it.

## Biggest files now
`server/gameServer.ts` 2030, `src/render/worldRenderer.ts` 1220, `src/ui/GameShell.tsx` 1145, `shared/data/maps.ts` 1085, `src/i18n.ts` 932, `shared/sim/world.ts` 910.

## Commands added
`npm run ui-shots`, `npm run budget`, `LAYOUT_DEBUG=1` for layout-check, CI job `ui-shots` (opt-in), bundle budget step in the normal CI job.
