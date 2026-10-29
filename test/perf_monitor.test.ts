import { describe, expect, it } from 'vitest';
import { chooseInitialGraphicsQuality, dprCap, graphicsQualityFor, GRAPHICS_PRESETS, needsInitialQualityProbe, PerfMonitor, STARTUP_QUALITY_SAMPLE_COUNT, StartupQualityProbe } from '../src/ui/perfMonitor.ts';

describe('performance mode trigger', () => {
  const run = (m: PerfMonitor, ms: number, seconds: number) => { let fired = 0; for (let t = 0; t < seconds * 1000; t += ms) if (m.frame(ms)) fired++; return fired; };
  it('fires once after 5 s of frames above 22 ms and never for a healthy game', () => {
    expect(run(new PerfMonitor(), 16.7, 60)).toBe(0);
    expect(run(new PerfMonitor(), 21, 60)).toBe(0);
    const m = new PerfMonitor();
    expect(run(m, 30, 4.5)).toBe(0);
    expect(run(m, 30, 1)).toBe(1);
    expect(run(m, 30, 20)).toBe(0); // only once
  });
  it('a short stutter resets the streak; tab pauses and garbage are ignored', () => {
    const m = new PerfMonitor();
    expect(run(m, 40, 4)).toBe(0);
    expect(run(m, 10, 3)).toBe(0); // recovers: counter back to 0
    expect(run(m, 40, 4)).toBe(0);
    expect(m.frame(5000)).toBe(false); expect(m.frame(NaN)).toBe(false); expect(m.frame(-3)).toBe(false);
    expect(run(new PerfMonitor(), 40, 4.9)).toBe(0);
  });
  it('uses the right DPR, particle and movement budgets for all four quality levels', () => {
    expect(dprCap('high')).toBe(2); expect(dprCap('medium')).toBe(1.75); expect(dprCap('low')).toBe(1.35); expect(dprCap('off')).toBe(1);
    expect(GRAPHICS_PRESETS.high.particleCap).toBeGreaterThan(GRAPHICS_PRESETS.medium.particleCap);
    expect(GRAPHICS_PRESETS.medium.particleCap).toBeGreaterThan(GRAPHICS_PRESETS.low.particleCap);
    expect(GRAPHICS_PRESETS.off.particlesEnabled).toBe(false);
    expect(GRAPHICS_PRESETS.off.motionScale).toBe(0);
  });
  it('migrates legacy settings and only probes profiles without an explicit quality choice', () => {
    expect(graphicsQualityFor({})).toBe('high');
    expect(graphicsQualityFor({ performanceMode: true })).toBe('low');
    expect(graphicsQualityFor({ reducedEffects: true })).toBe('low');
    expect(graphicsQualityFor({ graphicsQuality: 'medium', performanceMode: true })).toBe('medium');
    expect(needsInitialQualityProbe({})).toBe(true);
    expect(needsInitialQualityProbe({ perfAutoDone: true })).toBe(false);
    expect(needsInitialQualityProbe({ graphicsQuality: 'high' })).toBe(false);
  });
  it('selects startup quality from a short sample and ignores suspended-tab pauses', () => {
    expect(chooseInitialGraphicsQuality(Array(STARTUP_QUALITY_SAMPLE_COUNT).fill(16.7))).toBe('high');
    expect(chooseInitialGraphicsQuality(Array(STARTUP_QUALITY_SAMPLE_COUNT).fill(24))).toBe('medium');
    expect(chooseInitialGraphicsQuality(Array(STARTUP_QUALITY_SAMPLE_COUNT).fill(35))).toBe('low');
    expect(chooseInitialGraphicsQuality(Array(STARTUP_QUALITY_SAMPLE_COUNT).fill(80))).toBe('off');
    const probe = new StartupQualityProbe();
    expect(probe.frame(1000)).toBeNull();
    for (let i = 0; i < STARTUP_QUALITY_SAMPLE_COUNT - 1; i++) expect(probe.frame(16.7)).toBeNull();
    expect(probe.frame(16.7)).toBe('high');
    expect(probe.frame(16.7)).toBeNull();
  });
});
