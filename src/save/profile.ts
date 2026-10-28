import { AmmoType } from '../sim/types.ts';
import { migrateVehicleId, STARTER_VEHICLE_ID } from '../data/vehicles.ts';
import { SimRNG } from '../../shared/prng.ts';
import { CharacterState, createCharacter, normalizeCharacter, createItem, equipItem, GarageVehicle } from '../../shared/rules/character.ts';

/** Saves from before the simulation merge used lowercase ammo ids. */
const LEGACY_AMMO: Record<string, AmmoType> = { standard: 'STANDARD', ap: 'ARMOR_PIERCING', he: 'EXPLOSIVE' };
export function migrateAmmo(raw: Record<string, number>): Partial<Record<AmmoType, number>> {
  const out: Partial<Record<AmmoType, number>> = {};
  for (const [k, v] of Object.entries(raw)) out[(LEGACY_AMMO[k] || k) as AmmoType] = v;
  return out;
}

export interface UserProfile {
  version: number;
  playerName: string;
  /** Level, XP, wallet, talents, garage, inventory: all in the shared rules model. */
  character: CharacterState;
  ammoInventory: Record<AmmoType, number>;
  currentMapId: string;
  tutorialStep: number; // 0 = drive, 1 = lock target, 2 = fire main, 3 = finished
  settings: {
    soundEnabled: boolean;
    masterVolume: number;
    showDebug: boolean;
    zoom?: number; // 0.5 to 1.2
    colorBlind?: boolean; // radar/markers use a colour-blind safe palette
    reducedEffects?: boolean; // no particles, tracks or banners animation
    uiScale?: number; // 0.8 - 1.4 HUD text/button scale
    hudOpacity?: number; // 0.3 - 1, surface opacity of HUD panels
    minimalHud?: boolean; // only bars, target and controls
    touchControls?: 'auto' | 'on' | 'off'; // joystick + thumb cluster (auto = coarse pointer)
    leftHanded?: boolean; // joystick on the right, fire cluster on the left
    performanceMode?: boolean; // DPR cap 1.5, fewer particles, plain ground
    musicVolume?: number; // 0-1, adaptive music bus (default low)
    effectsVolume?: number; // 0-1, weapons, hits, engine, ambience
    interfaceVolume?: number; // 0-1, UI sounds and fanfares
    musicEnabled?: boolean;
    ambientEnabled?: boolean;
    reduceMotion?: boolean; // no window/banner animations (also follows prefers-reduced-motion)
    perfAutoDone?: boolean; // the automatic switch to performance mode has already happened once (never nag again)
  };
}

export const PROFILE_VERSION = 2;

/** New characters start with a common cannon, armor plating and engine already fitted. */
export function createStarterCharacter(name: string): CharacterState {
  const ch = createCharacter(name);
  ch.wallet.scrap = 400;
  const rng = new SimRNG(1);
  for (const [defId, slot] of [['wpn_cannon_t1', 'main0'], ['arm_reactive_armor_t1', 'armor0'], ['eng_speed_engine_t1', 'engine0']] as const) {
    const made = createItem(ch, defId, 'Common', rng);
    if (made.ok) equipItem(ch, STARTER_VEHICLE_ID, slot, made.item.uid);
  }
  return ch;
}

export const DEFAULT_AMMO: Record<AmmoType, number> = {
  STANDARD: 99999,
  REINFORCED: 0,
  ARMOR_PIERCING: 20,
  SHAPED_CHARGE: 0,
  EXPLOSIVE: 10,
};

export function createDefaultProfile(): UserProfile {
  return {
    version: PROFILE_VERSION,
    playerName: 'Commander',
    character: createStarterCharacter('Commander'),
    ammoInventory: { ...DEFAULT_AMMO },
    currentMapId: 'green_valley',
    tutorialStep: 0,
    settings: { soundEnabled: true, masterVolume: 0.7, showDebug: false },
  };
}

/** Version 1 saves kept level/scrap/parts/vehicles at the top level. */
export function migrateV1(parsed: any): UserProfile {
  const base = createDefaultProfile();
  const ch = base.character;
  ch.name = parsed.playerName || ch.name;
  ch.level = Math.max(1, Math.min(100, Number(parsed.level) || 1));
  ch.wallet.scrap = Number(parsed.scrap) || 0;
  ch.wallet.fragments = Number(parsed.parts) || 0;
  const owned: string[] = Array.from(new Set<string>((parsed.unlockedVehicles || [STARTER_VEHICLE_ID]).map(migrateVehicleId)));
  const keep = ch.garage[0];
  ch.garage = owned.map((id): GarageVehicle => (id === keep.vehicleId ? keep : { vehicleId: id, masteryXp: 0, loadout: {} }));
  if (!ch.garage.some((g) => g.vehicleId === keep.vehicleId)) ch.garage.unshift(keep);
  ch.activeVehicle = migrateVehicleId(parsed.currentVehicleId || STARTER_VEHICLE_ID);
  if (!ch.garage.some((g) => g.vehicleId === ch.activeVehicle)) ch.activeVehicle = STARTER_VEHICLE_ID;
  return {
    ...base,
    playerName: ch.name,
    ammoInventory: { ...base.ammoInventory, ...migrateAmmo(parsed.ammoInventory || {}) },
    currentMapId: parsed.currentMapId || base.currentMapId,
    tutorialStep: parsed.tutorialStep ?? base.tutorialStep,
    settings: { ...base.settings, ...(parsed.settings || {}) },
  };
}

const STORAGE_KEY = 'treadfront_save_v1';

export interface ProfileStore {
  load(): UserProfile;
  save(profile: UserProfile): void;
  reset(): UserProfile;
}

export class LocalStorageProfileStore implements ProfileStore {
  load(): UserProfile {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createDefaultProfile();
      const parsed = JSON.parse(raw);
      if (parsed.version === PROFILE_VERSION && parsed.character) {
        const base = createDefaultProfile();
        return {
          ...base,
          ...parsed,
          character: normalizeCharacter(parsed.character, parsed.playerName || 'Commander'),
          ammoInventory: { ...base.ammoInventory, ...migrateAmmo(parsed.ammoInventory || {}) },
          settings: { ...base.settings, ...(parsed.settings || {}) },
        };
      }
      if (parsed.version === 1) return migrateV1(parsed);
    } catch (e) {
      console.warn('Failed to parse saved profile, falling back to default:', e);
    }
    return createDefaultProfile();
  }

  save(profile: UserProfile): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch (e) {
      console.warn('Failed to save profile to localStorage:', e);
    }
  }

  reset(): UserProfile {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to reset profile:', e);
    }
    return createDefaultProfile();
  }
}
