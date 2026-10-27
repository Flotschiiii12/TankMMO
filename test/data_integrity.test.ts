import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS_CATALOG } from '../shared/data/achievements.ts';
import { ENEMY_ARCHETYPES } from '../shared/data/enemies.ts';
import { t } from '../shared/data/i18n.ts';
import { ITEM_CATALOG } from '../shared/data/items.ts';
import { RANKS_CATALOG } from '../shared/data/ranks.ts';
import { TALENTS_CATALOG } from '../shared/data/talents.ts';
import { VEHICLE_CATALOG } from '../shared/data/vehicles.ts';

describe('Data Catalog Integrity (Milestone 2)', () => {
  it('contains exactly 50 vehicles across 5 classes and 10 tiers', () => {
    expect(VEHICLE_CATALOG.length).toBe(50);

    const classes = ['scout', 'medium', 'heavy', 'artillery', 'support'] as const;
    for (const c of classes) {
      const classVehicles = VEHICLE_CATALOG.filter(v => v.vehicleClass === c);
      expect(classVehicles.length).toBe(10);

      // Verify tier ordering and stat scaling
      for (let t = 1; t <= 10; t++) {
        const v = classVehicles.find(item => item.tier === t);
        expect(v).toBeDefined();
        expect(v!.minLevel).toBeGreaterThan(0);
        if (t > 1) {
          const prev = classVehicles.find(item => item.tier === t - 1)!;
          expect(v!.baseHull).toBeGreaterThan(prev.baseHull);
          expect(v!.baseArmor).toBeGreaterThan(prev.baseArmor);
          expect(v!.baseDamage).toBeGreaterThan(prev.baseDamage);
          expect(v!.baseSpeed).toBeGreaterThanOrEqual(prev.baseSpeed);
        }
      }
    }
  });

  it('contains all equipment families and items catalog', () => {
    // 48 main + 24 secondary + 32 armor + 24 engine + 20 module + 40 drone = 188 items
    expect(ITEM_CATALOG.length).toBe(188);

    const mainWeapons = ITEM_CATALOG.filter(i => i.slotType === 'main');
    expect(mainWeapons.length).toBe(48); // 6 families x 8 tiers

    const secondary = ITEM_CATALOG.filter(i => i.slotType === 'secondary');
    expect(secondary.length).toBe(24); // 4 families x 6 tiers

    const armors = ITEM_CATALOG.filter(i => i.slotType === 'armor');
    expect(armors.length).toBe(32); // 4 families x 8 tiers

    const engines = ITEM_CATALOG.filter(i => i.slotType === 'engine');
    expect(engines.length).toBe(24); // 3 families x 8 tiers

    const modules = ITEM_CATALOG.filter(i => i.slotType === 'module');
    expect(modules.length).toBe(20);

    const drones = ITEM_CATALOG.filter(i => i.slotType === 'drone');
    expect(drones.length).toBe(40); // 8 types x 5 tiers
  });

  it('contains all 21 honor ranks in ascending order', () => {
    expect(RANKS_CATALOG.length).toBe(21);
    for (let i = 1; i < RANKS_CATALOG.length; i++) {
      expect(RANKS_CATALOG[i].honorRequired).toBeGreaterThan(RANKS_CATALOG[i - 1].honorRequired);
    }
  });

  it('contains all 36 talents across 3 branches', () => {
    expect(TALENTS_CATALOG.length).toBe(36);
    const offense = TALENTS_CATALOG.filter(t => t.branch === 'offense');
    const defense = TALENTS_CATALOG.filter(t => t.branch === 'defense');
    const logistics = TALENTS_CATALOG.filter(t => t.branch === 'logistics');

    expect(offense.length).toBe(12);
    expect(defense.length).toBe(12);
    expect(logistics.length).toBe(12);
  });

  it('contains 50+ achievements', () => {
    expect(ACHIEVEMENTS_CATALOG.length).toBeGreaterThanOrEqual(50);
  });

  it('translates keys in English and German via i18n layer', () => {
    expect(t('class.scout', 'en')).toBe('Scout');
    expect(t('class.scout', 'de')).toBe('Aufklärer');

    expect(t('ammo.reinforced', 'en')).toBe('Reinforced Heavy Munition');
    expect(t('ammo.reinforced', 'de')).toBe('Verstärkte Schwerlastmunition');

    expect(t('ui.safe_zone', 'en')).toBe('SAFE ZONE');
    expect(t('ui.safe_zone', 'de')).toBe('SICHERHEITSZONE');
  });
});
