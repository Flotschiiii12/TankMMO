import type { AmmoType } from '../sim/types.ts';

export const WEAPON_FAMILIES = ['cannon', 'rapid_fire', 'rocket', 'mortar', 'railgun', 'flamethrower'] as const;
export type WeaponFamily = typeof WEAPON_FAMILIES[number];
export type ProjectileShape = 'round' | 'block' | 'dart' | 'cone' | 'burst';
export type ProjectileRotation = 'velocity' | 'tumble' | 'spin';
export const PROJECTILE_TRAIL_SIMPLIFY_THRESHOLD = 24;

export function shouldSimplifyProjectileTrails(visibleProjectileCount: number, reducedEffects: boolean): boolean {
  return reducedEffects || visibleProjectileCount > PROJECTILE_TRAIL_SIMPLIFY_THRESHOLD;
}

export interface ProjectileStyle {
  spriteId: 'fx_18' | 'fx_19' | null;
  length: number;
  width: number;
  glow: string;
  core: string;
  shape: ProjectileShape;
  rotation: ProjectileRotation;
  trail: { length: number; smoke: boolean; sparks: boolean; flame: boolean; lightLine: boolean };
  muzzle: { spriteId: string | null; color: string; size: number; shape: 'blast' | 'burst' | 'backblast' | 'cloud' | 'beam' | 'cone' };
  impact: { color: string; pressureRadius: number; sparkCount: number; shape: ProjectileShape };
}

interface AmmoStyle {
  glow: string;
  core: string;
  shape: ProjectileShape;
  widthScale: number;
  lengthScale: number;
  impact: { color: string; pressureRadius: number; sparkCount: number };
}

const AMMO_STYLES: Record<AmmoType, AmmoStyle> = {
  STANDARD: {
    glow: '#fde047', core: '#fff7b2', shape: 'round', widthScale: 1, lengthScale: 1,
    impact: { color: '#fbbf24', pressureRadius: 16, sparkCount: 5 },
  },
  REINFORCED: {
    glow: '#fb923c', core: '#ffedd5', shape: 'block', widthScale: 1.3, lengthScale: 1.05,
    impact: { color: '#fb923c', pressureRadius: 24, sparkCount: 8 },
  },
  ARMOR_PIERCING: {
    glow: '#38bdf8', core: '#e0f2fe', shape: 'dart', widthScale: 0.62, lengthScale: 1.35,
    impact: { color: '#38bdf8', pressureRadius: 18, sparkCount: 7 },
  },
  SHAPED_CHARGE: {
    glow: '#f97316', core: '#fef3c7', shape: 'cone', widthScale: 0.9, lengthScale: 1.2,
    impact: { color: '#fb923c', pressureRadius: 30, sparkCount: 9 },
  },
  EXPLOSIVE: {
    glow: '#ef4444', core: '#fee2e2', shape: 'burst', widthScale: 1.45, lengthScale: 0.95,
    impact: { color: '#ef4444', pressureRadius: 60, sparkCount: 12 },
  },
};

interface FamilyStyle {
  spriteId: ProjectileStyle['spriteId'];
  scale: number;
  trailLength: number;
  smoke: boolean;
  sparks: boolean;
  flame: boolean;
  lightLine: boolean;
  rotation: ProjectileRotation;
  muzzle: ProjectileStyle['muzzle'];
}

const FAMILY_STYLES: Record<WeaponFamily, FamilyStyle> = {
  cannon: {
    spriteId: 'fx_18', scale: 1, trailLength: 22, smoke: false, sparks: true, flame: false, lightLine: false, rotation: 'velocity',
    muzzle: { spriteId: 'fx_13', color: '#fbbf24', size: 34, shape: 'blast' },
  },
  rapid_fire: {
    spriteId: 'fx_19', scale: 0.68, trailLength: 17, smoke: false, sparks: false, flame: false, lightLine: false, rotation: 'spin',
    muzzle: { spriteId: 'fx_14', color: '#fde047', size: 20, shape: 'burst' },
  },
  rocket: {
    spriteId: 'fx_18', scale: 1.2, trailLength: 30, smoke: true, sparks: true, flame: true, lightLine: false, rotation: 'velocity',
    muzzle: { spriteId: 'fx_15', color: '#fb923c', size: 38, shape: 'backblast' },
  },
  mortar: {
    spriteId: 'fx_18', scale: 1.2, trailLength: 24, smoke: true, sparks: true, flame: false, lightLine: false, rotation: 'tumble',
    muzzle: { spriteId: 'fx_16', color: '#f97316', size: 31, shape: 'cloud' },
  },
  railgun: {
    spriteId: 'fx_19', scale: 0.8, trailLength: 42, smoke: false, sparks: true, flame: false, lightLine: true, rotation: 'spin',
    muzzle: { spriteId: 'fx_17', color: '#67e8f9', size: 36, shape: 'beam' },
  },
  flamethrower: {
    spriteId: null, scale: 1.35, trailLength: 18, smoke: false, sparks: true, flame: true, lightLine: false, rotation: 'velocity',
    muzzle: { spriteId: null, color: '#fb923c', size: 42, shape: 'cone' },
  },
};

function makeStyle(family: FamilyStyle, ammo: AmmoStyle): ProjectileStyle {
  return {
    spriteId: family.spriteId,
    length: 14 * family.scale * ammo.lengthScale,
    width: 5 * family.scale * ammo.widthScale,
    glow: ammo.glow,
    core: ammo.core,
    shape: ammo.shape,
    rotation: family.rotation,
    trail: {
      length: family.trailLength * ammo.lengthScale,
      smoke: family.smoke,
      sparks: family.sparks,
      flame: family.flame,
      lightLine: family.lightLine,
    },
    muzzle: family.muzzle,
    impact: { ...ammo.impact, shape: ammo.shape },
  };
}

function ammoTable(family: FamilyStyle): Record<AmmoType, ProjectileStyle> {
  return {
    STANDARD: makeStyle(family, AMMO_STYLES.STANDARD),
    REINFORCED: makeStyle(family, AMMO_STYLES.REINFORCED),
    ARMOR_PIERCING: makeStyle(family, AMMO_STYLES.ARMOR_PIERCING),
    SHAPED_CHARGE: makeStyle(family, AMMO_STYLES.SHAPED_CHARGE),
    EXPLOSIVE: makeStyle(family, AMMO_STYLES.EXPLOSIVE),
  };
}

export const PROJECTILE_STYLES = {
  cannon: ammoTable(FAMILY_STYLES.cannon),
  rapid_fire: ammoTable(FAMILY_STYLES.rapid_fire),
  rocket: ammoTable(FAMILY_STYLES.rocket),
  mortar: ammoTable(FAMILY_STYLES.mortar),
  railgun: ammoTable(FAMILY_STYLES.railgun),
  flamethrower: ammoTable(FAMILY_STYLES.flamethrower),
} satisfies Record<WeaponFamily, Record<AmmoType, ProjectileStyle>>;

const AMMO_TYPES: readonly AmmoType[] = ['STANDARD', 'REINFORCED', 'ARMOR_PIERCING', 'SHAPED_CHARGE', 'EXPLOSIVE'];

function isWeaponFamily(value: string): value is WeaponFamily {
  return Object.hasOwn(FAMILY_STYLES, value);
}

function isAmmoType(value: string): value is AmmoType {
  return AMMO_TYPES.some((ammo) => ammo === value);
}

export function getProjectileStyle(family?: string, ammo?: string): ProjectileStyle {
  const resolvedFamily = family && isWeaponFamily(family) ? family : 'cannon';
  const resolvedAmmo = ammo && isAmmoType(ammo) ? ammo : 'STANDARD';
  return PROJECTILE_STYLES[resolvedFamily][resolvedAmmo];
}

export function familyProjectileScale(family?: string): number {
  return family && isWeaponFamily(family) ? FAMILY_STYLES[family].scale : FAMILY_STYLES.cannon.scale;
}

export function familyMuzzleStyle(family?: string): ProjectileStyle['muzzle'] {
  return family && isWeaponFamily(family) ? FAMILY_STYLES[family].muzzle : FAMILY_STYLES.cannon.muzzle;
}
