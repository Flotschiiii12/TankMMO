# Ready-to-paste tasks for cloud sessions

Start a session at https://claude.ai/code, pick repo `Flotschiiii12/TankMMO`, branch `claude/unify-client`, and paste ONE task per session.
Each task is independent (separate branch, small overlap), so they can run in parallel. The session reads `CLAUDE.md` by itself.
Afterwards: review the branch on GitHub, pull it on the server (`git pull`), test, and merge/deploy yourself.

Common tail used in every task: "Keep `npm test` and `npm run lint` green and `npm run build` working. Add one dated line to docs/PROGRESS.md. Commit to a new claude/ branch with the commit trailers from your session instructions. Do not push to main and do not copy code from other games."

---

## 1. Clan emblems

Read CLAUDE.md first and follow it. Task: clan emblems. The 40 emblem sprites already exist as `public/assets/badges/emblem_<id>.png` (ids: eagle wolf bear_paw lion bull fox boar owl raven snake cannons tank anvil gear tools bolt anchor star crown flame mountain wave sun moon lightning tree wheat windmill lighthouse bridge tower shield_sword compass key diamond wing horse stag bee clover). Clans have no emblem yet. Implement: (1) a whitelist of emblem ids in `shared/data` (single source of truth for server and client); (2) an optional emblem column on clans in the SQLite schema, backwards compatible with existing databases (add the column if missing, no data loss); (3) choosing an emblem at clan creation and a leader/officer-only way to change it later (new social op, validated server-side against the whitelist, rejected for unknown ids and for non-leaders); (4) include the emblem in clan info / profile responses and protocol types; (5) show it in the clan UI (`SocialModal`) and as a small badge next to the clan tag where tags are shown, falling back gracefully when no emblem is set; (6) tests in the style of the existing social/server tests: create with emblem, invalid id, permission check, change, old clans without emblem.

## 2. Wire the painted icons into the UI

Read CLAUDE.md first and follow it. Task: use the painted pictograms that already exist in `public/assets/icons/` (helper: `src/ui/GameIcon.tsx`) in the places that still use text or placeholders. (1) Item rarity: show `rarity_common|uncommon|rare|epic|legendary` gems in the inventory, workshop and garage item lists/details. (2) Wallet bars and shop/auction/trade/vendor lines: `scrap`, `ore_iron|copper|titanium|crystal`, `honor`, `marks_faction`, `token_event`, `token_season`, `gate_key`, `fragments`, `cells` instead of words. (3) Status icons `st_slowed|burning|stunned|marked` above enemy/player name plates in `src/render/worldRenderer.ts` (draw once per frame per entity, cheap, no shadowBlur). (4) Weapon family icons `fam_*` and slot icons `slot_*` in the loadout screen. Provide `title`/`aria-label` where text was removed, keep the German/English text available as tooltip. Do not add new image files; if an icon is missing, fall back to the old text.

## 3. German translation of the remaining UI strings

Read CLAUDE.md first and follow it. Task: finish DE/EN localisation. Many UI strings in `src/ui/**` are still English literals; the i18n helper is `tr()` in `src/i18n.ts` and the tables are in `shared/data/i18n.ts` / `src/i18n.ts`. Find every user-visible literal (buttons, titles, notices, error messages from the server `code`s, tutorial texts, quest/gate/event notices), route it through `tr()`, and add natural German translations (informal "du", short, game tone; keep game terms consistent with the existing German entries). Add a test that fails when a key used by `tr('...')` has no German entry. Do not change game logic.

## 4. Security and anti-cheat review of the server

Read CLAUDE.md first and follow it. Task: review `server/` and `shared/rules` for exploitable behaviour and fix what you find, with tests. Focus: (1) every client action/command is validated server-side (ranges, ownership, safe-zone rules, cooldowns, inventory counts, negative/NaN/huge numbers, prototype keys in JSON); (2) the auction/trade/market paths against duplication, race conditions and integer overflow; (3) REST endpoints and `/admin` (auth, rate limits, input validation, SQL parameterisation); (4) WebSocket message size/rate limits; (5) fire/range/line-of-fire plausibility checks for player shots so a modified client cannot hit targets from across the map. Report findings in `docs/SECURITY_REVIEW.md` (severity, location, fix), fix the real issues, and add regression tests. Do not weaken existing limits.

## 5. (Optional) Capacitor mobile builds

Read CLAUDE.md first and follow it. Task: prepare Capacitor wrappers for iOS and Android as described in `docs/DEPLOY.md` (`VITE_SERVER_URL` is supported by the client). Add the Capacitor dependencies and config, an `npm run mobile:sync` script, safe-area/landscape lock handling, an app icon/splash placeholder from existing sprites, and a `docs/MOBILE.md` with the exact build and TestFlight/Play Console steps. It cannot be built in the cloud, so verify with `npm run build` and `npx cap sync` where possible and say what remains manual.
