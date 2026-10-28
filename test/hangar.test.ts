import { describe, expect, it } from 'vitest';
import * as C from '../shared/rules/character.ts';
import { executeAction, type ClientAction } from '../shared/rules/actions.ts';
import { SimRNG } from '../shared/prng.ts';
import { bestLoadout, currentLoadout, currentPreview, emptyLoadout, itemScore, loadPresets, planLoadout, previewEquip, savePreset } from '../src/ui/hangar/hangarLogic.ts';
import { formatDelta } from '../src/ui/kit/logic.ts';

const rng = new SimRNG(5);
function richCharacter() {
  const ch = C.createCharacter('Hangar'); ch.level = 30;
  const v = ch.activeVehicle;
  // make sure the active vehicle exists in the garage
  if (!ch.garage.some((g) => g.vehicleId === v)) ch.garage.push({ vehicleId: v, masteryXp: 0, loadout: {} });
  for (const id of ['wpn_cannon_t1', 'wpn_cannon_t3', 'wpn_cannon_t5', 'arm_reactive_armor_t1', 'arm_reactive_armor_t3', 'eng_speed_engine_t1', 'eng_speed_engine_t2']) C.createItem(ch, id, 'Common', rng);
  C.createItem(ch, 'wpn_cannon_t3', 'Epic', rng);
  return ch;
}
const apply = (ch: C.CharacterState, actions: ClientAction[]) => { for (const a of actions) expect(executeAction(ch, a, rng, { inSafeZone: true, nowSeconds: 0, buyAmmo: () => ({ ok: true }) }).ok, JSON.stringify(a)).toBe(true); };

describe('hangar logic', () => {
  it('rarity and upgrades raise an item score within the same definition', () => {
    const ch = richCharacter(); const cannons = ch.inventory.filter((i) => i.defId === 'wpn_cannon_t3');
    const epic = cannons.find((i) => i.rarity === 'Epic')!; const common = cannons.find((i) => i.rarity === 'Common')!;
    expect(itemScore(epic)).toBeGreaterThan(itemScore(common));
    const up = { ...common, upgrade: 5 }; expect(itemScore(up)).toBeGreaterThan(itemScore(common));
  });
  it('equip best produces a plan that really results in the best items, and a second plan is empty', () => {
    const ch = richCharacter(); const v = ch.activeVehicle;
    const target = bestLoadout(ch, v); const plan = planLoadout(ch, v, target);
    expect(plan.skipped).toEqual([]);
    apply(ch, plan.actions);
    for (const [slot, uid] of Object.entries(target)) if (uid) expect(currentLoadout(ch, v)[slot]).toBe(uid);
    expect(planLoadout(ch, v, target).actions).toEqual([]);
    const main = C.findItem(ch, currentLoadout(ch, v)['main0']!)!; expect(main.rarity).toBe('Epic');
  });
  it('unequip all and swapping two slots work through plain actions', () => {
    const ch = richCharacter(); const v = ch.activeVehicle; apply(ch, planLoadout(ch, v, bestLoadout(ch, v)).actions);
    const cur = currentLoadout(ch, v); const slots = C.slotKeysFor(v).filter((s) => s.type === 'main');
    if (slots.length >= 2) {
      const swap = { ...cur, [slots[0].key]: cur[slots[1].key] ?? null, [slots[1].key]: cur[slots[0].key] ?? null };
      apply(ch, planLoadout(ch, v, swap).actions); expect(currentLoadout(ch, v)[slots[0].key]).toBe(swap[slots[0].key]);
    }
    apply(ch, planLoadout(ch, v, emptyLoadout(v)).actions); expect(Object.keys(currentLoadout(ch, v))).toHaveLength(0);
  });
  it('plans skip items that are gone, duplicated, wrong type or on another vehicle instead of failing', () => {
    const ch = richCharacter(); const v = ch.activeVehicle; const slots = C.slotKeysFor(v);
    const armor = ch.inventory.find((i) => i.defId.startsWith('arm_'))!; const cannon = ch.inventory.find((i) => i.defId.startsWith('wpn_'))!;
    const main = slots.find((s) => s.type === 'main')!;
    const plan = planLoadout(ch, v, { [main.key]: armor.uid, [slots.find((s) => s.type === 'armor')!.key]: 'does-not-exist' });
    expect(plan.actions).toEqual([]); expect(plan.skipped.map((s) => s.reason).sort()).toEqual(['cannot_equip', 'item_not_found']);
    const other = { vehicleId: 'other', masteryXp: 0, loadout: { main0: cannon.uid } }; ch.garage.push(other);
    expect(planLoadout(ch, v, { [main.key]: cannon.uid }).skipped[0].reason).toBe('equipped_elsewhere');
    expect(bestLoadout(ch, v)[main.key]).not.toBe(cannon.uid);
  });
  it('the preview shows better stats for a better weapon, never mutates the character, and can preview emptying a slot', () => {
    const ch = richCharacter(); const v = ch.activeVehicle; const main = C.slotKeysFor(v).find((s) => s.type === 'main')!;
    const weak = ch.inventory.find((i) => i.defId === 'wpn_cannon_t1')!; apply(ch, [{ kind: 'equip', vehicleId: v, slot: main.key, uid: weak.uid }]);
    const snapshot = JSON.stringify(ch);
    const epic = ch.inventory.find((i) => i.rarity === 'Epic')!;
    const p = previewEquip(ch, v, main.key, epic.uid)!;
    expect(p.powerAfter).toBeGreaterThan(p.powerBefore);
    const dmg = p.rows.find((r) => r.key === 'damage')!; expect(formatDelta(dmg.after - dmg.before).good).toBe(true);
    expect(JSON.stringify(ch)).toBe(snapshot);
    const empty = previewEquip(ch, v, main.key, null)!; expect(empty.powerAfter).toBeLessThan(empty.powerBefore);
    expect(previewEquip(ch, v, main.key, 'nope')).toBeUndefined();
    expect(currentPreview(ch, v)!.powerBefore).toBe(p.powerBefore);
  });
  it('presets keep 3 slots per vehicle and survive broken storage', () => {
    const mem: Record<string, string> = {}; const st = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
    expect(loadPresets(st)).toEqual({});
    savePreset('veh', 1, { main0: 'u1', armor0: null }, st);
    const p = loadPresets(st).veh; expect(p).toHaveLength(3); expect(p[0]).toBeNull(); expect(p[1]).toEqual({ main0: 'u1' });
    savePreset('veh', 9, { main0: 'x' }, st); expect(loadPresets(st).veh[2]).toBeNull();
    mem['treadfront_loadout_presets_v1'] = '{not json'; expect(loadPresets(st)).toEqual({});
  });
});
