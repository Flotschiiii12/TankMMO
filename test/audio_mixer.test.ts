import { describe, expect, it } from 'vitest';
import { DEFAULT_MIX, busGain, clamp01, distanceVolume, effectiveGain, engineWeightFor, mixFromSettings } from '../src/audio/mixer.ts';
import { COMBAT_LINGER, MIN_DWELL, MusicDirector, SCALE_MINOR, SPEC, ROOT_MIDI, STEPS_PER_BAR, buildBar, midiFreq, rng, stepSeconds, type MusicInputs } from '../src/audio/music.ts';

const calmIn: MusicInputs = { inSafeZone: false, hostilesNear: 0, inCombat: false, bossNear: false };

describe('mixer', () => {
  it('master carries the on/off switch, buses scale under it', () => {
    const m = { ...DEFAULT_MIX, master: 0.5, music: 0.4, effects: 0.8 };
    expect(busGain(m, 'master')).toBe(0.5);
    expect(effectiveGain(m, 'music')).toBeCloseTo(0.2);
    expect(effectiveGain(m, 'effects')).toBeCloseTo(0.4);
    expect(effectiveGain({ ...m, enabled: false }, 'effects')).toBe(0);
    expect(busGain({ ...m, musicEnabled: false }, 'music')).toBe(0);
  });
  it('clamps and survives garbage', () => {
    expect(clamp01(5)).toBe(1); expect(clamp01(-2)).toBe(0); expect(clamp01(NaN, 0.3)).toBe(0.3); expect(clamp01('x', 0.2)).toBe(0.2);
    const m = mixFromSettings({ masterVolume: 9, musicVolume: -1 });
    expect(m.master).toBe(1); expect(m.music).toBe(0); expect(m.effects).toBe(DEFAULT_MIX.effects); expect(m.enabled).toBe(true);
    expect(mixFromSettings({ soundEnabled: false }).enabled).toBe(false);
    expect(mixFromSettings({}).music).toBe(DEFAULT_MIX.music);
  });
  it('balances music and interface levels below combat effects', () => {
    expect(DEFAULT_MIX.music).toBeLessThanOrEqual(0.35);
    expect(DEFAULT_MIX.music).toBeLessThan(DEFAULT_MIX.interface);
    expect(DEFAULT_MIX.interface).toBeLessThan(DEFAULT_MIX.effects);
    expect(effectiveGain(DEFAULT_MIX, 'music')).toBeLessThan(effectiveGain(DEFAULT_MIX, 'effects'));
  });
  it('gives heavier vehicle classes a deeper engine profile', () => {
    expect(engineWeightFor('scout')).toBeLessThan(engineWeightFor('medium'));
    expect(engineWeightFor('medium')).toBeLessThan(engineWeightFor('support'));
    expect(engineWeightFor('support')).toBeLessThan(engineWeightFor('artillery'));
    expect(engineWeightFor('artillery')).toBeLessThan(engineWeightFor('heavy'));
    expect(engineWeightFor(undefined)).toBe(engineWeightFor('medium'));
  });
  it('distance volume falls off smoothly to silence', () => {
    expect(distanceVolume(0)).toBe(1); expect(distanceVolume(300)).toBe(1); expect(distanceVolume(1800)).toBe(0); expect(distanceVolume(5000)).toBe(0);
    const a = distanceVolume(600), b = distanceVolume(1200);
    expect(a).toBeLessThan(1); expect(b).toBeLessThan(a); expect(b).toBeGreaterThan(0);
  });
});

describe('music director', () => {
  it('goes up at once and relaxes only after the linger and dwell times', () => {
    const d = new MusicDirector();
    expect(d.update(calmIn, 1)).toBe('calm');
    expect(d.update({ ...calmIn, hostilesNear: 2 }, 0.1)).toBe('tension');
    expect(d.update({ ...calmIn, hostilesNear: 2, inCombat: true }, 0.1)).toBe('combat');
    // combat stops: stays in combat for the linger time
    expect(d.update({ ...calmIn, hostilesNear: 2 }, 1)).toBe('combat');
    for (let t = 0; t < COMBAT_LINGER - 1; t++) d.update({ ...calmIn, hostilesNear: 2 }, 1);
    expect(['combat', 'tension']).toContain(d.state);
    for (let t = 0; t < 4; t++) d.update({ ...calmIn, hostilesNear: 2 }, 1);
    expect(d.state).toBe('tension');
    for (let t = 0; t < MIN_DWELL + 1; t++) d.update({ ...calmIn, inSafeZone: true }, 1);
    expect(d.state).toBe('calm');
  });
  it('a boss beats everything and does not flap on a one-frame gap', () => {
    const d = new MusicDirector();
    expect(d.update({ ...calmIn, bossNear: true, inCombat: true }, 0.1)).toBe('boss');
    expect(d.update(calmIn, 0.1)).toBe('boss');
    expect(d.update({ ...calmIn, inCombat: true }, 0.1)).toBe('boss'); // dwell: no drop to combat yet
  });
  it('safe zone stays calm even with hostiles nearby', () => {
    const d = new MusicDirector();
    expect(d.update({ ...calmIn, inSafeZone: true, hostilesNear: 3 }, 5)).toBe('calm');
  });
});

describe('music phrases', () => {
  const states = ['calm', 'tension', 'combat', 'boss'] as const;
  it('is deterministic and stays in range and in the scale', () => {
    for (const s of states) for (let bar = 0; bar < 4; bar++) {
      const a = buildBar(s, bar, 3), b = buildBar(s, bar, 3);
      expect(a).toEqual(b);
      for (const n of a) {
        expect(n.step).toBeGreaterThanOrEqual(0); expect(n.step).toBeLessThan(STEPS_PER_BAR);
        expect(n.midi).toBeGreaterThan(20); expect(n.midi).toBeLessThan(100);
        const pc = ((n.midi - ROOT_MIDI) % 12 + 12) % 12;
        if (!(s === 'tension' && n.voice === 'bass')) expect(SCALE_MINOR).toContain(pc); // the tension bass adds a deliberate tritone
      }
    }
  });
  it('gets busier and faster with the situation', () => {
    const count = (s: typeof states[number]) => { let c = 0; for (let b = 0; b < 16; b++) c += buildBar(s, b, 1).filter((n) => n.voice !== 'pad').length; return c; };
    expect(count('combat')).toBeGreaterThan(count('calm'));
    expect(count('boss')).toBeGreaterThanOrEqual(count('combat'));
    expect(SPEC.boss.bpm).toBeGreaterThan(SPEC.calm.bpm);
    expect(stepSeconds('calm')).toBeGreaterThan(stepSeconds('boss'));
  });
  it('different seeds differ, rng is stable and in [0,1)', () => {
    expect(buildBar('combat', 0, 1)).not.toEqual(buildBar('combat', 0, 2));
    const r = rng(5); const v = Array.from({ length: 50 }, () => r());
    expect(v.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(v).toEqual((() => { const q = rng(5); return Array.from({ length: 50 }, () => q()); })());
    expect(midiFreq(69)).toBeCloseTo(440);
  });
});

import { ammoImpactToneFor, ambientFor, weaponSoundFor } from '../src/audio/mixer.ts';
import { AMMO_CONFIGS } from '../shared/rules/ammo.ts';
import type { AmmoType } from '../shared/types.ts';
describe('audio mappings', () => {
  it('gives every main weapon family a distinct sound and auxiliary families deliberate fallbacks', () => {
    const fam = ['cannon', 'machine_gun', 'rapid_fire', 'flak', 'rocket', 'arc_coil', 'railgun', 'flamethrower', 'mortar', 'mine_layer'];
    const soundKinds = ['cannon', 'rapid_fire', 'rocket', 'mortar', 'railgun', 'flamethrower', 'machinegun', 'laser'];
    for (const f of fam) expect(soundKinds).toContain(weaponSoundFor(f));
    const mains = ['cannon', 'rapid_fire', 'rocket', 'mortar', 'railgun', 'flamethrower'];
    expect(new Set(mains.map(weaponSoundFor)).size).toBe(mains.length);
    expect(weaponSoundFor('machine_gun')).toBe('machinegun');
    expect(weaponSoundFor('arc_coil')).toBe('laser');
    expect(weaponSoundFor(undefined)).toBe('cannon');
    expect(weaponSoundFor('???')).toBe('cannon');
  });
  it('gives each ammo type its own synthetic hit timbre', () => {
    const ammoTypes: AmmoType[] = ['STANDARD', 'REINFORCED', 'ARMOR_PIERCING', 'SHAPED_CHARGE', 'EXPLOSIVE'];
    expect(ammoTypes.every((ammo) => ammo in AMMO_CONFIGS)).toBe(true);
    const tones = ammoTypes.map((ammo) => ammoImpactToneFor(ammo, false));
    expect(new Set(tones.map((tone) => tone.startHz)).size).toBe(tones.length);
    expect(new Set(tones.map((tone) => tone.waveform)).size).toBeGreaterThan(1);
    expect(ammoImpactToneFor('STANDARD', true).startHz).toBeGreaterThan(ammoImpactToneFor('STANDARD', false).startHz);
  });
  it('every biome has a bed or is deliberately silent, with quiet gains', () => {
    for (const b of ['coastal', 'highland', 'steppe', 'marsh', 'canyon', 'snow', 'ruins', 'desert', 'volcanic', 'valley', 'ash']) {
      const a = ambientFor(b); expect(a).not.toBeNull(); expect(a!.gain).toBeLessThan(0.1); expect(a!.lfoDepth).toBeLessThan(a!.cutoff);
    }
    expect(ambientFor('arena')).toBeNull(); expect(ambientFor(undefined)).toBeNull();
  });
});
