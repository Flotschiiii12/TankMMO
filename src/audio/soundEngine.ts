import { DEFAULT_MIX, ambientFor, busGain, clamp01, type Bus, type Mix } from './mixer.ts';
import { MusicDirector, STEPS_PER_BAR, buildBar, midiFreq, stepSeconds, type MusicInputs, type MusicNote, type MusicState } from './music.ts';

export type UISound = 'click' | 'hover' | 'open' | 'close' | 'confirm' | 'deny' | 'tab' | 'toast' | 'equip' | 'coin';
export type WeaponSound = 'cannon' | 'machinegun' | 'missile' | 'laser' | 'mortar';
export type Fanfare = 'levelup' | 'rankup' | 'quest';
type NodeBus = Exclude<Bus, 'master'>;

/**
 * Web Audio synthesis, no sample files. Graph: sources -> bus (music / effects / interface) -> master -> speakers.
 * The mix (volumes and switches) lives in mixer.ts; the adaptive music in music.ts. Every `play*` is a no-op until the
 * first user gesture has called init().
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Partial<Record<NodeBus, GainNode>> = {};
  private engineOsc: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private mix: Mix = { ...DEFAULT_MIX };
  private initialized = false;
  private lastPlayed = new Map<string, number>();
  // ambient
  private ambient: { src: AudioBufferSourceNode; gain: GainNode; lfo: OscillatorNode; key: string; base: number } | null = null;
  // music
  private director = new MusicDirector();
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicBar = 0; private musicStep = 0; private nextStepAt = 0; private barNotes: MusicNote[] = []; private seed = 1 + Math.floor(Math.random() * 1000);
  private musicOverride: MusicState | null = null;

  public init() {
    if (this.initialized && this.ctx) { void this.ctx.resume?.(); return; }
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      for (const b of ['music', 'effects', 'interface'] as const) { const g = this.ctx.createGain(); g.connect(this.master); this.buses[b] = g; }
      this.applyMix(this.mix, true);
      this.initReverb();
      this.initEngineSound();
      this.initialized = true;
      this.syncMusic();
    } catch (e) {
      console.warn('WebAudio initialization error:', e);
    }
  }

  // ------------------------------------------------------------------ mix
  public applyMix(mix: Mix, instant = false) {
    this.mix = { ...mix };
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime; const k = instant ? 0.001 : 0.03;
    this.master.gain.setTargetAtTime(busGain(mix, 'master'), t, k);
    for (const b of ['music', 'effects', 'interface'] as const) this.buses[b]?.gain.setTargetAtTime(busGain(mix, b), t, k);
    if (this.engineGain && !mix.enabled) this.engineGain.gain.setTargetAtTime(0, t, k);
    if (this.ambient) this.ambient.gain.gain.setTargetAtTime(mix.ambientEnabled ? this.ambient.base : 0, t, 0.2);
    this.syncMusic();
  }
  public getMix(): Mix { return { ...this.mix }; }
  public setSoundEnabled(enabled: boolean) { this.applyMix({ ...this.mix, enabled }); }
  public setVolume(volume: number) { this.applyMix({ ...this.mix, master: clamp01(volume) }); }
  public isEnabled(): boolean { return this.mix.enabled; }

  private get on(): boolean { return this.mix.enabled && !!this.ctx && this.initialized; }
  private out(bus: NodeBus): GainNode | null { return this.buses[bus] ?? null; }
  /** Drops a sound if the same kind played less than `ms` ago (machine-gun bursts, hit storms). */
  private throttled(kind: string, ms: number): boolean {
    const now = performance.now(); const last = this.lastPlayed.get(kind) ?? -1e9;
    if (now - last < ms) return true;
    this.lastPlayed.set(kind, now); return false;
  }
  private ready(): AudioContext | null {
    if (!this.on || !this.ctx) return null;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  // ------------------------------------------------------------------ building blocks
  private blip(bus: NodeBus, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, volume = 1, reverbSend = 0) {
    const ctx = this.ready(); const dest = this.out(bus); if (!ctx || !dest) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol * volume, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(dest);
    if (reverbSend > 0) this.sendToReverb(g, osc, reverbSend);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
  private noise(bus: NodeBus, dur: number, vol: number, cutoff: number, delay = 0, volume = 1, type: BiquadFilterType = 'lowpass', reverbSend = 0) {
    const ctx = this.ready(); const dest = this.out(bus); if (!ctx || !dest) return;
    try {
      const t = ctx.currentTime + delay;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer(ctx);
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(cutoff, t);
      const g = ctx.createGain(); g.gain.setValueAtTime(vol * volume, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(dest);
      if (reverbSend > 0) this.sendToReverb(g, src, reverbSend);
      src.start(t, Math.random() * 0.5, dur + 0.02);
    } catch { /* noise is optional */ }
  }
  private initReverb() {
    if (!this.ctx || !this.buses.effects) return;
    const ctx = this.ctx; const convolver = ctx.createConvolver(); const length = Math.floor(ctx.sampleRate * 0.32);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    convolver.normalize = false;
    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }
    convolver.buffer = impulse;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 1400;
    const returnGain = ctx.createGain(); returnGain.gain.value = 0.18;
    convolver.connect(tone); tone.connect(returnGain); returnGain.connect(this.buses.effects);
    this.reverb = convolver;
  }
  private sendToReverb(source: AudioNode, lifetime: AudioScheduledSourceNode, amount: number) {
    if (!this.ctx || !this.reverb) return;
    const send = this.ctx.createGain(); send.gain.value = amount;
    source.connect(send); send.connect(this.reverb);
    lifetime.addEventListener('ended', () => send.disconnect(), { once: true });
  }
  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuf) {
      const n = ctx.sampleRate * 2; const b = ctx.createBuffer(1, n, ctx.sampleRate); const d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = b;
    }
    return this.noiseBuf;
  }

  // ------------------------------------------------------------------ engine
  private initEngineSound() {
    if (!this.ctx || !this.buses.effects) return;
    try {
      this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.setValueAtTime(45, this.ctx.currentTime);
      this.engineFilter = this.ctx.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.setValueAtTime(140, this.ctx.currentTime);
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      this.engineOsc.connect(this.engineFilter); this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.buses.effects);
      this.engineOsc.start();
    } catch { /* engine hum is optional */ }
  }

  /** Called every frame with the vehicle speed (0..1): pitch and brightness follow it. `weight` (0 light .. 1 heavy) deepens the hum. */
  public updateEngine(speedRatio: number, weight = 0.5) {
    if (!this.ctx || !this.engineOsc || !this.engineFilter || !this.engineGain) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    const r = Math.max(0, Math.min(1, speedRatio)); const now = this.ctx.currentTime; const deep = 1 - 0.25 * Math.max(0, Math.min(1, weight));
    this.engineOsc.frequency.setTargetAtTime((42 + r * 65) * deep, now, 0.05);
    this.engineFilter.frequency.setTargetAtTime(120 + r * 220, now, 0.05);
    this.engineGain.gain.setTargetAtTime(this.mix.enabled ? 0.03 + r * 0.08 : 0, now, 0.05);
  }

  // ------------------------------------------------------------------ weapons, hits, explosions (effects bus)
  /** `volume` 0..1 is the distance falloff for shots that are not the player's own. */
  public playWeapon(kind: WeaponSound, isPlayer = false, volume = 1) {
    if (volume <= 0.02 || this.throttled(`w:${kind}:${isPlayer}`, kind === 'machinegun' ? 40 : 25)) return;
    const pitch = (Math.random() - 0.5) * 15; const v = volume;
    switch (kind) {
      case 'cannon':
        this.blip('effects', 'sine', isPlayer ? 96 : 82, 28, 0.34, isPlayer ? 0.2 : 0.14, 0, v, 0.2);
        this.blip('effects', 'triangle', (isPlayer ? 180 : 150) + pitch, 35, 0.22, isPlayer ? 0.35 : 0.22, 0, v);
        this.noise('effects', 0.08, isPlayer ? 0.25 : 0.15, 800, 0, v, 'lowpass', 0.08); break;
      case 'machinegun':
        this.blip('effects', 'square', 480 + pitch * 4, 80, 0.045, isPlayer ? 0.12 : 0.07, 0, v); break;
      case 'missile':
        this.noise('effects', 0.45, 0.18, 1800, 0, v, 'bandpass'); this.blip('effects', 'sawtooth', 220, 520, 0.4, 0.08, 0, v); break;
      case 'laser':
        this.blip('effects', 'sawtooth', 1400 + pitch * 10, 380, 0.16, 0.1, 0, v); this.blip('effects', 'sine', 2100, 900, 0.1, 0.05, 0, v); break;
      case 'mortar':
        this.blip('effects', 'sine', 130 + pitch, 40, 0.3, 0.4, 0, v); this.noise('effects', 0.18, 0.2, 500, 0, v); break;
    }
  }
  public playCannonShot(isPlayer = false, volume = 1) { this.playWeapon('cannon', isPlayer, volume); }
  public playMachineGun(volume = 1) { this.playWeapon('machinegun', true, volume); }

  public playImpact(isArmor = true, volume = 1) {
    if (this.throttled(`hit:${isArmor}`, 35)) return;
    if (isArmor) this.blip('effects', 'sine', 950 + Math.random() * 200, 320, 0.09, 0.2, 0, volume);
    else { this.blip('effects', 'triangle', 140 + Math.random() * 40, 45, 0.13, 0.25, 0, volume); this.noise('effects', 0.06, 0.1, 400, 0, volume); }
  }
  public playExplosion(isLarge = false, volume = 1) {
    if (this.throttled('boom', 60)) return;
    const d = isLarge ? 0.7 : 0.45;
    this.blip('effects', 'sine', 110, 28, d, isLarge ? 0.45 : 0.3, 0, volume);
    this.noise('effects', d * 0.8, isLarge ? 0.35 : 0.2, 500, 0, volume);
    if (isLarge) this.noise('effects', 0.5, 0.1, 2400, 0.05, volume, 'highpass'); // debris crackle
  }
  public playPickup() { this.blip('effects', 'sine', 540, 540, 0.06, 0.18); this.blip('effects', 'sine', 820, 820, 0.14, 0.18, 0.06); }
  public playGateHum() { this.blip('effects', 'sawtooth', 220, 880, 0.55, 0.15); }
  public playLockOn() { this.blip('interface', 'sine', 880, 880, 0.05, 0.12); this.blip('interface', 'sine', 1200, 1200, 0.08, 0.12, 0.05); }
  /** Danger beep for low hull. */
  public playWarning() { if (this.throttled('warn', 900)) return; this.blip('interface', 'square', 740, 740, 0.09, 0.07); this.blip('interface', 'square', 740, 740, 0.09, 0.07, 0.14); }

  // ------------------------------------------------------------------ interface sounds (interface bus)
  public playUI(kind: UISound) {
    if (kind === 'hover' && this.throttled('ui:hover', 60)) return;
    if (kind === 'click' && this.throttled('ui:click', 25)) return;
    switch (kind) {
      case 'click': this.blip('interface', 'sine', 600, 200, 0.035, 0.08); break;
      case 'hover': this.blip('interface', 'sine', 1400, 1400, 0.02, 0.02); break;
      case 'tab': this.blip('interface', 'triangle', 520, 700, 0.05, 0.07); break;
      case 'open': this.blip('interface', 'sine', 380, 640, 0.1, 0.08); break;
      case 'close': this.blip('interface', 'sine', 640, 360, 0.09, 0.07); break;
      case 'confirm': this.blip('interface', 'sine', 660, 660, 0.07, 0.1); this.blip('interface', 'sine', 990, 990, 0.12, 0.1, 0.07); break;
      case 'deny': this.blip('interface', 'square', 220, 160, 0.14, 0.06); this.blip('interface', 'square', 180, 130, 0.14, 0.05, 0.1); break;
      case 'toast': this.blip('interface', 'triangle', 760, 760, 0.07, 0.07); this.blip('interface', 'triangle', 1010, 1010, 0.09, 0.06, 0.06); break;
      case 'equip': this.blip('interface', 'square', 300, 160, 0.06, 0.07); this.noise('interface', 0.05, 0.08, 1500, 0, 1, 'bandpass'); break;
      case 'coin': this.blip('interface', 'sine', 1320, 1320, 0.05, 0.08); this.blip('interface', 'sine', 1760, 1760, 0.16, 0.08, 0.05); break;
    }
  }
  public playUIClick() { this.playUI('click'); }

  /** Short ascending phrases for level up (triad), rank up (wider, brighter) and quest complete (two-note resolve). */
  public playFanfare(kind: Fanfare) {
    const seq: Record<Fanfare, number[]> = { levelup: [60, 64, 67, 72], rankup: [62, 67, 71, 74, 79], quest: [65, 72] };
    seq[kind].forEach((m, i) => { const f = midiFreq(m); this.blip('interface', 'triangle', f, f, kind === 'quest' ? 0.35 : 0.22, 0.14, i * 0.11); this.blip('interface', 'sine', f * 2, f * 2, 0.2, 0.04, i * 0.11); });
  }
  /** Chime when loot is revealed: more notes the rarer it is. */
  public playLootReveal(rarity: string) {
    const n = ({ Common: 1, Uncommon: 2, Rare: 3, Epic: 4, Legendary: 5 } as Record<string, number>)[rarity] ?? 1;
    for (let i = 0; i < n; i++) { const f = midiFreq(72 + [0, 4, 7, 12, 16][i]); this.blip('interface', 'sine', f, f, 0.25, 0.1, i * 0.07); }
    if (n >= 4) this.noise('interface', 0.4, 0.05, 6000, 0.1, 1, 'highpass');
  }

  // ------------------------------------------------------------------ ambient bed
  /** Starts the bed for a biome (null / unknown = silence). Re-calling with the same biome does nothing. */
  public setAmbient(biome: string | undefined) {
    const spec = ambientFor(biome); const key = spec ? biome! : '';
    if (this.ambient?.key === key) return;
    this.stopAmbient();
    const ctx = this.ctx; const dest = this.buses.effects;
    if (!spec || !ctx || !dest || !this.initialized) { this.pendingAmbient = biome; return; }
    this.pendingAmbient = undefined;
    try {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer(ctx); src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = spec.cutoff;
      const lfo = ctx.createOscillator(); lfo.frequency.value = spec.lfoHz; const depth = ctx.createGain(); depth.gain.value = spec.lfoDepth;
      lfo.connect(depth); depth.connect(f.frequency);
      const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(this.mix.ambientEnabled ? spec.gain : 0, ctx.currentTime, 1.2);
      src.connect(f); f.connect(g); g.connect(dest); src.start(); lfo.start();
      this.ambient = { src, gain: g, lfo, key, base: spec.gain };
    } catch { /* ambience is optional */ }
  }
  private pendingAmbient: string | undefined;
  private stopAmbient() {
    const a = this.ambient; this.ambient = null; if (!a || !this.ctx) return;
    a.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    setTimeout(() => { try { a.src.stop(); a.lfo.stop(); } catch { /* already stopped */ } }, 1500);
  }

  // ------------------------------------------------------------------ adaptive music
  /** Feed the situation a few times per second; the director picks the state and the scheduler follows. */
  public updateMusic(inputs: MusicInputs, dt: number) {
    const before = this.director.state;
    const s = this.director.update(inputs, dt);
    if (s !== before) { this.barNotes = []; this.musicStep = 0; } // new state starts at the next step with a fresh bar
    if (this.pendingAmbient !== undefined) this.setAmbient(this.pendingAmbient);
  }
  public get musicState(): MusicState { return this.musicOverride ?? this.director.state; }
  /** Forces a state (title screen, tests); null returns control to the director. */
  public forceMusicState(s: MusicState | null) { this.musicOverride = s; this.barNotes = []; this.musicStep = 0; }

  private musicWanted(): boolean { return this.initialized && this.mix.enabled && this.mix.musicEnabled && this.mix.music > 0.001 && (typeof document === 'undefined' || !document.hidden); }
  private syncMusic() {
    if (this.musicWanted()) {
      if (this.musicTimer || !this.ctx) return;
      this.nextStepAt = this.ctx.currentTime + 0.15;
      this.musicTimer = setInterval(() => this.scheduleMusic(), 120);
    } else if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
  private scheduleMusic() {
    const ctx = this.ctx; if (!ctx) return;
    if (!this.musicWanted()) { this.syncMusic(); return; }
    if (ctx.state !== 'running') return;
    const state = this.musicState; const step = stepSeconds(state);
    if (this.nextStepAt < ctx.currentTime) this.nextStepAt = ctx.currentTime + 0.05; // fell behind (tab was throttled)
    while (this.nextStepAt < ctx.currentTime + 0.4) {
      if (this.barNotes.length === 0) this.barNotes = buildBar(state, this.musicBar, this.seed);
      for (const n of this.barNotes) if (n.step === this.musicStep) this.playNote(n, this.nextStepAt, step);
      this.musicStep++;
      if (this.musicStep >= STEPS_PER_BAR) { this.musicStep = 0; this.musicBar++; this.barNotes = []; }
      this.nextStepAt += step;
    }
  }
  private playNote(n: MusicNote, at: number, step: number) {
    const ctx = this.ctx; const dest = this.buses.music; if (!ctx || !dest) return;
    const dur = n.dur * step; const f = midiFreq(n.midi);
    const osc = ctx.createOscillator(); const g = ctx.createGain(); const lp = ctx.createBiquadFilter();
    osc.type = n.voice === 'pad' ? 'triangle' : n.voice === 'bass' ? 'sine' : 'square';
    osc.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = n.voice === 'lead' ? 1400 : n.voice === 'pad' ? 900 : 400;
    const peak = 0.12 * n.vel * (n.voice === 'lead' ? 0.5 : 1);
    const attack = n.voice === 'pad' ? Math.min(0.5, dur * 0.4) : 0.01;
    g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(peak, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + dur + (n.voice === 'pad' ? 0.3 : 0.05));
    osc.connect(lp); lp.connect(g); g.connect(dest); osc.start(at); osc.stop(at + dur + 0.4);
  }
}

export const soundEngine = new SoundEngine();
