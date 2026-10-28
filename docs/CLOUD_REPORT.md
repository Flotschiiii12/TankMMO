# Cloud report (branch `claude/cloud-batch`, based on `claude/unify-client`)

Final state: `npm test` 145 tests green (was 133), `npm run lint` clean, `npm run build` ok. Nothing was pushed to `main`, nothing deployed.

Baseline note: `npm install` fails with an ERESOLVE peer conflict (vite 8 vs esbuild 0.25). The Dockerfile already uses `--legacy-peer-deps`; I did the same (`npm install --legacy-peer-deps --ignore-scripts`). Not changed in the repo.

| # | Task | Status |
|---|------|--------|
| 1 | Clan emblems | **done** |
| 2 | Painted icons in the UI | **done** (auction/trade/vendor/shop lines still text only, see below) |
| 3 | Security / anti-cheat review | **done**, 2 critical bugs fixed, see `docs/SECURITY_REVIEW.md` |
| 4 | German translation | **done** for `src/ui/**`, errors, notices; data names not translated |
| 5 | Capacitor wrapper | **done** (prepared); store builds stay manual |

## 1. Clan emblems
- What: whitelist `shared/data/emblems.ts`; nullable `clans.emblem` (added automatically to old databases by `openDatabase`, no data loss); `clan_create` takes an optional `emblem`; new op `clan_emblem` (leader/officer only, whitelist-checked); emblem in clan info, invites, clan ranking, profile card and chat messages; UI picker and badge in the clan tab, small badge next to tags in chat, ranking and invites; no emblem = nothing shown.
- Test by hand: (1) Clan tab > pick an emblem > Create (needs 10,000 scrap). (2) The badge shows left of the clan name. (3) Press "Emblem", choose another one: it changes at once, also in chat next to `[TAG]`. (4) Log in as a plain member: no Emblem button; sending `clan_emblem` directly gives `no_permission`. (5) Start the server on an old DB copy: the column is added, old clans show no badge.
- Risks: protocol is backwards compatible (optional fields), no `PROTOCOL_VERSION` bump. The emblem is not drawn on the name plate in the world (entity snapshots untouched on purpose).
- Biggest files: `server/social.ts`, `src/ui/SocialModal.tsx`, `test/social.test.ts`.

## 2. Icons
- Done: rarity gems (workshop list + detail), slot icons (loadout slots and filters), weapon family icons (workshop list), currency/ore icons (workshop header, garage strip, HUD, career tab), status icons slowed/burning/stunned/marked above vehicles drawn on the canvas (plain `drawImage`, no shadowBlur; the four files were added to `public/assets/manifest.json`). Text stays as tooltip/`aria-label`; a missing file hides the icon.
- Not done: auction/trade/vendor/shop lines, `honor`/`token_*`/`gate_key`/`cells` in wallet lines beyond the career tab (helpers exist: `CurrencyIcon`, `RarityGem`, `SlotIcon`, `FamilyIcon` in `src/ui/GameIcon.tsx`).
- Test by hand: open Inventory (I): gems and slot icons visible; HUD scrap/frag with icons; get slowed/burned by an enemy and look for the pictogram above the vehicle.
- Risks: status icons are only drawn for entities that carry `statusEffects` in the snapshot.
- Files: `src/ui/GameIcon.tsx`, `src/ui/InventoryModal.tsx`, `src/render/worldRenderer.ts`.

## 3. Security review (details and file:line in `docs/SECURITY_REVIEW.md`)
- Critical, fixed: a single unauthenticated frame like `null` crashed the whole game server; `buy_ammo` with a non-numeric pack count made the wallet `NaN` (free everything).
- High, fixed: season tier coercion, admin page stored XSS via report text. Medium/low, fixed: no inbound message budget (now 120/s, burst 240), limiter memory growth, `NaN` ban durations, JSON error handling, fractional affix index.
- Opt-in: `TRUST_PROXY=1` (otherwise all players behind Caddy share one REST rate limit; see `docs/DEPLOY.md`). Please set it on the VPS.
- Design-level, not changed: abilities are not gated by loadout, trades have no distance rule, no per-IP throttling of failed joins, tick loop has no try/catch.
- Test by hand: the new tests (`test/security.test.ts`) fail on the old code (checked). Manually: `npx wscat -c ws://127.0.0.1:3000/ws` and send `null` - the server must stay up.
- Risks: the message budget could throttle a very unusual client; the client sends about 20 input packets per second, so the limit has a large margin.
- Files: `server/gameServer.ts`, `server/app.ts`, `shared/rules/quests.ts`, `test/security.test.ts`.

## 4. German translation
- `tr(key, {vars})` now supports `{name}` placeholders; `T('...')` marks literals in tables; `<Rich text="... *bold* ...">` keeps highlighted words inside translated sentences. All literals in `src/ui/**` (title, tutorial, world map, settings, social, garage, workshop, quests, HUD, notices and banners in `GameShell`, error-code table in `src/game/actions.ts`) go through `tr()`; about 330 new German entries in `src/i18n.ts`.
- `test/i18n.test.ts` scans `src/` for `tr('...')`, `T('...')` and `<Rich text=...>` and fails on any key without a German entry (and checks placeholder consistency).
- Not translated: data-driven names (item names, quest names, map names/descriptions, vehicle names in `shared/data`), the developer debug panel, server-sent chat lines (event announcements) and keys built dynamically with template strings (the test cannot see those; they were routed through `tr()` with `{vars}` where it mattered).
- Test by hand: Settings > Language > Deutsch; click through title, garage, inventory, quests, social tabs, world map; look for English leftovers (expected: item/quest/map names).
- Risks: German texts were written without a native review pass; please skim them.
- Files: `src/i18n.ts`, `src/ui/*.tsx`, `src/game/actions.ts`, `test/i18n.test.ts`.

## 5. Capacitor
- Prepared: dev dependencies (`@capacitor/core|cli|ios|android|status-bar|splash-screen`, in `devDependencies` so the production image is unchanged), `capacitor.config.ts`, scripts `mobile:sync`, `mobile:add:ios|android`, `mobile:open:*`, `scripts/mobile-patch.mjs` (landscape lock, hidden status bar; verified by running `cap add android/ios` in a scratch copy), `viewport-fit=cover` + safe-area CSS variables, `docs/MOBILE.md` with the exact manual steps (Android Studio, Play Console internal testing, Xcode, TestFlight).
- Manual: creating/committing `android/` and `ios/`, signing keys, store listings, icons/splash art, final app id decision (`online.treadfront.app` is a placeholder), real device tests.
- Risks: `package-lock.json` changed a lot (Capacitor tree + lock normalisation with `--legacy-peer-deps`). The Docker build uses `npm install`, not `npm ci`, so it is unaffected.
- Files: `capacitor.config.ts`, `docs/MOBILE.md`, `scripts/mobile-patch.mjs`, `package.json`.

## Files with the biggest changes
`src/i18n.ts`, `test/security.test.ts`, `src/game/actions.ts`, `src/ui/SocialModal.tsx`, `src/ui/InventoryModal.tsx`, `server/gameServer.ts`, `test/i18n.test.ts`, `test/social.test.ts`, `docs/MOBILE.md`, `docs/SECURITY_REVIEW.md`, `package-lock.json`.
