# Testing

| What | Command | Notes |
|------|---------|-------|
| Unit + server integration | `npm test` | vitest, real sockets, in-memory DB |
| Types | `npm run lint` | `tsc --noEmit` |
| Production build | `npm run build` | |
| End-to-end smoke | `npm run e2e` | opt-in, ~20 s, see below |
| Long fuzz run | `npm run fuzz -- --seconds 120` | see `scripts/fuzz.ts` |
| Load test | `npm run bots -- --count 200 --seconds 25` | server needs `LOAD_TEST=1` |

Install with `npm install --legacy-peer-deps --ignore-scripts` (vite 8 / esbuild peer conflict; same flags as the Dockerfile).

## CI
`.github/workflows/ci.yml` runs lint, tests and build on every push to `main` / `claude/**` and on pull requests (Node 24, npm cache).
The `e2e` job is opt-in: start the workflow manually with "Also run the Playwright smoke test" ticked, or label a PR `e2e`.

## End-to-end smoke test (`scripts/e2e.ts`)
Starts `server/index.ts` on a free port with a temp DB and `LOAD_TEST=1`, serves the built `dist/`, opens headless Chromium, passes the age gate, creates a guest, deploys, toggles the F3 panel to read the position, drives with D+S, toggles auto-fire (Space), opens the inventory (I), and fails on any page error / console error or if the player did not move at least 20 units. The temp DB is removed afterwards.

- Locally: `npx playwright install chromium` once, then `npm run e2e`.
- If the Playwright version does not match an already installed browser, point it at a Chrome binary: `E2E_CHROMIUM=/path/to/chrome npx tsx scripts/e2e.ts` (run `npm run build` first).

## Manual audio listening check

Use headphones or a phone speaker at a comfortable volume. Audio must remain silent on page load; press **Play** (or a sound test button) before expecting playback.

1. In Settings → Audio, set Master to about 70%, Effects to 80%, Music to 25%, and Interface to 50%. Use **Weapon**, **Interface**, and **Fanfare** to compare relative levels; set Effects or Music to 0% to confirm each bus mutes independently.
2. In a safe zone, listen to the idle motor, then drive slowly and at full speed. Compare a Scout with a Heavy or Artillery vehicle; heavier classes should sound lower.
3. Keep Ambience on and visit a coastal, highland, steppe, and marsh/canyon map. The filtered wind, surf, or rumble should change with the biome; an arena should be quiet.
4. Turn Music on, spend a few seconds in a safe area, then approach enemies and enter combat. Listen for a gradual shift from calm to tension/combat, with the combat layer lingering briefly after the fight. A nearby boss should use the strongest state.
5. Reload the page and verify silence returns until the next user gesture. Turn off Ambience and Music separately to confirm the toggles persist.
