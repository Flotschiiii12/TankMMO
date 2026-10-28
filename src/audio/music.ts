/**
 * Adaptive music: a small state machine that follows the situation (calm / tension / combat / boss) and a deterministic
 * phrase generator that turns a state into notes. No audio here, so it is fully testable; soundEngine plays the notes.
 */
export type MusicState = 'calm' | 'tension' | 'combat' | 'boss';
export interface MusicInputs { inSafeZone: boolean; hostilesNear: number; inCombat: boolean; bossNear: boolean }

/** Seconds the music stays in combat after the last shot, and the shortest stay before it relaxes (avoids flapping). */
export const COMBAT_LINGER = 8;
export const MIN_DWELL = 4;

export class MusicDirector {
  state: MusicState = 'calm';
  private sinceChange = 0;
  private sinceCombat = 999;
  update(i: MusicInputs, dt: number): MusicState {
    this.sinceChange += dt;
    this.sinceCombat = i.inCombat || i.bossNear ? 0 : this.sinceCombat + dt;
    let target: MusicState;
    if (i.bossNear) target = 'boss';
    else if (i.inCombat) target = 'combat';
    else if ((this.state === 'combat' || this.state === 'boss') && this.sinceCombat < COMBAT_LINGER) target = this.state;
    else if (!i.inSafeZone && i.hostilesNear > 0) target = 'tension';
    else target = 'calm';
    const rank = (s: MusicState) => ({ calm: 0, tension: 1, combat: 2, boss: 3 })[s];
    // going up is immediate, coming down waits for the minimum dwell time
    if (rank(target) > rank(this.state) || (target !== this.state && this.sinceChange >= MIN_DWELL)) { this.state = target; this.sinceChange = 0; }
    return this.state;
  }
}

// ------------------------------------------------------------------ generative phrases
export const SCALE_MINOR = [0, 2, 3, 5, 7, 8, 10];
export const ROOT_MIDI = 45; // A2
export const midiFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export interface MusicNote { step: number; midi: number; dur: number; vel: number; voice: 'pad' | 'bass' | 'lead' }
export interface StateSpec { bpm: number; density: number; bassEvery: number; leadChance: number; octaveShift: number }
export const SPEC: Record<MusicState, StateSpec> = {
  calm: { bpm: 70, density: 0.12, bassEvery: 8, leadChance: 0.35, octaveShift: 1 },
  tension: { bpm: 84, density: 0.22, bassEvery: 4, leadChance: 0.25, octaveShift: 0 },
  combat: { bpm: 112, density: 0.5, bassEvery: 2, leadChance: 0.5, octaveShift: 0 },
  boss: { bpm: 128, density: 0.62, bassEvery: 1, leadChance: 0.55, octaveShift: -1 },
};
export const STEPS_PER_BAR = 8;
/** Chord roots (scale degrees) per bar, four bars loop. */
const PROGRESSION = [0, 5, 3, 4];

/** Small seeded generator (mulberry32) so a bar sounds the same for the same seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const degreeMidi = (degree: number, octave = 0): number => ROOT_MIDI + 12 * octave + 12 * Math.floor(degree / 7) + SCALE_MINOR[((degree % 7) + 7) % 7];

/** One bar of eighth notes for a state. `bar` selects the chord of the progression. */
export function buildBar(state: MusicState, bar: number, seed = 1): MusicNote[] {
  const spec = SPEC[state]; const rand = rng(seed * 7919 + bar * 104729 + state.length);
  const root = PROGRESSION[((bar % 4) + 4) % 4];
  const notes: MusicNote[] = [];
  // pad chord on the first step, held for the whole bar
  for (const d of [0, 2, 4]) notes.push({ step: 0, midi: degreeMidi(root + d, 1 + spec.octaveShift), dur: STEPS_PER_BAR, vel: state === 'calm' ? 0.5 : 0.35, voice: 'pad' });
  for (let s = 0; s < STEPS_PER_BAR; s += spec.bassEvery) notes.push({ step: s, midi: degreeMidi(root, spec.octaveShift - 1) + (state === 'tension' && s % 8 === 4 ? 6 : 0), dur: Math.min(spec.bassEvery, 2), vel: 0.6, voice: 'bass' });
  for (let s = 0; s < STEPS_PER_BAR; s++) {
    if (rand() < spec.density && rand() < spec.leadChance + 0.3) {
      const d = root + [0, 2, 4, 6, 7][Math.floor(rand() * 5)];
      notes.push({ step: s, midi: degreeMidi(d, 2 + spec.octaveShift), dur: 1, vel: 0.3 + rand() * 0.2, voice: 'lead' });
    }
  }
  return notes;
}

export const stepSeconds = (state: MusicState): number => 60 / SPEC[state].bpm / 2;
