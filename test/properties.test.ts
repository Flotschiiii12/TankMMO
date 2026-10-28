import { describe, expect, it } from 'vitest';
import { ITEM_CATALOG, CRAFTING_RECIPES } from '../shared/data/items.ts';
import { SimRNG } from '../shared/prng.ts';
import * as C from '../shared/rules/character.ts';
import { executeAction, type ClientAction } from '../shared/rules/actions.ts';
import { characterViolations, makeRng } from '../scripts/fuzzLib.ts';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
/** JSON with sorted keys: object key order is not state. */
const canon = (x: unknown): string => JSON.stringify(x, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));

function richCharacter(seed: number): C.CharacterState {
  const ch = C.createCharacter('P');
  ch.level = 30;
  ch.wallet.scrap = 2_000_000; ch.wallet.fragments = 5000;
  for (const k of Object.keys(ch.wallet.ore) as Array<keyof typeof ch.wallet.ore>) ch.wallet.ore[k] = 5000;
  const rng = new SimRNG(seed);
  const defs = ITEM_CATALOG.filter((d) => d.minLevel <= 30);
  for (let i = 0; i < 40; i++) {
    const d = defs[Math.floor(rng.next() * defs.length)];
    C.createItem(ch, d.id, C.RARITIES[Math.floor(rng.next() * 3)], rng);
  }
  return ch;
}

function randomAction(r: () => number, ch: C.CharacterState): ClientAction {
  const pickItem = () => ch.inventory[Math.floor(r() * ch.inventory.length)]?.uid ?? 'none';
  const v = ch.garage[0].vehicleId;
  const slots = C.slotKeysFor(v);
  switch (Math.floor(r() * 10)) {
    case 0: return { kind: 'equip', vehicleId: v, slot: slots[Math.floor(r() * slots.length)].key, uid: pickItem() };
    case 1: return { kind: 'unequip', vehicleId: v, slot: slots[Math.floor(r() * slots.length)].key };
    case 2: return { kind: 'upgrade', uid: pickItem(), safe: r() < 0.5 };
    case 3: return { kind: 'dismantle', uid: pickItem() };
    case 4: return { kind: 'craft', recipeId: CRAFTING_RECIPES[Math.floor(r() * CRAFTING_RECIPES.length)].id };
    case 5: return { kind: 'reroll', uid: pickItem(), index: Math.floor(r() * 3) };
    case 6: return { kind: 'fuse', uids: [pickItem(), pickItem(), pickItem()] };
    case 7: return { kind: 'sell_item', uid: pickItem() };
    case 8: return { kind: 'expand_inventory' };
    default: return { kind: 'respec' };
  }
}

describe('property: random valid action sequences', () => {
  it('keep every character invariant and never mutate state on a failed action', () => {
    const problems: string[] = [];
    for (let seed = 1; seed <= 60 && problems.length < 5; seed++) {
      const r = makeRng(seed);
      const ch = richCharacter(seed);
      const rng = new SimRNG(seed * 31);
      for (let step = 0; step < 150; step++) {
        const action = randomAction(r, ch);
        const before = clone(ch);
        const res = executeAction(ch, action, rng, { inSafeZone: true, nowSeconds: 1_000_000 + step, buyAmmo: () => ({ ok: false, error: 'x' }) });
        const label = `seed ${seed} step ${step} ${JSON.stringify(action)}`;
        if (!res.ok) {
          // nextUid may not move either: a rejected action must not touch the character at all
          if (canon(ch) !== canon(before)) problems.push(`${label}: failed (${res.error}) but changed the character`);
          continue;
        }
        const d = (a: number, b: number) => a - b;
        const invDelta = d(ch.inventory.length, before.inventory.length);
        const ore = (c: C.CharacterState) => Object.values(c.wallet.ore).reduce((a, b) => a + b, 0);
        switch (action.kind) {
          case 'craft': if (invDelta !== 1 || ch.wallet.scrap > before.wallet.scrap) problems.push(`${label}: craft must add 1 item and not give scrap`); break;
          case 'dismantle': if (invDelta !== -1 || ore(ch) < ore(before) || ch.wallet.fragments < before.wallet.fragments) problems.push(`${label}: dismantle accounting`); break;
          case 'sell_item': if (invDelta !== -1 || ch.wallet.scrap <= before.wallet.scrap) problems.push(`${label}: sell must remove 1 item and pay`); break;
          case 'fuse': if (invDelta !== -2) problems.push(`${label}: fuse must turn 3 into 1`); break;
          case 'upgrade': case 'reroll': if (invDelta !== 0 || ch.wallet.scrap > before.wallet.scrap || ore(ch) > ore(before) || ch.wallet.fragments > before.wallet.fragments) problems.push(`${label}: ${action.kind} must cost, never pay`); break;
          default: break;
        }
        problems.push(...characterViolations(label, ch).slice(0, 2));
        if (problems.length >= 5) break;
      }
    }
    expect(problems).toEqual([]);
  });

  it('selling or dismantling can never be a scrap loop (value per item is bounded by what crafting costs)', () => {
    // craft -> sell must lose scrap for every recipe, otherwise an infinite money machine exists
    const bad: string[] = [];
    for (const recipe of CRAFTING_RECIPES) {
      const ch = richCharacter(5);
      ch.inventory = []; ch.level = 100;
      const before = ch.wallet.scrap;
      const made = C.craftItem(ch, recipe.id, new SimRNG(3));
      if (!made.ok) continue;
      const sold = C.sellItemToNpc(ch, made.item.uid);
      if (sold.ok && ch.wallet.scrap > before) bad.push(`${recipe.id}: craft+sell gains ${ch.wallet.scrap - before} scrap`);
    }
    expect(bad).toEqual([]);
  });
});
