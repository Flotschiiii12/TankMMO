# Mobile apps (Capacitor)

The game is online-only: the app is a thin native shell around the same web build (`dist/`) that talks to the live server. Everything below was prepared in the repo; the parts that need Xcode, Android Studio, store accounts or signing keys stay manual (marked **manual**).

## What is in the repo
- `capacitor.config.ts` – app id `online.treadfront.app`, name, dark background, status bar / splash settings. Change the app id **before** the first store upload (it cannot be changed afterwards).
- `npm run mobile:sync` – `vite build` + `cap sync` (copies `dist/` into the native projects and updates plugins).
- `npm run mobile:add:ios` / `mobile:add:android` – creates the native project and runs `scripts/mobile-patch.mjs`, which locks the app to **landscape** (Android `sensorLandscape`, iOS landscape-only for iPhone and iPad) and hides the status bar. Safe to run again.
- `index.html` has `viewport-fit=cover`, and the HUD / touch controls already use `env(safe-area-inset-*)`, so notches and rounded corners are respected.
- `VITE_SERVER_URL` (read in `src/net/connect.ts`) is the server address baked into the build. A native page is served from `capacitor://localhost` / `https://localhost`, so without it the app could not find the server.

## One-time setup (**manual**, on your Mac / PC)
```bash
git pull && git checkout claude/cloud-batch
npm install --legacy-peer-deps
export VITE_SERVER_URL=https://treadfront.213-199-44-82.sslip.io
npm run mobile:add:android      # needs nothing but Node
npm run mobile:add:ios          # macOS only for the next steps (needs Xcode + CocoaPods: brew install cocoapods)
```
This creates `android/` and `ios/`. Commit them (they are normal source for Capacitor projects) or keep them local, as you prefer.

After every game change:
```bash
VITE_SERVER_URL=https://treadfront.213-199-44-82.sslip.io npm run mobile:sync
```

## Server settings that matter
- Use `https://` and `wss://` (the reverse proxy from `docs/DEPLOY.md`). Plain `http` is blocked by iOS App Transport Security and by Android 9+.
- Set `TRUST_PROXY=1` on the server (see `docs/DEPLOY.md`), otherwise all phones share one REST rate limit.
- The server checks `PROTOCOL_VERSION` on join and answers `update_required`; the app shows "A new version of the game is available". Bump it when you release an incompatible client.

## Android: test and Play Console (**manual**)
1. `npm run mobile:open:android` opens Android Studio. Let Gradle sync, pick a device or emulator, press Run. Check: landscape only, game loads, you can log in as guest.
2. Release build: Build > Generate Signed Bundle / APK > Android App Bundle. Create a keystore once (keep it and its passwords safe and backed up; losing it means you cannot update the app). Optionally enrol in Play App Signing.
3. Play Console: create the app (default language, "Game", free). Fill in: Data safety (account id and chat messages are stored on the server; no ads, no purchases while `premiumCurrencyEnabled` is false), content rating questionnaire (online interaction: chat), target audience (13+; the game already asks for age confirmation), privacy policy URL, store listing (screenshots in landscape, 512x512 icon, 1024x500 feature graphic).
4. Testing > Internal testing: upload the `.aab`, add testers by e-mail, roll out, install via the opt-in link. New personal developer accounts must run a closed test with 12+ testers for 14 days before production access.
5. Production > create release > review > roll out.

## iOS: test and TestFlight (**manual**, needs an Apple Developer account, 99 USD/year)
1. `npm run mobile:open:ios` opens Xcode (`ios/App/App.xcworkspace`). Select the `App` target > Signing & Capabilities: tick "Automatically manage signing", choose your Team, set the Bundle Identifier (must equal `appId`).
2. Run on a real device (Xcode > Product > Run) and check landscape, safe areas, login.
3. App Store Connect: My Apps > "+" > New App, same bundle id. Fill in privacy ("Data Collected": identifiers, user content/chat), age rating (online chat), privacy policy URL, screenshots (iPhone 6.7" and 6.5" landscape, iPad if you keep iPad support).
4. In Xcode choose "Any iOS Device (arm64)" > Product > Archive > Distribute App > App Store Connect > Upload.
5. In App Store Connect > TestFlight, wait for processing (~15 min), answer the export-compliance question (the app only uses standard HTTPS: "uses encryption" = yes, exempt), add internal testers (up to 100, no review) or external testers (needs a short beta review), install via the TestFlight app.
6. For release: App Store > add the build to the version > Submit for Review. Apple may ask for a demo account; the game needs none (guest login), say so in the review notes.

## Known limits
- Not built or run in the cloud session: no Android SDK, no Xcode. Only `npm run build` and `cap add` plus the patch script were verified there.
- App icons and splash images are the Capacitor defaults. Add yours with `npx @capacitor/assets generate` (needs a 1024x1024 `assets/icon.png` and a 2732x2732 `assets/splash.png`) - **manual**, art is not generated in this repo.
- Push notifications, in-app purchases and store receipts are not wired (`FLAGS.premiumCurrencyEnabled` is off).
- Audio on iOS starts only after a first tap (the title screen's button does that).

## Graphics quality and performance measurements
The graphics setting has four levels: **High**, **Medium**, **Low**, and **Off**. On a first run, the client samples 45 valid frames and selects a starting level from the average and p95 frame time. If the smoothed frame time remains above 22 ms for 5 seconds, the runtime monitor can lower an automatically selected level once. A manual selection is respected. The F3 debug overlay includes the FPS counter.

Measurements on 2026-10-29, using software-rendered headless Chromium (not a phone):

| Setting | E2E average | E2E p95 | Frames | Bundle budget |
|---|---:|---:|---:|---|
| High | 44.0 ms | 100.0 ms | 70 | Pass |
| Low | 76.5 ms | 250.0 ms | 49 | Pass |

These short E2E samples are noisy; Low was slower in this run, so they do not demonstrate a performance improvement or represent mobile hardware. `npm run budget` passed for both settings with identical static bundles: 277.7 KB gzipped entry JS, 283.4 KB total JS, and 14.7 KB CSS (limits: 330 KB, 360 KB, and 24 KB). The build size is independent of the runtime graphics setting. DE/EN settings screenshots were checked at 844x390, and `npm run layout-check` reported no violations.

## Layout check (cloud run 3)
`npm run layout-check` (needs `dist/`, builds it first) opens the real UI in Playwright mobile emulation at 844x390, 740x360, 667x375 (with notch / home-bar insets) and 1280x720 and fails with a list of violations: HUD blocks overlapping the joystick or fire buttons or each other, touch targets under 44x44 px, text under 11 px, elements inside the safe-area insets, windows that do not fit or cannot scroll, Escape not closing a window, horizontal page scroll, zoom slider / pinch zoom not saving, left-handed swap and graphics-quality DPR caps. `--screens docs/screenshots` saves a picture of every screen, `--report-only` never fails. In CI it is the opt-in `layout` job (tick it on a manual run or label a PR `layout`).
Settings: *Left-handed controls* swaps joystick and fire cluster (and mirrors the top bar); *Graphics* offers High / Medium / Low / Off, with a one-time startup probe for new profiles and a runtime downgrade if performance remains low.
