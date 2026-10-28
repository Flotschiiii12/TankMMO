# Cloud master job (triggered by the user typing just "start")

You are running unattended in a cloud session. The owner will not answer questions while you work: make sensible decisions yourself, write them down, and keep going. Read `CLAUDE.md` first (rules and invariants), then execute this file completely.

## Setup
1. You are on branch `claude/unify-client`. Create one working branch from it: `claude/cloud-batch`. All work below goes there, as separate commits per task. Push after every finished task so partial results are never lost.
2. Run `npm install`, then `npm test`, `npm run lint`, `npm run build` once to confirm the baseline is green (about 133 tests). If the baseline is red, fix only what is needed for green and note it.

## Rules for every task
- Finish with `npm test`, `npm run lint` and `npm run build` all green before committing. If a task cannot be made green after two honest attempts, `git revert` / drop its changes, record why in the report, and continue with the next task. Never leave the branch red.
- One commit (or a few) per task, message in English, with the commit trailers from your session instructions. One dated line per task in `docs/PROGRESS.md`.
- Never push to `main`. Never copy code, art or names from other games. Do not add image files; use the sprites that already exist in `public/assets`. Do not weaken any existing validation or limit. Do not touch `public/assets/manifest.json` unless you add a listed file.
- Keep game logic deterministic and server-authoritative (see CLAUDE.md invariants).

## Tasks, in this order

### 1. Clan emblems
The 40 emblem sprites exist as `public/assets/badges/emblem_<id>.png` (ids: eagle wolf bear_paw lion bull fox boar owl raven snake cannons tank anvil gear tools bolt anchor star crown flame mountain wave sun moon lightning tree wheat windmill lighthouse bridge tower shield_sword compass key diamond wing horse stag bee clover). Clans have no emblem yet. Implement: (1) a whitelist of emblem ids in `shared/data` (single source of truth for server and client); (2) an optional emblem column on clans in the SQLite schema, backwards compatible with existing databases (add the column if it is missing, no data loss); (3) choosing an emblem at clan creation and a leader/officer-only way to change it later (new social op, validated server-side against the whitelist; reject unknown ids and non-leaders); (4) include the emblem in clan info / profile responses and protocol types; (5) show it in the clan UI (`src/ui/SocialModal.tsx`) and as a small badge next to the clan tag where tags are shown, with a graceful fallback when none is set; (6) tests in the style of the existing social/server tests: create with emblem, invalid id, permission check, change, old clans without emblem.

### 2. Wire the painted icons into the UI
Icons exist in `public/assets/icons/` (helper `src/ui/GameIcon.tsx`). Use them where text or placeholders are still shown: (1) item rarity gems `rarity_common|uncommon|rare|epic|legendary` in the inventory, workshop and garage lists/details; (2) wallet bars and shop/auction/trade/vendor lines: `scrap`, `ore_iron|copper|titanium|crystal`, `honor`, `marks_faction`, `token_event`, `token_season`, `gate_key`, `fragments`, `cells`; (3) status icons `st_slowed|burning|stunned|marked` above name plates in `src/render/worldRenderer.ts` (cheap, once per entity per frame, no shadowBlur); (4) weapon family `fam_*` and slot `slot_*` icons in the loadout screen. Keep the text as tooltip / `aria-label`. If an icon is missing, fall back to the old text.

### 3. Security and anti-cheat review of the server
Review `server/` and `shared/rules` for exploitable behaviour, fix real issues, add regression tests. Focus: (1) every client action/command validated server-side (ranges, ownership, safe-zone rules, cooldowns, inventory counts, negative/NaN/huge numbers, `__proto__`-style JSON keys); (2) auction/trade/market paths against duplication, races and overflow; (3) REST endpoints and `/admin` (auth, rate limits, input validation, SQL parameterisation); (4) WebSocket message size and rate limits; (5) plausibility checks for player shots/range so a modified client cannot hit targets from across the map. Write `docs/SECURITY_REVIEW.md` (severity, file:line, fix status). Fix what is clearly a bug; list design-level issues without changing behaviour.

### 4. German translation of the remaining UI strings
Many strings in `src/ui/**` are still English literals; the helper is `tr()` in `src/i18n.ts` (tables also in `shared/data/i18n.ts`). Route every user-visible literal (buttons, titles, notices, server error codes, tutorial and quest/gate/event notices) through `tr()` and add natural German ("du", short, game tone, consistent with existing German entries). Add a test that fails when a key used by `tr('...')` has no German entry. Do not change game logic.

### 5. Capacitor mobile wrapper (only if everything above is done and green)
Prepare Capacitor for iOS/Android as described in `docs/DEPLOY.md` (`VITE_SERVER_URL` is supported): dependencies and config, an `npm run mobile:sync` script, safe-area and landscape lock, and `docs/MOBILE.md` with the exact manual build and TestFlight/Play Console steps. It cannot be built in the cloud: verify `npm run build` and say what stays manual.

## Finish
Write `docs/CLOUD_REPORT.md`: per task done / partly done / skipped, why, how to test it by hand (3-5 steps each), risks, and the list of files with the biggest changes. Commit and push it. Then stop and give the owner a short summary in German (what is on branch `claude/cloud-batch`, what to check first, what was skipped).
