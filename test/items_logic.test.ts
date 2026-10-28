import { describe, expect, it } from 'vitest';
import * as C from '../shared/rules/character.ts';
import { CRAFTING_RECIPES } from '../shared/data/items.ts';
import { SimRNG } from '../shared/prng.ts';
import { craftStatus, dismantleReview, filterItems, fusionCandidates, fusionPreview, sortItems, suggestDismantle, suggestPrice, timeLeft, upgradePreview } from '../src/ui/items/itemsLogic.ts';

const rng = new SimRNG(11);
function bag() {
  const ch = C.createCharacter('Bag'); ch.level = 40; ch.wallet.scrap = 1e6; ch.wallet.fragments = 1000; for (const k of ['iron', 'copper', 'titanium', 'crystal'] as const) ch.wallet.ore[k] = 1000;
  const mk = (id: string, rarity: C.ItemInstance['rarity']) => { const r = C.createItem(ch, id, rarity, rng); if (!r.ok) throw new Error('item'); return r.item; };
  return { ch, a: mk('wpn_cannon_t1', 'Common'), b: mk('wpn_cannon_t1', 'Common'), c: mk('wpn_cannon_t1', 'Common'), d: mk('arm_reactive_armor_t3', 'Epic'), e: mk('eng_speed_engine_t2', 'Uncommon') };
}
const name = (i: C.ItemInstance) => i.defId;

describe('filter and sort', () => {
  it('filters by slot, rarity and text; sorts by rarity, tier and name', () => {
    const { ch, d } = bag();
    expect(filterItems(ch, ch.inventory, { slot: 'armor', rarities: new Set(), search: '' }, name).map((i) => i.uid)).toEqual([d.uid]);
    expect(filterItems(ch, ch.inventory, { slot: 'all', rarities: new Set(['Epic']), search: '' }, name)).toHaveLength(1);
    expect(filterItems(ch, ch.inventory, { slot: 'all', rarities: new Set(), search: 'cannon' }, name)).toHaveLength(3);
    expect(filterItems(ch, ch.inventory, { slot: 'all', rarities: new Set(), search: 'EPIC' }, name)).toHaveLength(1);
    expect(sortItems(ch.inventory, 'rarity', name)[0].uid).toBe(d.uid);
    expect(sortItems(ch.inventory, 'tier', name)[0].uid).toBe(d.uid);
    expect(sortItems(ch.inventory, 'name', name).map(name)).toEqual([...ch.inventory.map(name)].sort());
  });
});

describe('bulk dismantle review', () => {
  it('suggests only cheap unequipped items, flags valuables, drops equipped ones and matches the real yield', () => {
    const { ch, a, d } = bag();
    const v = ch.activeVehicle; if (!ch.garage.some((g) => g.vehicleId === v)) ch.garage.push({ vehicleId: v, masteryXp: 0, loadout: {} });
    ch.garage.find((g) => g.vehicleId === v)!.loadout['main0'] = a.uid;
    const sug = suggestDismantle(ch); expect(sug).not.toContain(a.uid); expect(sug).not.toContain(d.uid); expect(sug.length).toBe(3); // two commons + the uncommon engine
    const rev = dismantleReview(ch, [...sug, a.uid, d.uid, 'ghost']);
    expect(rev.dropped.sort()).toEqual([a.uid, 'ghost'].sort()); expect(rev.rows.find((r) => r.uid === d.uid)!.risky).toBe(true); expect(rev.rows.find((r) => r.uid === sug[0])!.risky).toBe(false);
    const before = { ore: { ...ch.wallet.ore }, frag: ch.wallet.fragments };
    for (const r of rev.rows) expect(C.dismantleItem(ch, r.uid).ok).toBe(true);
    const gainedFrag = ch.wallet.fragments - before.frag; expect(gainedFrag).toBe(rev.fragments);
    for (const [k, n] of Object.entries(rev.totals)) expect(ch.wallet.ore[k as keyof typeof ch.wallet.ore] - before.ore[k as keyof typeof before.ore]).toBe(n);
  });
});

describe('workshop previews', () => {
  it('craft status mirrors craftItem: missing lines, level, full inventory', () => {
    const { ch } = bag(); const r = CRAFTING_RECIPES.find((x) => x.minLevel <= ch.level)!;
    expect(craftStatus(ch, r).canCraft).toBe(true);
    const poor = { ...ch, wallet: { ...ch.wallet, scrap: 0 } } as C.CharacterState; const st = craftStatus(poor, r);
    expect(st.canCraft).toBe(false); expect(st.lines.find((l) => l.kind === 'scrap')!.ok).toBe(false); expect(st.missing).toBeGreaterThanOrEqual(1);
    const low = { ...ch, level: 1 } as C.CharacterState; expect(craftStatus(low, CRAFTING_RECIPES.find((x) => x.minLevel > 5)!).levelOk).toBe(false);
    const n = ch.inventory.length; expect(C.craftItem(ch, r.id, rng).ok).toBe(true); expect(ch.inventory.length).toBe(n + 1);
  });
  it('upgrade preview: always succeeds up to +9, from +10 chance below 1 with a drop on failure and a safe option', () => {
    const { ch, a } = bag();
    const p0 = upgradePreview(ch, a); expect(p0.chance).toBe(1); expect(p0.failure).toBe('none'); expect(p0.safe).toBeNull(); expect(p0.normal.canPay).toBe(true);
    a.upgrade = 10; const p = upgradePreview(ch, a); expect(p.chance).toBeLessThan(1); expect(p.failure).toBe('drop'); expect(p.safe!.scrap).toBeGreaterThan(p.normal.scrap);
    a.upgrade = C.MAX_UPGRADE; expect(upgradePreview(ch, a).maxed).toBe(true);
    const cost = C.upgradeCost(0, false, 1); a.upgrade = 0; const scrapBefore = ch.wallet.scrap; C.upgradeItem(ch, a.uid, rng); expect(scrapBefore - ch.wallet.scrap).toBe(cost.scrap);
  });
  it('fusion preview and candidates', () => {
    const { ch, a, d } = bag();
    expect(fusionCandidates(ch, a)).toHaveLength(3); expect(fusionPreview(a)).toEqual({ chance: 0.3, nextRarity: 'Uncommon' }); expect(fusionPreview(d).nextRarity).toBe('Legendary');
    const leg = { ...d, rarity: 'Legendary' as const }; expect(fusionPreview(leg)).toEqual({ chance: 0, nextRarity: null });
  });
});

describe('market helpers', () => {
  it('suggests the median of recent sales, else under the cheapest listing, else twice the NPC value, always inside the band', () => {
    const band = { min: 50, max: 1000 };
    expect(suggestPrice(band, [300, 100, 200], 500, 80)).toMatchObject({ suggested: 200, basis: 'recent' });
    expect(suggestPrice(band, [100, 200], undefined, 80).suggested).toBe(150);
    expect(suggestPrice(band, [], 400, 80)).toMatchObject({ suggested: 388, basis: 'listings' });
    expect(suggestPrice(band, [], undefined, 80)).toMatchObject({ suggested: 160, basis: 'npc' });
    expect(suggestPrice(band, [5000], undefined, 80).suggested).toBe(1000); expect(suggestPrice(band, [], undefined, 5).suggested).toBe(50);
  });
  it('time left', () => { expect(timeLeft(1000, 2000)).toBe('expired'); expect(timeLeft(3 * 3600_000 + 12 * 60_000, 0)).toBe('3h 12m'); expect(timeLeft(42 * 60_000, 0)).toBe('42m'); expect(timeLeft(5_000, 0)).toBe('1m'); });
});
