import { AmmoType } from '../sim/types.ts';

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
  level: number; // 1-30
  xp: number;
  scrap: number;
  parts: number;
  unlockedVehicles: string[];
  currentVehicleId: string;
  equippedParts: {
    cannon: string;
    armor: string;
    engine: string;
  };
  ammoInventory: Record<AmmoType, number>;
  currentMapId: string;
  tutorialStep: number; // 0 = drive, 1 = lock target, 2 = fire main, 3 = finished
  settings: {
    soundEnabled: boolean;
    masterVolume: number;
    showDebug: boolean;
    zoom?: number; // 0.5 to 1.2
  };
}

export const XP_FOR_LEVEL = (level: number): number => {
  if (level <= 1) return 100;
  return Math.floor(100 * Math.pow(1.18, level - 1));
};

export const DEFAULT_PROFILE: UserProfile = {
  version: 1,
  playerName: 'Commander',
  level: 1,
  xp: 0,
  scrap: 400,
  parts: 25,
  unlockedVehicles: ['patchwork_scout'],
  currentVehicleId: 'patchwork_scout',
  equippedParts: {
    cannon: 'cannon_t1',
    armor: 'armor_t1',
    engine: 'engine_t1',
  },
  ammoInventory: {
    STANDARD: 99999,
    REINFORCED: 0,
    ARMOR_PIERCING: 20,
    SHAPED_CHARGE: 0,
    EXPLOSIVE: 10,
  },
  currentMapId: 'green_valley',
  tutorialStep: 0,
  settings: {
    soundEnabled: true,
    masterVolume: 0.7,
    showDebug: false,
  },
};

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
      if (!raw) return { ...DEFAULT_PROFILE };
      const parsed = JSON.parse(raw);
      if (parsed.version === DEFAULT_PROFILE.version) {
        return {
          ...DEFAULT_PROFILE,
          ...parsed,
          ammoInventory: { ...DEFAULT_PROFILE.ammoInventory, ...migrateAmmo(parsed.ammoInventory || {}) },
          equippedParts: { ...DEFAULT_PROFILE.equippedParts, ...(parsed.equippedParts || {}) },
          settings: { ...DEFAULT_PROFILE.settings, ...(parsed.settings || {}) },
        };
      }
    } catch (e) {
      console.warn('Failed to parse saved profile, falling back to default:', e);
    }
    return { ...DEFAULT_PROFILE };
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
    return { ...DEFAULT_PROFILE };
  }
}
