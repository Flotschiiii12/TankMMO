/**
 * Contextual hints for new players (cloud run 3): small, rare, dismissible messages that appear when the player does
 * something that is likely a mistake or misses something useful. Pure rules: the UI feeds the state, shows the text and
 * calls `markShown`. Each hint has a cooldown and a lifetime cap so it never nags.
 */
export type HintId = 'pvp_early' | 'low_ammo' | 'full_inventory' | 'low_hull' | 'talent_points' | 'first_story';

export interface HintState {
  level: number;
  mapId: number;
  inSafeZone: boolean;
  hullRatio: number;
  inventoryFull: boolean;
  /** owned units of special ammo (everything except STANDARD) */
  specialAmmo: number;
  /** special ammo was used up recently (it was > 0 a moment ago) */
  specialAmmoJustRanOut: boolean;
  unspentTalentPoints: number;
  tutorialDone: boolean;
  firstStoryAvailable: boolean;
}

export interface HintDef { id: HintId; textKey: string; cooldownSeconds: number; maxShows: number; when: (s: HintState) => boolean }

/** Newbie protection: up to this level dying costs no scrap, starter maps are peaceful (see pve.ts acquireRange) and PvP is closed (PVP_MIN_LEVEL). */
export const NEWBIE_PROTECTION_LEVEL = 5;
export const PVP_MAPS = [21, 22, 23, 24, 25, 26, 27, 28, 29];
export const PVP_MIN_LEVEL = 15;

export const HINTS: HintDef[] = [
  { id: 'low_hull', textKey: 'Your hull is low. Retreat to a safe zone or use a repair kit.', cooldownSeconds: 90, maxShows: 4, when: (s) => !s.inSafeZone && s.hullRatio > 0 && s.hullRatio < 0.3 },
  { id: 'pvp_early', textKey: 'This is a PvP zone. Below level 15 you cannot fight other players here. Use a gate to leave.', cooldownSeconds: 300, maxShows: 2, when: (s) => PVP_MAPS.includes(s.mapId) && s.level < PVP_MIN_LEVEL },
  { id: 'full_inventory', textKey: 'Your inventory is full. Dismantle or sell items in a safe zone.', cooldownSeconds: 180, maxShows: 3, when: (s) => s.inventoryFull },
  { id: 'low_ammo', textKey: 'Out of special ammo. Buy more in a safe zone workshop.', cooldownSeconds: 240, maxShows: 3, when: (s) => s.specialAmmoJustRanOut },
  { id: 'first_story', textKey: 'Your first story mission is available. Open Quests > Available to accept it.', cooldownSeconds: 600, maxShows: 1, when: (s) => s.firstStoryAvailable },
  { id: 'talent_points', textKey: 'You have unspent talent points. Open the Garage > Talents.', cooldownSeconds: 600, maxShows: 3, when: (s) => s.unspentTalentPoints > 0 && s.inSafeZone },
];

export interface HintMemory { shown: Partial<Record<HintId, { count: number; last: number }>> }
export const newHintMemory = (): HintMemory => ({ shown: {} });

/** The first applicable hint that is not on cooldown or used up; guided instructions take priority until the tutorial ends. */
export function nextHint(s: HintState, mem: HintMemory, nowSeconds: number): HintDef | undefined {
  if (!s.tutorialDone) return undefined;
  for (const h of HINTS) {
    if (!h.when(s)) continue;
    const m = mem.shown[h.id];
    if (m && (m.count >= h.maxShows || nowSeconds - m.last < h.cooldownSeconds)) continue;
    return h;
  }
  return undefined;
}

export function markShown(mem: HintMemory, id: HintId, nowSeconds: number): void {
  const m = mem.shown[id] ?? { count: 0, last: -1e9 };
  mem.shown[id] = { count: m.count + 1, last: nowSeconds };
}

/** Texts of the guided start, one per tutorial step (shown in the "next step" chip). */
export const TUTORIAL_HINT_KEYS: Record<string, string> = {
  drive: 'Drive around: drag the left stick or press WASD.',
  lock: 'Lock an enemy: tap the TARGET button or tap an enemy vehicle.',
  fire: 'Fire your cannon: press Space or tap FIRE. The shot always finds its target.',
  loot: 'Pick up loot: drive over crates and ore dropped by wrecks.',
  garage: 'Open the Garage from the HUD menu and look at your vehicle.',
  equip: 'Open the Inventory from the HUD menu and equip a better item.',
  levelup: 'Defeat enemies until you reach level 2.',
  portal: 'Drive into a gate at the edge of the map to travel to the next zone.',
  ammo: 'Switch to special ammo with the ammo button (buy some in a safe zone).',
  ability: 'Use an ability: smoke, repair kit or boost.',
  gate: 'Open Gates in the Social menu and look at the first dungeon.',
};
