import { describe, expect, it } from 'vitest';
import { AMMO_CONFIGS } from '../shared/rules/ammo.ts';
import {
  getProjectileStyle,
  PROJECTILE_STYLES,
  WEAPON_FAMILIES,
  type WeaponFamily,
} from '../src/render/projectileStyles.ts';

const AMMO_TYPES = Object.keys(AMMO_CONFIGS) as Array<keyof typeof AMMO_CONFIGS>;

describe('projectile styles', () => {
  it('returns a complete, renderable style for every weapon-family and ammo combination', () => {
    for (const family of WEAPON_FAMILIES) {
      for (const ammo of AMMO_TYPES) {
        const style = getProjectileStyle(family, ammo);
        expect(style).toBe(PROJECTILE_STYLES[family][ammo]);
        expect(style.glow).toMatch(/^#[\da-f]{6}$/i);
        expect(style.shape).toBeTruthy();
        expect(style.impact).toBeTruthy();
        expect(style.muzzle).toBeTruthy();
        expect(style.length).toBeGreaterThan(0);
        expect(style.width).toBeGreaterThan(0);
      }
    }
  });

  it('keeps ammo identities distinguishable by silhouette as well as color', () => {
    const cannonAmmo = AMMO_TYPES.map((ammo) => getProjectileStyle('cannon', ammo));
    expect(new Set(cannonAmmo.map((style) => style.glow)).size).toBe(AMMO_TYPES.length);
    expect(new Set(cannonAmmo.map((style) => style.shape)).size).toBe(AMMO_TYPES.length);
  });

  it('keeps family motion and muzzle details distinct and falls back safely', () => {
    const families = WEAPON_FAMILIES.map((family: WeaponFamily) => getProjectileStyle(family));
    expect(getProjectileStyle('unknown', 'unknown')).toBe(getProjectileStyle('cannon', 'STANDARD'));
    expect(families.find((style) => style.rotation === 'tumble')).toBe(getProjectileStyle('mortar'));
    expect(families.some((style) => style.trail.lightLine)).toBe(true);
    expect(families.some((style) => style.trail.flame)).toBe(true);
  });
});
