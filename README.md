# Treadfront — 2D Top-Down Tactical Vehicle Combat

Treadfront is a playable prototype of a 2D top-down vehicle combat web application with an MMO-style progression loop, built with TypeScript, React, and an HTML5 2D Canvas. It is architected from day one for future authoritative online multiplayer.

---

## 1. Architectural Overview & Separation of Concerns

The codebase maintains strict separation between **Simulation**, **Networking/Snapshot Serialization**, **Rendering**, **Audio Synthesis**, and **UI Shell**:

```
/shared                 # Pure TypeScript simulation, combat rules, data tables, protocol
├── types.ts            # Math vectors, entity definitions, commands, events
├── flags.ts            # Feature flags (premiumCurrencyEnabled, pvpEnabled, auctionEnabled)
├── prng.ts             # Deterministic sfc32 seeded PRNG
├── rules/              # Pure game mechanics and combat formulas
│   ├── combat.ts       # 80/20 armor split, impact angles (0.7x/1.0x/1.4x), flat reduction, crits
│   ├── ammo.ts         # Ammo multipliers, armor-piercing bypass, splash, empty fallback
│   ├── status.ts       # Status durations, Burning DoT, EMP stun diminishing returns
│   ├── collision.ts    # Obstacle collisions, soft-push separation, terrain slow zones
│   └── power.ts        # Vehicle combat power rating calculation
├── sim/                # Deterministic 30 Hz simulation engine
│   └── world.ts        # Pure World, createWorld, stepWorld, hashWorldState
└── protocol.ts         # Network message schemas & handshake

/src (client)           # React UI shell, Canvas 2D renderer, audio engine
├── render/             # HTML5 2D canvas world renderer, camera lerp, particle pools
├── ui/                 # Mobile-first HUD, virtual joystick, radar, modals
├── audio/              # WebAudio procedural synthesis
├── net/                # LocalGameClient & RemoteGameClient stubs
└── save/               # Profile persistence

/docs                   # System specifications & balance documentation
├── GDD.md              # Complete Game Design Document
├── BALANCE.md          # Exact formulas, damage models, XP, and TTK
├── PROTOCOL.md         # WebSocket network protocol specification
└── PROGRESS.md         # Milestone status tracking (M1 complete, M2-M12 checklist)

/test                   # Vitest unit test suite
├── combat.test.ts      # Angles, armor split, flat reduction, crits, marked
├── ammo.test.ts        # Ammo multipliers, targets, fallback
├── status.test.ts      # Durations, DoT, EMP diminishing returns
├── collision.test.ts   # Obstacle blocking, water zones, vehicle push
└── determinism.test.ts # 300-tick replay test verifying bit-identical state hashes
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

## 4. Pluggable Art Pipeline & Manifest Layer

The asset pipeline uses `/public/assets/manifest.json` to inventory all available raster sprites. Only files explicitly declared in the manifest are fetched; if an asset is not yet loaded or missing, the engine falls back silently to vector placeholders, guaranteeing **zero 404 console errors**.

### Supported Art Assets:

1. **Ground Textures (512x512 Seamless Tiles, Cached into Offscreen Canvases per 1000x1000 Chunk)**:
   - `/assets/ground/meadow.png`: Lush summer meadow ground base for Green Valley.
   - `/assets/ground/gravel_road.png`: Compacted road texture applied along highways and village roads.
   - `/assets/ground/coastal_grass.png`: Feathered transition band approaching the water line.
   - `/assets/ground/beach_sand.png`: Fine sunlit sand along river banks.
   - `/assets/ground/wet_sand.png`: Darker damp packed sand adjacent to the water edge.
   - `/assets/ground/shallow_water.png`: Clear aqua water animated by smoothly scrolling the texture pattern over time.
   - `/assets/ground/canyon_flats.png`: Sandstone plateau ground tile.
   - `/assets/ground/frostline_pass.png`: Crisp ice/snow terrain tile.
   - `/assets/ground/ash_city.png`: Slate asphalt and industrial rubble tile.

2. **Top-Down Props (Straight-Above Perspective, Soft Bottom-Right Drop Shadows)**:
   - `/assets/props/tree_01.png` to `tree_05.png`: Oak, Pine, Birch, Cherry, Autumn trees (**block vehicles** with circle collision at the base).
   - `/assets/props/building_01.png` to `building_13.png`: Outpost structures, terracotta houses, hangars (**block vehicles**).
   - `/assets/props/harbor_01.png` to `harbor_06.png`: Piers, barrel clusters, buoys, mooring chains, crates near the shore.
   - `/assets/props/stone_01.png` to `stone_06.png`: Stones 1-3 are boulders (**block vehicles**), stones 4-6 are small pebbles (**non-blocking**).
   - `/assets/props/plant_01.png` to `plant_06.png`: Meadow shrubs, ferns, flowering bushes (**non-blocking**).
   - `/assets/props/home_base.png`: Fortified safe-zone headquarters with repair cross pad and hazard perimeter at $(2000, 2000)$.

3. **Landmarks**:
   - `/assets/landmarks/green_valley.png`: Cape Solitude Lighthouse with dynamic rotating lantern beam near the map edge.

4. **Loot, Gates, and Wrecks**:
   - `/assets/fx/fx_01.png`: Scrap supply crate.
   - `/assets/fx/fx_02.png`: Tech parts / crystal ore crate.
   - `/assets/fx/fx_03.png`: Ammunition crate.
   - `/assets/fx/fx_04.png`: Field repair kit container.
   - `/assets/fx/fx_05.png` & `fx_06.png`: Rare and gold loot caches.
   - `/assets/fx/fx_07.png`: Swirling gate spatial vortex core (rotates continuously).
   - `/assets/fx/fx_08.png`: Outer metallic gate accelerator pylon frame.
   - `/assets/fx/fx_09.png` & `fx_10.png`: Charred burned vehicle wrecks and smoking wrecks with embers (linger 8s).
   - `/assets/fx/fx_12.png`: Warm campfire prop with flickering radial light aura.

5. **Combat Effects**:
   - `/assets/fx/fx_13.png` to `fx_17.png`: Kinetic muzzle flashes (random pick, additive `lighter` blending, short burst).
   - `/assets/fx/fx_18.png`: Main cannon shell projectile with heat glow.
   - `/assets/fx/fx_19.png`: Secondary machine gun tracer needle.
   - `/assets/fx/fx_20.png` to `fx_23.png`: Explosions scaled by target size (small pop to massive boss detonation).
   - `/assets/fx/fx_24.png` to `fx_25.png`: Billowy smoke puffs and driving dust particles.

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

