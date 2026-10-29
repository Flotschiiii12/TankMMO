import { describe, expect, it } from 'vitest';
import { loadProgress, type LoadStage } from '../src/ui/title/loadProgress.ts';
import { TIPS, tipAt } from '../src/ui/title/tips.ts';

describe('loading screen', () => {
  const stages: LoadStage[] = ['server', 'login', 'connect', 'world', 'ready'];
  it('progress is monotonic across stages and creeps without overshooting', () => {
    let prev = -1;
    for (const s of stages) {
      const start = loadProgress(s, 0); const late = loadProgress(s, 60_000);
      expect(start).toBeGreaterThanOrEqual(prev);
      expect(late).toBeGreaterThanOrEqual(start);
      expect(late).toBeLessThanOrEqual(1);
      prev = late;
    }
    expect(loadProgress('ready', 0)).toBe(1);
    expect(loadProgress('connect', 60_000)).toBeLessThan(loadProgress('world', 0));
  });
  it('has 60+ tips in both languages, unique and short', () => {
    expect(TIPS.length).toBeGreaterThanOrEqual(60);
    for (const lang of ['en', 'de'] as const) {
      const all = TIPS.map((t) => t[lang]);
      expect(new Set(all).size).toBe(all.length);
      for (const t of all) { expect(t.length).toBeGreaterThan(20); expect(t.length).toBeLessThan(170); }
    }
    expect(tipAt(-1, 'en')).toBe(TIPS[TIPS.length - 1].en);
    expect(tipAt(TIPS.length, 'de')).toBe(TIPS[0].de);
  });
  it('keeps loading tips aligned with guided shots and current graphics settings', () => {
    const terrainTip = TIPS.find((tip) => tip.en.startsWith('Walls and rocks'));
    expect(terrainTip?.en).toContain('Shells can fly over obstacles');
    expect(terrainTip?.de).toContain('Geschosse fliegen darüber hinweg');
    expect(TIPS.some((tip) => tip.en.includes('Performance mode') || tip.de.includes('Leistungsmodus'))).toBe(false);
  });
});
