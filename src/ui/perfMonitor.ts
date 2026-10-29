export type GraphicsQuality = 'high' | 'medium' | 'low' | 'off';

export interface GraphicsQualitySettings {
  graphicsQuality?: GraphicsQuality;
  performanceMode?: boolean;
  reducedEffects?: boolean;
}

export interface GraphicsPreset {
  dpr: number;
  particleCap: number;
  treadCap: number;
  reducedEffects: boolean;
  plainGround: boolean;
  particlesEnabled: boolean;
  motionScale: number;
  shakeScale: number;
}

export const GRAPHICS_PRESETS: Record<GraphicsQuality, GraphicsPreset> = {
  high: { dpr: 2, particleCap: 600, treadCap: 300, reducedEffects: false, plainGround: false, particlesEnabled: true, motionScale: 1, shakeScale: 1 },
  medium: { dpr: 1.75, particleCap: 300, treadCap: 150, reducedEffects: false, plainGround: false, particlesEnabled: true, motionScale: 0.75, shakeScale: 0.75 },
  low: { dpr: 1.35, particleCap: 120, treadCap: 60, reducedEffects: true, plainGround: true, particlesEnabled: true, motionScale: 0.35, shakeScale: 0.3 },
  off: { dpr: 1, particleCap: 60, treadCap: 0, reducedEffects: true, plainGround: true, particlesEnabled: false, motionScale: 0, shakeScale: 0 },
};

const QUALITY_VALUES: readonly GraphicsQuality[] = ['high', 'medium', 'low', 'off'];
export const graphicsQualityFor = (settings: GraphicsQualitySettings): GraphicsQuality => {
  if (settings.graphicsQuality && QUALITY_VALUES.includes(settings.graphicsQuality)) return settings.graphicsQuality;
  return settings.performanceMode || settings.reducedEffects ? 'low' : 'high';
};

export function needsInitialQualityProbe(settings: GraphicsQualitySettings & { qualityAutoDone?: boolean; perfAutoDone?: boolean }): boolean {
  return !settings.graphicsQuality && !settings.performanceMode && !settings.reducedEffects && !settings.qualityAutoDone && !settings.perfAutoDone;
}

export const STARTUP_QUALITY_SAMPLE_COUNT = 45;

export function chooseInitialGraphicsQuality(samples: readonly number[]): GraphicsQuality {
  const valid = samples.filter((ms) => Number.isFinite(ms) && ms > 0 && ms <= 250).sort((a, b) => a - b);
  if (!valid.length) return 'medium';
  const average = valid.reduce((sum, ms) => sum + ms, 0) / valid.length;
  const p95 = valid[Math.min(valid.length - 1, Math.floor(valid.length * 0.95))];
  if (average <= 18 && p95 <= 25) return 'high';
  if (average <= 26 && p95 <= 40) return 'medium';
  if (average <= 44 && p95 <= 66) return 'low';
  return 'off';
}

/** Collects one short startup sample without counting debugger pauses or suspended-tab frames. */
export class StartupQualityProbe {
  private samples: number[] = [];
  private finished = false;

  frame(dtMs: number): GraphicsQuality | null {
    if (this.finished || !Number.isFinite(dtMs) || dtMs <= 0 || dtMs > 250) return null;
    this.samples.push(dtMs);
    if (this.samples.length < STARTUP_QUALITY_SAMPLE_COUNT) return null;
    this.finished = true;
    return chooseInitialGraphicsQuality(this.samples);
  }
}

/**
 * Runtime fallback: when frames stay slower than `thresholdMs` for `holdSeconds` in a row, lower quality once.
 * Pure logic (no timers, no DOM) so it is unit tested; GameShell feeds it the frame deltas.
 */
export class PerfMonitor {
  private slowSeconds = 0;
  private ema = 0;
  private fired = false;
  constructor(private thresholdMs = 22, private holdSeconds = 5) {}

  /** Feed one frame time in milliseconds. Returns true exactly once, when the slow streak has lasted long enough. */
  frame(dtMs: number): boolean {
    if (this.fired || !Number.isFinite(dtMs) || dtMs <= 0) return false;
    if (dtMs > 500) return false; // a tab switch or a debugger pause is not slowness
    this.ema = this.ema === 0 ? dtMs : this.ema * 0.9 + dtMs * 0.1;
    if (this.ema > this.thresholdMs) this.slowSeconds += dtMs / 1000; else this.slowSeconds = 0;
    if (this.slowSeconds >= this.holdSeconds) { this.fired = true; return true; }
    return false;
  }
  /** Allow the monitor to fire again after a deliberate graphics-quality change (primarily for tests). */
  reset(): void { this.slowSeconds = 0; this.ema = 0; this.fired = false; }
  get smoothedMs(): number { return this.ema; }
}

export const dprCap = (quality: GraphicsQuality): number => GRAPHICS_PRESETS[quality].dpr;
