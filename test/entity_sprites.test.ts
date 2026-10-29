import { describe, expect, it } from 'vitest';
import type { SimEntity } from '../shared/types.ts';
import { selectEntitySpritePath } from '../src/render/entitySprites.ts';
import { shouldPreloadSprite } from '../src/render/assets.ts';

const paths = new Set([
  '/assets/enemies/scout_buggy.png',
  '/assets/enemies/scout_buggy_elite.png',
  '/assets/vehicles/8_heavy_body.png',
  '/assets/vehicles/8_heavy_body_damaged.png',
  '/assets/vehicles/8_heavy_body_wreck.png',
  '/assets/vehicles/8_support_body.png',
]);

function entity(overrides: Partial<SimEntity> = {}): SimEntity {
  return {
    id: 1,
    kind: 'scout_buggy',
    name: 'Test',
    level: 40,
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    chassisAngle: 0,
    turretAngle: 0,
    radius: 10,
    hull: 100,
    maxHull: 100,
    armor: 100,
    maxArmor: 100,
    armorRegenTimer: 0,
    flatArmorReduction: 0,
    critChance: 0,
    maxSpeed: 0,
    turnRate: 0,
    turretTurnRate: 0,
    targetSpeed: 0,
    mainReloadRemaining: 0,
    mainReloadTime: 0,
    mainDamage: 0,
    mainRange: 0,
    mainProjectileSpeed: 0,
    selectedAmmo: 'STANDARD',
    ammoInventory: { STANDARD: -1, REINFORCED: 0, ARMOR_PIERCING: 0, SHAPED_CHARGE: 0, EXPLOSIVE: 0 },
    mgReloadRemaining: 0,
    mgReloadTime: 0,
    mgDamage: 0,
    mgRange: 0,
    abilityCooldowns: {},
    statusEffects: [],
    stunDiminishingTimer: 0,
    stunCount: 0,
    invulnerableTime: 0,
    isHostile: true,
    ...overrides,
  };
}

describe('entity sprite selection', () => {
  it('prefers listed elite art and falls back to the listed normal enemy sprite', () => {
    const elite = selectEntitySpritePath(entity({ isElite: true }), 'enemy', paths);
    expect(elite).toBe('/assets/enemies/scout_buggy_elite.png');
    expect(paths.has(elite!)).toBe(true);

    const fallbackPaths = new Set(['/assets/enemies/scout_buggy.png']);
    const fallback = selectEntitySpritePath(entity({ isElite: true }), 'enemy', fallbackPaths);
    expect(fallback).toBe('/assets/enemies/scout_buggy.png');
    expect(fallbackPaths.has(fallback!)).toBe(true);
  });

  it('selects damaged and wreck bodies below the hull threshold and suppresses unlisted variants', () => {
    const damaged = selectEntitySpritePath(
      entity({ kind: 'player', tier: 8, vehicleClass: 'heavy', hull: 39, maxHull: 100 }),
      'vehicle',
      paths,
    );
    const wreck = selectEntitySpritePath(
      entity({ kind: 'player', tier: 8, vehicleClass: 'heavy', hull: 0, maxHull: 100, isWreck: true }),
      'vehicle',
      paths,
    );
    expect(damaged).toBe('/assets/vehicles/8_heavy_body_damaged.png');
    expect(wreck).toBe('/assets/vehicles/8_heavy_body_wreck.png');

    const fallbackPaths = new Set(['/assets/vehicles/8_heavy_body.png']);
    const fallback = selectEntitySpritePath(
      entity({ kind: 'player', tier: 8, vehicleClass: 'heavy', hull: 39, maxHull: 100 }),
      'vehicle',
      fallbackPaths,
    );
    expect(fallback).toBe('/assets/vehicles/8_heavy_body.png');
    expect(fallbackPaths.has(fallback!)).toBe(true);
  });

  it('uses the normal body at exactly 40 percent hull and returns no unlisted path', () => {
    const healthy = selectEntitySpritePath(
      entity({ kind: 'player', tier: 8, vehicleClass: 'heavy', hull: 40, maxHull: 100 }),
      'vehicle',
      paths,
    );
    expect(healthy).toBe('/assets/vehicles/8_heavy_body.png');
    expect(selectEntitySpritePath(entity({ isElite: true }), 'enemy', new Set())).toBeUndefined();
  });

  it('defers tier 7-10 damaged and wreck bodies from startup preload', () => {
    expect(shouldPreloadSprite('/assets/vehicles/8_heavy_body_damaged.png')).toBe(false);
    expect(shouldPreloadSprite('/assets/vehicles/10_support_body_wreck.png')).toBe(false);
    expect(shouldPreloadSprite('/assets/vehicles/8_heavy_body.png')).toBe(true);
    expect(shouldPreloadSprite('/assets/enemies/scout_buggy_elite.png')).toBe(true);

    for (const tier of [7, 8, 9, 10]) {
      for (const vehicleClass of ['scout', 'medium', 'heavy', 'artillery', 'support'] as const) {
        for (const state of ['damaged', 'wreck'] as const) {
          const path = `/assets/vehicles/${tier}_${vehicleClass}_body_${state}.png`;
          expect(shouldPreloadSprite(path)).toBe(false);
          const selected = selectEntitySpritePath(
            entity({
              kind: 'player',
              tier,
              vehicleClass,
              hull: state === 'damaged' ? 39 : 0,
              maxHull: 100,
              isWreck: state === 'wreck',
            }),
            'vehicle',
            new Set([path, `/assets/vehicles/${tier}_${vehicleClass}_body.png`]),
          );
          expect(selected).toBe(path);
        }
      }
    }
  });
});
