import { describe, expect, it } from 'vitest';
import { ambientTintCss, ambientTintForTimeOfDay, blendAmbientTint } from '../src/render/lighting.ts';
import { colorGradeCss, DEFAULT_MAP_COLOR_GRADE } from '../src/render/postProcessing.ts';
import { DEFAULT_SUN_DIRECTION } from '../shared/types.ts';
import { WORLD_MAP_CATALOG } from '../shared/data/maps.ts';

describe('client render lighting', () => {
  it('provides a finite sun direction for every map, with per-map overrides and a default', () => {
    expect(Object.keys(WORLD_MAP_CATALOG)).toHaveLength(30);
    for (const map of Object.values(WORLD_MAP_CATALOG)) {
      expect(map.sunDirection?.x).toEqual(expect.any(Number));
      expect(map.sunDirection?.y).toEqual(expect.any(Number));
      expect(Math.hypot(map.sunDirection!.x, map.sunDirection!.y)).toBeGreaterThan(0);
    }
    expect(WORLD_MAP_CATALOG[1].sunDirection).not.toEqual(DEFAULT_SUN_DIRECTION);
    expect(WORLD_MAP_CATALOG[2].sunDirection).toEqual(DEFAULT_SUN_DIRECTION);
  });

  it('blends map time-of-day tints gradually and formats a canvas fill style', () => {
    const noon = ambientTintForTimeOfDay('noon');
    const night = ambientTintForTimeOfDay('night');
    const firstStep = blendAmbientTint(noon, night, 0.1);
    expect(firstStep.a).toBeGreaterThan(noon.a);
    expect(firstStep.a).toBeLessThan(night.a);
    expect(blendAmbientTint(noon, night, 30).a).toBeCloseTo(night.a, 3);
    expect(ambientTintCss(night)).toMatch(/^rgba\(\d+, \d+, \d+, 0\.38\)$/);
  });

  it('uses subtle per-map color grades with a renderer fallback', () => {
    expect(WORLD_MAP_CATALOG[1].colorGrade).toEqual({ r: 255, g: 239, b: 218, a: 0.035 });
    expect(WORLD_MAP_CATALOG[2].colorGrade).toBeUndefined();
    expect(colorGradeCss(WORLD_MAP_CATALOG[2].colorGrade)).toBe(colorGradeCss(DEFAULT_MAP_COLOR_GRADE));
    expect(colorGradeCss({ r: 400, g: -20, b: 128, a: 1 })).toBe('rgba(255, 0, 128, 0.08)');
  });
});
