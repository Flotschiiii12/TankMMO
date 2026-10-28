import { describe, expect, it } from 'vitest';
import { bestAmmoAgainst, DamageNumberMerger, isLowHealth, killFeedEntry, killsToGo, MAX_THREATS, MERGE_WINDOW_MS, plateLod, selectThreats, NAME_DISTANCE } from '../src/ui/combatLogic.ts';
import type { SimEntity } from '../shared/types.ts';

const ent = (o: Partial<SimEntity>): SimEntity => ({ id: 1, kind: 'scout_buggy', name: 'E', level: 5, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, hull: 100, maxHull: 100, armor: 50, maxArmor: 50, isHostile: true, statusEffects: [], radius: 20, ...o } as SimEntity);

describe('name plate level of detail', () => {
  it('untouched far enemies show nothing, near ones the name, damaged ones the bars, targets and bosses always', () => {
    const e = ent({});
    expect(plateLod(e, 2000, false)).toEqual({ name: false, bars: false });
    expect(plateLod(e, NAME_DISTANCE - 1, false)).toEqual({ name: true, bars: false });
    const hurt = ent({ hull: 60 });
    expect(plateLod(hurt, 900, false)).toEqual({ name: false, bars: true });
    expect(plateLod(hurt, 2500, false)).toEqual({ name: false, bars: false });
    expect(plateLod(e, 2500, true)).toEqual({ name: true, bars: true });
    expect(plateLod(ent({ kind: 'boss' }), 3000, false)).toEqual({ name: true, bars: true });
    expect(plateLod(ent({ isElite: true, armor: 10 }), 1000, false).name).toBe(true);
  });
});

describe('damage number merging', () => {
  it('hits on one target inside the window become one number, other targets stay separate, late hits start a new one', () => {
    const m = new DamageNumberMerger();
    m.add(7, { x: 1, y: 1 }, 100, {}, 0); m.add(7, { x: 2, y: 2 }, 50, { crit: true }, 80); m.add(8, { x: 9, y: 9 }, 30, { armor: true }, 90);
    expect(m.flush(100)).toEqual([]); // window not over
    const out = m.flush(MERGE_WINDOW_MS + 100);
    expect(out).toHaveLength(2);
    expect(out.find((n) => n.text.startsWith('-150'))).toMatchObject({ text: '-150 x2', crit: true, armor: false, pos: { x: 2, y: 2 } });
    expect(out.find((n) => n.text === '-30')).toMatchObject({ armor: true });
    expect(m.size).toBe(0);
    m.add(7, { x: 0, y: 0 }, 10, {}, 1000);
    expect(m.flush(1000, true)).toHaveLength(1); // forced flush (e.g. on death)
  });
});

describe('threat arrows', () => {
  const me = ent({ id: 1, pos: { x: 0, y: 0 }, isHostile: false, targetId: undefined });
  const off = () => false;
  it('lists off-screen enemies that aim at the player and the current target, nearest first, capped', () => {
    const foes = [2, 3, 4, 5, 6, 7].map((id) => ent({ id, pos: { x: id * 150, y: 0 }, targetId: 1 }));
    const idle = ent({ id: 20, pos: { x: 300, y: 0 }, targetId: undefined });
    const target = ent({ id: 21, pos: { x: 1500, y: 0 } });
    me.targetId = 21;
    const t = selectThreats(me, [me, idle, target, ...foes], off);
    expect(t).toHaveLength(MAX_THREATS);
    expect(t[0]).toMatchObject({ id: 21, isTarget: true });
    expect(t.slice(1).map((x) => x.id)).toEqual([2, 3, 4]);
    expect(t.some((x) => x.id === 20)).toBe(false);
  });
  it('skips on-screen, dead, far and non-combat things', () => {
    me.targetId = undefined;
    const e = [ent({ id: 2, targetId: 1, pos: { x: 100, y: 0 } }), ent({ id: 3, targetId: 1, hull: 0, pos: { x: 100, y: 0 } }), ent({ id: 4, targetId: 1, pos: { x: 5000, y: 0 } }), ent({ id: 5, kind: 'projectile', targetId: 1, pos: { x: 100, y: 0 } })];
    expect(selectThreats(me, e, (p) => p.x === 100 && false)).toHaveLength(1);
    expect(selectThreats(me, e, () => true)).toHaveLength(0);
  });
});

describe('target panel maths', () => {
  it('picks the strongest owned ammo and estimates shots to kill', () => {
    const boss = { kind: 'boss' as const, vehicleClass: undefined };
    expect(bestAmmoAgainst(boss, { SHAPED_CHARGE: 5 } as any).ammo).toBe('SHAPED_CHARGE');
    expect(bestAmmoAgainst(boss, {} as any).ammo).toBe('STANDARD'); // none owned
    const k = killsToGo({ hull: 900, armor: 300, kind: 'scout_buggy' }, { mainDamage: 100, mainReloadTime: 1.5, selectedAmmo: 'STANDARD' as any });
    expect(k.shots).toBe(12); expect(k.seconds).toBe(18);
    expect(killsToGo({ hull: 1, armor: 0, kind: 'scout_buggy' }, { mainDamage: 1e6, mainReloadTime: 1, selectedAmmo: 'STANDARD' as any }).shots).toBe(1);
  });
  it('low health warning and kill feed rules', () => {
    expect(isLowHealth({ hull: 29, maxHull: 100 })).toBe(true); expect(isLowHealth({ hull: 31, maxHull: 100 })).toBe(false); expect(isLowHealth({ hull: 0, maxHull: 100 })).toBe(false);
    expect(killFeedEntry({ id: 1, kind: 'scout_buggy', name: 'x' }, 'Me', 0)).toBeUndefined();
    expect(killFeedEntry({ id: 1, kind: 'scout_buggy', isElite: true, name: 'x' }, 'Me', 0)).toMatchObject({ boss: false, until: 5000 });
    expect(killFeedEntry({ id: 1, kind: 'boss', name: 'B' }, 'Me', 0)).toMatchObject({ boss: true, text: 'Me ▸ B' });
  });
});
