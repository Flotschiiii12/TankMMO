import type { VehicleClass } from '../../shared/types.ts';

/** Pure mixer maths: four buses (master, music, effects, interface) and what each one should output. */
export type Bus = 'master' | 'music' | 'effects' | 'interface';

export interface Mix {
  /** global switch (the old "sound on/off") */
  enabled: boolean;
  master: number; music: number; effects: number; interface: number;
  musicEnabled: boolean; ambientEnabled: boolean;
}

/** Keep adaptive music under the action mix and soften interface sounds relative to combat. */
export const DEFAULT_MIX: Mix = { enabled: true, master: 0.7, music: 0.28, effects: 0.85, interface: 0.75, musicEnabled: true, ambientEnabled: true };

export const clamp01 = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.max(0, Math.min(1, n));
};

/** Gain of one bus node. The master carries the on/off switch; the others are linear under it. */
export function busGain(mix: Mix, bus: Bus): number {
  switch (bus) {
    case 'master': return mix.enabled ? clamp01(mix.master) : 0;
    case 'music': return mix.musicEnabled ? clamp01(mix.music) : 0;
    case 'effects': return clamp01(mix.effects, 1);
    case 'interface': return clamp01(mix.interface, 1);
  }
}

/** What actually reaches the speakers for a bus (bus gain times master), for tests and the mixer meters. */
export const effectiveGain = (mix: Mix, bus: Bus): number => (bus === 'master' ? busGain(mix, 'master') : busGain(mix, 'master') * busGain(mix, bus));

/** Relative engine weight by vehicle class, used to deepen the motor hum without changing vehicle stats. */
export function engineWeightFor(vehicleClass: VehicleClass | undefined): number {
  switch (vehicleClass) {
    case 'scout': return 0.12;
    case 'medium': return 0.45;
    case 'heavy': return 0.95;
    case 'artillery': return 0.8;
    case 'support': return 0.6;
    default: return 0.45;
  }
}

/** Volume of a sound that happens `distance` away from the player: full within `near`, silent beyond `far`, smooth in between. */
export function distanceVolume(distance: number, near = 300, far = 1800): number {
  if (!(distance > near)) return 1;
  if (distance >= far) return 0;
  const t = (distance - near) / (far - near);
  return (1 - t) * (1 - t);
}

/** Settings from the profile (partial, possibly old) to a complete mix. */
export function mixFromSettings(s: { soundEnabled?: boolean; masterVolume?: number; musicVolume?: number; effectsVolume?: number; interfaceVolume?: number; musicEnabled?: boolean; ambientEnabled?: boolean }): Mix {
  return {
    enabled: s.soundEnabled !== false,
    master: clamp01(s.masterVolume, DEFAULT_MIX.master),
    music: clamp01(s.musicVolume, DEFAULT_MIX.music),
    effects: clamp01(s.effectsVolume, DEFAULT_MIX.effects),
    interface: clamp01(s.interfaceVolume, DEFAULT_MIX.interface),
    musicEnabled: s.musicEnabled !== false,
    ambientEnabled: s.ambientEnabled !== false,
  };
}

export interface AmbientSpec { cutoff: number; gain: number; lfoHz: number; lfoDepth: number }
/** Background bed per biome: filtered noise that breathes slowly (wind, surf, dry air). Gains are small; the effects bus scales them. */
export function ambientFor(biome: string | undefined): AmbientSpec | null {
  switch (biome) {
    case 'coastal': return { cutoff: 700, gain: 0.05, lfoHz: 0.12, lfoDepth: 260 }; // surf
    case 'highland': case 'snow': case 'canyon': return { cutoff: 1100, gain: 0.045, lfoHz: 0.2, lfoDepth: 500 }; // wind
    case 'steppe': case 'valley': case 'desert': return { cutoff: 900, gain: 0.04, lfoHz: 0.15, lfoDepth: 380 };
    case 'marsh': return { cutoff: 480, gain: 0.045, lfoHz: 0.1, lfoDepth: 160 };
    case 'volcanic': case 'ash': return { cutoff: 360, gain: 0.06, lfoHz: 0.08, lfoDepth: 120 }; // low rumble
    case 'ruins': return { cutoff: 600, gain: 0.03, lfoHz: 0.18, lfoDepth: 200 };
    default: return null; // arena and unknown: silence
  }
}

export type WeaponSoundKind = 'cannon' | 'machinegun' | 'missile' | 'laser' | 'mortar';
/** Which synthesised shot a weapon family gets (families come from shared item data; unknown ones fire like a cannon). */
export function weaponSoundFor(family: string | undefined): WeaponSoundKind {
  switch (family) {
    case 'machine_gun': case 'rapid_fire': case 'flak': return 'machinegun';
    case 'rocket': return 'missile';
    case 'arc_coil': case 'railgun': case 'flamethrower': return 'laser';
    case 'mortar': case 'mine_layer': return 'mortar';
    default: return 'cannon';
  }
}
