import { describe, expect, it } from 'vitest';
import { CRAFTING_RECIPES, ITEM_CATALOG } from '../shared/data/items.ts';
import { SimRNG } from '../shared/prng.ts';
import * as C from '../shared/rules/character.ts';
import { getCumulativeXP } from '../shared/rules/progression.ts';

const rich = (ch: C.CharacterState) => {
  ch.wallet.scrap = 1e9; ch.wallet.fragments = 1e6;
  ch.wallet.ore = { iron: 1e6, copper: 1e6, titanium: 1e6, crystal: 1e6 };
  return ch;
};

describe('Character: XP, talents, garage', () => {
  it('levels up by the XP curve and caps at 100', () => {
    const ch = C.createCharacter('A');
    C.grantXP(ch, getCumulativeXP(10));
    expect(ch.level).toBe(10);
    C.grantXP(ch, 1e12);
    expect(ch.level).toBe(100);
    expect(C.grantXP(ch, 1000).levelsGained).toBe(0);
  });

  it('talent points: none before 5, rank limits, level and prerequisite checks, respec costs scrap', () => {
    const ch = C.createCharacter('A');
    expect(C.talentPointsAvailable(ch)).toBe(0);
    expect(C.rankUpTalent(ch, 'off_kinetic_power')).toEqual({ ok: false, error: 'level_too_low' });
    C.grantXP(ch, getCumulativeXP(12));
    expect(C.talentPointsAvailable(ch)).toBe(8);
    for (let i = 0; i < 5; i++) expect(C.rankUpTalent(ch, 'off_kinetic_power').ok).toBe(true);
    expect(C.rankUpTalent(ch, 'off_kinetic_power')).toEqual({ ok: false, error: 'max_rank' });
    expect(C.talentTotals(ch)['main_damage']).toBeCloseTo(0.15);
    expect(C.respecTalents(ch)).toEqual({ ok: false, error: 'not_enough_scrap' });
    ch.wallet.scrap = 1e6;
    const r = C.respecTalents(ch) as any;
    expect(r.ok).toBe(true);
    expect(r.refundedPoints).toBe(5);
    expect(C.talentPointsAvailable(ch)).toBe(8);
    expect(ch.wallet.scrap).toBe(1e6 - r.cost);
  });

  it('garage: capacity by level, level and cost gates, ore payment', () => {
    const ch = C.createCharacter('A');
    expect(C.buyVehicle(ch, 'veh_heavy_t2')).toEqual({ ok: false, error: 'garage_full' });
    ch.level = 20; // capacity 3
    expect(C.buyVehicle(ch, 'veh_heavy_t2')).toEqual({ ok: false, error: 'not_enough_scrap' });
    ch.wallet.scrap = 100000; ch.wallet.ore.iron = 30; ch.wallet.ore.copper = 30;
    const r = C.buyVehicle(ch, 'veh_heavy_t2');
    expect(r.ok).toBe(true);
    expect(ch.garage).toHaveLength(2);
    expect(ch.wallet.ore.iron + ch.wallet.ore.copper).toBeLessThan(60);
    expect(C.buyVehicle(ch, 'veh_heavy_t2')).toEqual({ ok: false, error: 'already_owned' });
  });
});

describe('Inventory and workshop', () => {
  const rng = () => new SimRNG(42);
  const weapon = ITEM_CATALOG.find((i) => i.slotType === 'main' && i.tier === 1)!;

  it('capacity 60, +10 per paid expansion, hard cap 150, full inventory blocks drops', () => {
    const ch = rich(C.createCharacter('A'));
    expect(C.inventoryCapacity(ch)).toBe(60);
    for (let i = 0; i < 60; i++) expect(C.createItem(ch, weapon.id, 'Common', rng()).ok).toBe(true);
    expect(C.createItem(ch, weapon.id, 'Common', rng())).toEqual({ ok: false, error: 'inventory_full' });
    expect(C.expandInventory(ch).ok).toBe(true);
    expect(C.inventoryCapacity(ch)).toBe(70);
    for (let i = 0; i < 20; i++) C.expandInventory(ch);
    expect(C.inventoryCapacity(ch)).toBe(150);
    expect(C.expandInventory(ch)).toEqual({ ok: false, error: 'max_capacity' });
  });

  it('rarity decides affix count', () => {
    const ch = C.createCharacter('A');
    const counts = (['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as const).map((r) => (C.createItem(ch, weapon.id, r, rng()) as any).item.affixes.length);
    expect(counts).toEqual([0, 1, 2, 3, 3]);
  });

  it('upgrade: always succeeds to +9, can fail from +10, normal failure drops a level, safe mode never drops', () => {
    const ch = rich(C.createCharacter('A'));
    const it1 = (C.createItem(ch, weapon.id, 'Rare', rng()) as any).item;
    for (let i = 0; i < 9; i++) expect((C.upgradeItem(ch, it1.uid, rng()) as any).success).toBe(true);
    expect(it1.upgrade).toBe(9);
    // find a seed where the +10 attempt fails
    let failedAt = -1;
    for (let seed = 1; seed < 200 && failedAt < 0; seed++) {
      const probe = { ...it1 };
      const c2 = rich(C.createCharacter('B')); c2.inventory.push(probe as any);
      const res = C.upgradeItem(c2, probe.uid, new SimRNG(seed)) as any;
      if (!res.success) failedAt = seed;
    }
    expect(failedAt).toBeGreaterThan(0);
    const c3 = rich(C.createCharacter('C'));
    const a = { ...it1, upgrade: 11 }; c3.inventory.push(a as any);
    const normalFail = C.upgradeItem(c3, a.uid, { chance: () => false } as any) as any;
    expect(normalFail.success).toBe(false);
    expect(a.upgrade).toBe(10);
    const b = { ...it1, uid: 'b', upgrade: 11 }; c3.inventory.push(b as any);
    const scrapBefore = c3.wallet.scrap;
    const safeFail = C.upgradeItem(c3, 'b', { chance: () => false } as any, true) as any;
    expect(safeFail.success).toBe(false);
    expect(b.upgrade).toBe(11);
    expect(scrapBefore - c3.wallet.scrap).toBe(C.upgradeCost(11, true).scrap);
    expect(C.upgradeCost(11, true).scrap).toBeGreaterThan(C.upgradeCost(11, false).scrap);
    // cannot go beyond +15, nor pay without materials
    const poor = C.createCharacter('D'); poor.inventory.push({ ...it1, uid: 'p', upgrade: 0 } as any);
    expect(C.upgradeItem(poor, 'p', rng())).toEqual({ ok: false, error: 'not_enough_materials' });
    c3.inventory.push({ ...it1, uid: 'm', upgrade: 15 } as any);
    expect(C.upgradeItem(c3, 'm', rng())).toEqual({ ok: false, error: 'max_upgrade' });
  });

  it('dismantle yields ore and fragments, removes the item, refuses equipped items', () => {
    const ch = C.createCharacter('A');
    const item = (C.createItem(ch, weapon.id, 'Epic', rng()) as any).item;
    expect(C.equipItem(ch, 'veh_medium_t1', 'main0', item.uid).ok).toBe(true);
    expect(C.dismantleItem(ch, item.uid)).toEqual({ ok: false, error: 'item_equipped' });
    C.unequipItem(ch, 'veh_medium_t1', 'main0');
    const r = C.dismantleItem(ch, item.uid) as any;
    expect(r.ok).toBe(true);
    expect(ch.wallet.fragments).toBe(r.fragments);
    expect(ch.wallet.ore[r.ore as 'iron']).toBe(r.oreAmount);
    expect(ch.inventory).toHaveLength(0);
  });

  it('craft: needs materials and level, produces the recipe item', () => {
    const ch = C.createCharacter('A');
    const recipe = CRAFTING_RECIPES.find((r) => r.minLevel === 1)!;
    expect(C.craftItem(ch, recipe.id, rng())).toEqual({ ok: false, error: 'not_enough_materials' });
    rich(ch);
    const r = C.craftItem(ch, recipe.id, rng()) as any;
    expect(r.ok).toBe(true);
    expect(r.item.defId).toBe(recipe.outputItemId);
    const hard = CRAFTING_RECIPES.find((x) => x.minLevel > 50)!;
    expect(C.craftItem(ch, hard.id, rng())).toEqual({ ok: false, error: 'level_too_low' });
  });

  it('reroll: replaces one affix without duplicates, max 3, cost grows', () => {
    const ch = rich(C.createCharacter('A'));
    const item = (C.createItem(ch, weapon.id, 'Epic', rng()) as any).item;
    const costs = [1, 2, 3].map((n) => C.rerollCost({ ...item, rerolls: n - 1 }).scrap);
    expect(costs[1]).toBeGreaterThan(costs[0]);
    expect(costs[2]).toBeGreaterThan(costs[1]);
    for (let i = 0; i < 3; i++) {
      expect(C.rerollAffix(ch, item.uid, 0, new SimRNG(i + 7)).ok).toBe(true);
      expect(new Set(item.affixes.map((a: any) => a.stat)).size).toBe(item.affixes.length);
    }
    expect(C.rerollAffix(ch, item.uid, 0, rng())).toEqual({ ok: false, error: 'max_rerolls' });
  });

  it('fusion: 3 identical items become one; mixed or equipped items are refused', () => {
    const ch = C.createCharacter('A');
    const ids = [0, 1, 2].map(() => (C.createItem(ch, weapon.id, 'Common', rng()) as any).item.uid);
    const other = (C.createItem(ch, weapon.id, 'Rare', rng()) as any).item.uid;
    expect(C.fuseItems(ch, [ids[0], ids[1], other], rng())).toEqual({ ok: false, error: 'not_identical' });
    expect(C.fuseItems(ch, [ids[0], ids[0], ids[1]], rng())).toEqual({ ok: false, error: 'need_three_distinct' });
    const r = C.fuseItems(ch, ids, rng()) as any;
    expect(r.ok).toBe(true);
    expect(ch.inventory).toHaveLength(2);
    // over many seeds the upgrade chance is roughly 30 % for Common
    let up = 0;
    for (let s = 0; s < 400; s++) {
      const c = C.createCharacter('X');
      const u = [0, 1, 2].map(() => (C.createItem(c, weapon.id, 'Common', new SimRNG(s)) as any).item.uid);
      if ((C.fuseItems(c, u, new SimRNG(s + 1000)) as any).upgraded) up++;
    }
    expect(up / 400).toBeGreaterThan(0.2);
    expect(up / 400).toBeLessThan(0.4);
  });

  it('loadout stats grow with gear, upgrades, talents and mastery', () => {
    const ch = rich(C.createCharacter('A'));
    ch.level = 30;
    const base = C.computeLoadoutStats(ch)!;
    const w = (C.createItem(ch, weapon.id, 'Legendary', rng()) as any).item;
    C.equipItem(ch, 'veh_medium_t1', 'main0', w.uid);
    const withGun = C.computeLoadoutStats(ch)!;
    expect(withGun.mainDamage).toBeGreaterThan(base.mainDamage);
    for (let i = 0; i < 9; i++) C.upgradeItem(ch, w.uid, rng());
    expect(C.computeLoadoutStats(ch)!.mainDamage).toBeGreaterThan(withGun.mainDamage);
    C.addMasteryXp(ch, 'veh_medium_t1', 1e6);
    expect(C.masteryLevel(1e6)).toBe(10);
    const m = C.computeLoadoutStats(ch)!;
    ch.talentRanks['off_kinetic_power'] = 5;
    expect(C.computeLoadoutStats(ch)!.mainDamage).toBeGreaterThan(m.mainDamage);
    // wrong slot type and level gate
    const arm = ITEM_CATALOG.find((i) => i.slotType === 'armor' && i.tier === 1)!;
    const a = (C.createItem(ch, arm.id, 'Common', rng()) as any).item;
    expect((C.equipItem(ch, 'veh_medium_t1', 'main0', a.uid) as any).error).toBe('wrong_slot_type');
  });
});

describe('Modules and drones affect stats', () => {
  it('an auto-repair module raises hull, a drone adds hull and appears as a companion with its own power', () => {
    const ch = rich(C.createCharacter('M')); ch.level = 40;
    const base = C.computeLoadoutStats(ch)!;
    const mod = (C.createItem(ch, 'mod_plating_hardener', 'Rare', new SimRNG(1)) as any).item;
    expect(C.equipItem(ch, 'veh_medium_t1', 'module0', mod.uid).ok).toBe(true);
    expect(C.computeLoadoutStats(ch)!.maxArmor).toBeGreaterThan(base.maxArmor);
    const d = (C.createItem(ch, 'drn_guardian_t1', 'Rare', new SimRNG(2)) as any).item;
    expect(C.equipItem(ch, 'veh_medium_t1', 'drone0', d.uid).ok).toBe(true);
    const s = C.computeLoadoutStats(ch)!;
    expect(s.maxHull).toBeGreaterThan(base.maxHull);
    expect(s.mainDamage).toBe(base.mainDamage); // the drone's own gun / effect replaces the old flat damage bonus
    expect(s.drones).toEqual([{ type: 'guardian', tier: 1, slot: 0, power: expect.any(Number) }]);
    expect(s.drones[0].power).toBeGreaterThan(40); // Rare multiplier
  });
});

import { ammoCost, reputationLevel } from '../shared/rules/actions.ts';
describe('Reputation discount', () => {
  it('3% off ammo per faction reputation level, capped at level 7', () => {
    const ch = C.createCharacter('R');
    expect(ammoCost(ch, 'ARMOR_PIERCING', 1)).toBe(65);
    ch.reputation['coastal'] = 2500;
    expect(reputationLevel(ch)).toBe(2);
    expect(ammoCost(ch, 'ARMOR_PIERCING', 1)).toBe(Math.round(65 * 0.94));
    ch.reputation['coastal'] = 99999;
    expect(reputationLevel(ch)).toBe(7);
  });
});
