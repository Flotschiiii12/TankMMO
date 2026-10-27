# Treadfront — 2D Top-Down Tactical Vehicle Combat

Treadfront is a playable prototype of a 2D top-down vehicle combat web application with an MMO-style progression loop, built with TypeScript, React, and an HTML5 2D Canvas. It is architected from day one for future authoritative online multiplayer.

---

## 1. Architectural Overview & Separation of Concerns

The codebase maintains strict separation between **Simulation**, **Networking/Snapshot Serialization**, **Rendering**, **Audio Synthesis**, and **UI Shell**:

```
/src
├── sim/                # Pure TypeScript simulation (ZERO browser or DOM dependencies)
│   ├── types.ts        # Vectors, entities, command definitions, events
│   ├── rng.ts          # Deterministic 32-bit Mulberry32 PRNG
│   ├── world.ts        # Fixed 30Hz simulation step, physics, combat rules, AI
│   ├── realm.ts        # MapInstance (capacity) & Realm routing (gates)
│   └── snapshot.ts     # Snapshot serialization & delta application
├── net/                # Multiplayer-ready networking layer
│   ├── protocol.ts     # ClientMessage & ServerMessage union types
│   ├── transport.ts    # Transport interface & WebSocketTransport stub
│   └── client.ts       # GameClient interface, LocalGameClient, RemoteGameClient
├── save/               # Profile persistence
│   └── profile.ts      # ProfileStore interface & LocalStorageProfileStore
├── data/               # Plain data tables (balance, vehicle stats, enemies, maps)
│   ├── vehicles.ts     # 6 vehicle tiers (Patchwork Scout to Aegis Titan)
│   ├── parts.ts        # Cannons, Armors, Engines, and Ammo types
│   ├── enemies.ts      # Buggies, Gunner trucks, Artillery, Convoy, Bosses
│   └── maps.ts         # 4 Biomes (Green Valley, Canyon, Frostline, Ash City)
├── audio/              # Procedural Web Audio API sound engine
│   └── soundEngine.ts  # Cannons, machine guns, impacts, explosions, engine hum
├── render/             # 2D canvas rendering & visual FX
│   ├── assets.ts       # Pluggable sprite registry with silent vector fallback
│   ├── camera.ts       # Smooth lerp camera with decaying screen shake
│   ├── particles.ts    # Pooled particle system (dust, treads, muzzle, sparks)
│   ├── vectorDraw.ts   # Procedural vector drawing for all tiers and enemies
│   └── worldRenderer.ts# Main composite canvas renderer
└── ui/                 # React UI shell (<25% screen occlusion on mobile)
    ├── GameShell.tsx   # Top-level viewport manager & loop coordinator
    ├── TitleScreen.tsx # Game title lockup & Start CTA
    ├── HUD.tsx         # Quiet perimeter HUD (Currencies, ammo, map)
    ├── Radar.tsx       # Circular radar with sector IDs and hostile counters
    ├── ControlsOverlay.tsx # Virtual joystick, big Fire button & ability rings
    ├── ChatLog.tsx     # Simulated driver communications log
    ├── GarageModal.tsx # Safe-zone hangar for purchasing/equipping tiers & parts
    ├── InventoryModal.tsx # Loadout inspection
    ├── SettingsModal.tsx  # Audio volume, debug toggle, progress reset
    ├── TutorialOverlay.tsx# 3-step Combat Field Manual for new pilots
    └── DebugPanel.tsx  # F3 diagnostic metrics (FPS, tick duration, entities)
```

---

## 2. Fixed 30 Hz Timestep & Command Model

### Authoritative Step Cycle
- Time is tracked in discrete ticks: `DT = 1 / 30 = 0.03333s`.
- Randomness is generated solely by `SimRNG` (Mulberry32) using an internal integer state. No calls to `Math.random()` or `Date.now()` exist inside `/src/sim/`, making it portable directly to a headless Node.js game server.
- The UI never mutates entity states directly. All input is converted into typed commands:
  - `Drive { x, y }`
  - `SetTarget { targetId }`
  - `ToggleAutoFire`
  - `FireMain`
  - `UseAbility { abilityId: 'smoke' | 'repair' | 'overdrive' }`
  - `SelectAmmo { ammo: 'standard' | 'ap' | 'he' }`

### Client-Side Prediction & Reconciliation
- The `LocalGameClient` processes the player's `Drive` commands immediately on a predicted local vehicle clone (`predictedPlayer`) so input feels instantaneous.
- When the authoritative snapshot arrives, the client reconciles predicted position against authoritative position with a soft lerp (or instant correction if the error exceeds 30 units).
- Other entities (allies, hostiles, projectiles) are rendered smoothly using interpolated snapshot coordinates.

---

## 3. How to Tune Balance Numbers

All gameplay tuning parameters are centralized in `/src/data/`:

1. **Vehicles (`/src/data/vehicles.ts`)**:
   - `baseHull` & `baseArmor`: Survivability of each tier.
   - `maxSpeed`: Linear driving speed (units/second).
   - `turnRate`: Chassis turn rate in radians/second (tank steering limit).
   - `turretTurnRate`: Independent gun traversal speed.
   - `reloadTime`: Seconds between main cannon shots.
   - `costScrap` & `costParts`: Upgrade economy barriers.

2. **Parts & Ammunition (`/src/data/parts.ts`)**:
   - `dpsBonus`, `hullBonus`, `armorBonus`, `speedBonus` for installed hardware.
   - `armorPiercingRatio`: Proportion of armor deflection ignored (e.g., 0.35 ignores 35% of armor absorption).
   - `splashRadius`: Radius of High-Explosive (HE) area damage.

3. **Combat Rules & Angle of Impact (`/src/sim/world.ts`)**:
   - **Frontal Hits** ($|\Delta\theta| \le 45^\circ$): Deflected at `0.7x` damage.
   - **Flank / Side Hits** ($45^\circ < |\Delta\theta| < 135^\circ$): Normal `1.0x` damage.
   - **Rear Hits** ($|\Delta\theta| \ge 135^\circ$): Penetrating strike at `1.4x` critical damage.
   - **Armor Absorption**: Absorbs 65% of incoming damage before spilling into hull.
   - **Out-of-Combat Recovery**: Armor regenerates at `+8% / sec` after 8 seconds without taking damage.
   - **Safe Zone**: Within radius 400 of Green Valley outpost, weapons are deactivated and vehicles repair at `+25% / sec`.

---

## 4. Pluggable Art Pipeline & Silent Console

The asset pipeline uses `/public/assets/manifest.json` to inventory all available raster sprites:
- Only files explicitly declared in the manifest are fetched. If an asset is missing or the manifest is empty (`"sprites": []`), the engine never issues speculative network requests, guaranteeing **zero 404 console errors**.
- At startup, the asset loader logs exactly one clean telemetry line:
  `[Treadfront Assets] 0 of 0 sprites found in manifest. Using procedural vector rendering.`
- Dropping real sprite images into `/public/assets/` and listing their paths in `manifest.json` immediately swaps procedural rendering for raster sprites:

```json
{
  "sprites": [
    "/assets/vehicles/t1_starter_body.png",
    "/assets/vehicles/t1_starter_turret.png"
  ]
}
```

### Supported Asset IDs:
- **Vehicle Chassis**: `/assets/vehicles/<tier>_<id>_body.png` (Facing right $\rightarrow$, transparent PNG).
- **Vehicle Turret**: `/assets/vehicles/<tier>_<id>_turret.png` (Facing right $\rightarrow$, pivot point at center).
- **Enemies**: `/assets/enemies/<id>.png` (e.g. `scout_buggy.png`, `boss_siege_crawler.png`).
- **Props**: `/assets/props/<id>.png` (e.g. `tree.png`, `rock.png`, `ruin.png`).
- **Landmarks**: `/assets/landmarks/<map>.png` (e.g. `green_valley.png`, `canyon_flats.png`).
- **Ground Tile**: `/assets/ground/<map>.png` (Seamless tileable 512x512 texture).
- **VFX**: `/assets/fx/muzzle.png`, `/assets/fx/explosion.png`, `/assets/fx/smoke.png`.

---

## 5. Rapid QA Testing (`?debug=1`)

Appending `?debug=1` to the URL triggers instant QA testing mode:
- Grants **+5,000 Scrap** and **+2,500 Tech Parts**.
- Elevates player pilot level to Level 15 (unlocks high-tier vehicles and parts in the Garage immediately).
- Spawns several close-range test target vehicles (Scout Buggies, Medium Tanks, Heavy Tanks) 150-250 units from the spawn outpost for immediate combat verification.
- Can be activated at any time or toggled via the `F3` key / Settings menu.

---

## 6. Controls & Camera

- **Mobile (Landscape Preferred)**:
  - **Left Thumb**: Virtual joystick (push to turn and drive chassis).
  - **Right Thumb**: Big Target/Auto-Fire button (reload ring indicator), surrounded by Smoke, Repair, Overdrive, Target Cycle, and Ammo Cycle (all touch targets $\ge 44\times 44$px).
  - **Pinch-to-Zoom**: Two-finger pinch gesture smoothly scales camera view between 0.5x and 1.2x.
  - **Direct Tap**: Tap any enemy directly on the playfield to acquire lock.
- **Desktop Keyboard & Mouse**:
  - `W / A / S / D` or `Arrow Keys`: Tank driving & steering.
  - `Mouse Wheel`: Zoom camera in/out (0.5x to 1.2x).
  - `Left Click`: Lock clicked enemy target.
  - `Space`: Toggle Auto-Fire.
  - `Q`: Deploy Smoke Screen.
  - `E`: Trigger Field Repair Kit.
  - `F`: Activate Overdrive Booster.
  - `1 / 2 / 3`: Switch Ammo (Standard / AP / HE).
  - `Tab`: Cycle nearest targets.
  - `F3`: Toggle Diagnostic Telemetry Overlay (FPS, Tick Time, Entity Counts).

