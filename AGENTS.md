# Treadfront (repo TankMMO) — briefing for any AI coding agent

Read this first, then `CLAUDE.md` (invariants, hard rules, known gaps; it applies to every agent, not just Claude), `docs/PROGRESS.md` (dated updates + known gaps), `docs/GDD.md` (design), `docs/BALANCE.md`, `docs/PROTOCOL.md`.

Owner: Florian (speaks German; code, commits and docs are English, UI strings DE/EN). Answer him in German.

## What this is
Online 2D top-down tank MMO. Landscape, mobile first, browser too. Server-authoritative, TypeScript everywhere. Live: https://treadfront.213-199-44-82.sslip.io (Docker + Caddy on the owner's VPS).

## Where things are
- Work in `/root/treadfront-dev/TankMMO` on branch `claude/unify-client`. **Never edit `/root/treadfront-live`** (that is the running production copy, updated only by `git pull`).
- Never push to `main`. Only push to `claude/*` branches. On the VPS use the deploy key: `GIT_SSH_COMMAND="ssh -i ~/.ssh/treadfront_deploy -o IdentitiesOnly=yes" git push origin claude/unify-client`.
- **Deploying is done by the owner by hand**: `cd /root/treadfront-live && git pull -q --ff-only /root/treadfront-dev/TankMMO claude/unify-client && docker compose up -d --build`. Do not run it. Before deploys that touch the DB the live SQLite DB must be backed up (`VACUUM INTO` to `/root/treadfront-live/data/manual-backups/`).
- Art sheets and the scripts that cut them live on the server in `/root/treadfront-assets/`, not in Git. Only wire up sprites that already exist in `public/assets` (and list them in `public/assets/manifest.json`).

## Commands
```
npm install --legacy-peer-deps     # --legacy-peer-deps is required
npm test            # vitest, ~400 tests, must stay green (slow under load; map/property tests need long timeouts)
npm run lint        # tsc --noEmit, must stay clean
npm run build       # vite production build
npm run dev         # client dev server; npm run server = game server
```
Never `pkill -f server/index.ts` (would kill the live server). Kill test servers by port (`ss -ltnp`).

## Current state (2026-10-28)
Branch `claude/unify-client` @ 4f8d55b = live. 406 tests, protocol 1.2.0, DB schema v6. Cloud rounds 1-4 merged (emblems/icons/security, CI/fuzz/balance/migrations, drones/guided shots/events/story/war UI, UI kit + audio + all menus).

## Design rules decided by the owner (do not change without asking)
- **Shots at a target always hit.** Permanent, no flag, no setting (PvE, PvP, arena). Implemented as guided shells with auto target lock.
- Normal enemies die in 5-15 s, elites 30-60 s, bosses 3-8 min in a group, PvP 20-40 s. Leveling: Lv30 ~20 h, Lv60 ~124 h, Lv100 ~500 h.
- Premium currency ("Cells") exists but stays off (`FLAGS.premiumCurrencyEnabled = false`). Later it is meant to be very grindy to earn without paying or via events. No loot boxes with real money. Best gear must stay earnable for free. Arena uses everyone's own vehicles (leagues by combat power).
- 3 factions (Küstenbund, Hochlandunion, Steppenkarawane): look, start maps and faction war only, no stat differences. 30 maps, 5 vehicle classes x 10 tiers.
- Starter-map scouts are peaceful until hurt; nobody hunts players in safe zones; the player's machine gun only fires with auto-fire or a locked target.
- **No code, art, names or texts from other games** (Red Galaxy, DarkOrbit, Seafight, Bigpoint/Gameforge). Everything original.

## Open work
1. UI art: owner generates sheets from `docs/bildprompts-ui.md`; they must then be cut and wired into the art slots (`public/assets/ui/*.png`, `manifest.json`). Needs the server-side scripts, ask the owner/Claude Code on the VPS.
2. Vehicle tiers 7-10 and tier-6 heavy/artillery turrets are still vector (prompts in `docs/bildprompts-nachbesserung.md`).
3. Owner still has to check live: drones visible, sound/music, phone landscape layout, German texts (`src/ui/title/tips.ts`).
4. NPC quest givers do not stand in hubs; legal drafts in `docs/legal` need a lawyer; clan emblem is not drawn on world name plates; drone strength is hand-tuned (not in the balance harness).
5. Ideas: content/economy round, Capacitor store builds (manual), closed beta.

## Working rules
- Small focused commits; add a dated line to `docs/PROGRESS.md` for notable changes. Add tests for new behaviour.
- Keep `shared/sim` deterministic (no `Math.random`, `Date`, DOM). Anything in `shared/` changes client and server.
- Don't use two agents on the same files at the same time; commit between tasks.
- Commit trailers: use whatever your own session instructions require.
