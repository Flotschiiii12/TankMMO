import { describe, expect, it } from 'vitest';
import { consumeAmmo, getAmmoDamageMultiplier } from '../shared/rules/ammo.ts';
import { AmmoType } from '../shared/types.ts';

describe('Ammo Rules (Section 2)', () => {
  it('handles standard ammo with unlimited capacity and 1.0x damage', () => {
    const mult = getAmmoDamageMultiplier('STANDARD', 'scout_buggy');
    expect(mult).toBe(1.0);

    const inv: Record<AmmoType, number> = {
      STANDARD: -1,
      REINFORCED: 0,
      ARMOR_PIERCING: 0,
      SHAPED_CHARGE: 0,
      EXPLOSIVE: 0,
    };
    const res = consumeAmmo(inv, 'STANDARD');
    expect(res.effectiveAmmo).toBe('STANDARD');
  });

  it('applies reinforced ammo 1.25x damage multiplier', () => {
    const mult = getAmmoDamageMultiplier('REINFORCED', 'gunner_truck');
    expect(mult).toBe(1.25);
  });

  it('applies shaped charge 1.6x vs bosses/bunkers and 0.7x vs vehicles', () => {
    const bossMult = getAmmoDamageMultiplier('SHAPED_CHARGE', 'boss');
    expect(bossMult).toBe(1.6);

    const bunkerMult = getAmmoDamageMultiplier('SHAPED_CHARGE', 'bunker_turret');
    expect(bunkerMult).toBe(1.6);

    const vehicleMult = getAmmoDamageMultiplier('SHAPED_CHARGE', 'scout_buggy');
    expect(vehicleMult).toBe(0.7);
  });

  it('applies armor piercing 1.0x vs light/medium and 0.8x vs heavy bodies', () => {
    const lightMult = getAmmoDamageMultiplier('ARMOR_PIERCING', 'player', 'scout');
    expect(lightMult).toBe(1.0);

    const heavyMult = getAmmoDamageMultiplier('ARMOR_PIERCING', 'player', 'heavy');
    expect(heavyMult).toBe(0.8);
  });

  it('applies explosive ammo 0.85x with 60px splash', () => {
    const mult = getAmmoDamageMultiplier('EXPLOSIVE', 'gunner_truck');
    expect(mult).toBe(0.85);
  });

  it('falls back to STANDARD when special ammo stack is exhausted', () => {
    const emptyInv: Record<AmmoType, number> = {
      STANDARD: -1,
      REINFORCED: 0,
      ARMOR_PIERCING: 0,
      SHAPED_CHARGE: 0,
      EXPLOSIVE: 0,
    };

    const res = consumeAmmo(emptyInv, 'REINFORCED');
    expect(res.effectiveAmmo).toBe('STANDARD');

    const availableInv: Record<AmmoType, number> = {
      ...emptyInv,
      REINFORCED: 5,
    };
    const res2 = consumeAmmo(availableInv, 'REINFORCED');
    expect(res2.effectiveAmmo).toBe('REINFORCED');
    expect(res2.newInventory.REINFORCED).toBe(4);
  });
});
