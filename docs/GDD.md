# Treadfront — Game Design Document (GDD)

## 1. Vision & Core Concept
**Treadfront** is an online 2D top-down vehicle combat MMO running natively in the browser on mobile (landscape-first) and desktop. Players pilot customizable combat vehicles featuring tank-like chassis rotation and independently articulating turrets. The world is vibrant, colorful, and diverse across 30 expansive outdoor zones, biomes, dungeons, and contested borderlands.

### Key Pillars
1. **Tactical Armored Combat**: Chassis positioning, angling, armor deflection, turret traverse, and strategic ammunition choices decide engagements over mindless twitch reflexes.
2. **Deep MMO Structure**: Leveling 1–100, 50 vehicles across 5 distinct classes and 10 tiers, 3 branches of talents, open world exploration, instanced dungeons ("Gates"), world bosses, seasonal rankings, and faction war.
3. **Pluggable Architecture**: Strict separation of pure deterministic 30 Hz simulation (`/shared`), authoritative game server (`/server`), and presentation shell (`/client`).
4. **Fair Economy**: No pay-to-win loot boxes or gambling. Pure gameplay progression with scrap, ore, and crafting.

---

## 2. Controls & Camera
- **Mobile (Landscape First)**:
  - **Left Thumb**: Virtual steering joystick. Vehicle accelerates and steers towards stick angle; release to decelerate.
  - **Right Thumb**: Prominent `TARGET/FIRE` button:
    - Tap: Lock nearest enemy in range (800 units).
    - Double tap / hold: Toggle Auto-Fire.
    - Radial Ability cluster around target button: Abilities 1–4, Next Target, Cycle Ammo.
  - **Touch Gestures**: Pinch-to-zoom (0.5x – 1.2x range).
- **Desktop**:
  - `WASD` / Arrow keys: Drive and steer chassis.
  - `Mouse`: Aim and click to target/fire.
  - `Space`: Toggle auto-fire.
  - `Q`, `E`, `F`, `G`: Abilities 1–4.
  - `1`–`5`: Select ammo types (Standard, Reinforced, AP, Shaped Charge, Explosive).
  - `Tab`: Cycle next target.
  - Shortcuts: `M` (Map), `I` (Inventory), `C` (Character/Talents), `V` (Garage), `P` (Party), `O` (Clan), `J` (Quests), `Enter` (Chat).

---

## 3. Combat Model
- **Simulation Timestep**: 30 Hz fixed (`dt = 1/30` s). Deterministic with seeded PRNG (`sfc32`).
- **Network Snapshot Rate**: 10 Hz with client-side prediction and server reconciliation.
- **Damage Formula**:
  - **Impact Angle $\theta$**:
    - Front Arc ($|\theta| \le 45^\circ$): $\times 0.70$ (deflection)
    - Side Arc ($45^\circ < |\theta| < 135^\circ$): $\times 1.00$
    - Rear Arc ($|\theta| \ge 135^\circ$): $\times 1.40$ (engine critical hit)
  - **Critical Hits**: $\times 1.50$ damage multiplier.
  - **Target Status**: `Marked` adds $+15\%$ damage taken.
  - **Flat Damage Reduction**: Subtracted before armor split; damage is clamped so it never drops below $10\%$ of raw damage.
  - **Armor Split**: Armor absorbs $80\%$ of remaining damage while armor $> 0$; $20\%$ penetrates directly to hull. When armor is depleted, $100\%$ penetrates to hull.
  - **Armor Regeneration**: Begins after 8 seconds without taking damage at $4\%$ of maximum armor per second.
  - **Hull Repair**: Restored in safe zones or via Repair Kit ability (channeling canceled on hit).

---

## 4. Vehicle Classes & Scaling
5 classes across 10 tiers (50 vehicle chassis):
1. **Scout**: High mobility, evasion, scouting radar, `Dash` ability.
2. **Medium**: Balanced armor and firepower, `Overcharge` ability.
3. **Heavy**: Thick armor, increased slots, slow speed, `Fortify` ability (+40% armor, -40% speed).
4. **Artillery**: Long-range siege weapons (900+ units), telegraphed mortar volleys, `Barrage` ability.
5. **Support**: Fleet sustain, repair auras, utility drones, `Repair Aura` ability.

### Tier Stat Scaling
- Base Hull / Armor / Damage: $\times 1.45$ per tier.
- Base Speed: $\times 1.04$ per tier.
- Tiers unlock at level thresholds: 1, 8, 16, 24, 34, 44, 56, 68, 80, 92.

---

## 5. Ammo Types
- `STANDARD`: Unlimited, free, 1.0x damage.
- `REINFORCED`: 1.25x damage, costs scrap.
- `ARMOR_PIERCING`: Ignores 40% target flat armor reduction; 1.0x vs light/medium, 0.8x vs heavy bodies.
- `SHAPED_CHARGE`: 1.6x vs bosses/bunkers, 0.7x vs standard vehicles.
- `EXPLOSIVE`: 0.85x direct damage with 60px area-of-effect splash.
- *Exhaustion behavior*: Automatic fallback to `STANDARD` when special ammo stack reaches 0.

---

## 6. World Layout & Maps (30 Zones)
- **Faction Home Regions (PvE)**: Maps 1–12 (Coastal Union, Highland Union, Steppe Caravan).
- **Neutral Hub & Middle Zones (PvE)**: Maps 13–20 (Crossfield Hub, Convoys, Swamps, World Bosses).
- **Borderlands (Faction PvP)**: Maps 21–24 (Bridgehead, Customs, Ashfield, No Man's Land).
- **Endgame (PvE/Raid)**: Maps 25–29 (Ruined City Vaelmar, Storm Coast, Burning Valley).
- **Competitive Arena**: Map 30 (The Pit: 1v1, 3v3, 5v5 rated matches).
