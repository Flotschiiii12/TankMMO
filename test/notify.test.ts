import { describe, expect, it } from 'vitest';
import { MAX_ACTIVE, MAX_HISTORY, MERGE_MS, NotifyStore, TOAST_MS, diffCharacter, noticeText, type CharSnapshot } from '../src/ui/hud/notify.ts';

describe('notification centre', () => {
  it('merges the same group and key inside the window and sums amounts', () => {
    let now = 1000; const s = new NotifyStore(() => now);
    s.push({ group: 'loot', key: 'scrap', title: '', amount: 50, unit: 'scrap' });
    now += 800; s.push({ group: 'loot', key: 'scrap', title: '', amount: 70, unit: 'scrap' });
    expect(s.getSnapshot().history).toHaveLength(1);
    expect(noticeText(s.getSnapshot().history[0])).toBe('+120 scrap');
    now += MERGE_MS + 1; s.push({ group: 'loot', key: 'scrap', title: '', amount: 5, unit: 'scrap' });
    expect(s.getSnapshot().history).toHaveLength(2);
  });
  it('different keys or groups stay separate; item repeats show a count', () => {
    let now = 0; const s = new NotifyStore(() => now);
    s.push({ group: 'loot', key: 'item:Cannon', title: 'Cannon T1' }); s.push({ group: 'loot', key: 'item:Cannon', title: 'Cannon T1' }); s.push({ group: 'loot', key: 'item:Cannon', title: 'Cannon T1' });
    s.push({ group: 'xp', key: 'xp', title: '', amount: 10, unit: 'XP' });
    const h = s.getSnapshot().history; expect(h).toHaveLength(2);
    expect(noticeText(h.find((n) => n.group === 'loot')!)).toBe('3× Cannon T1');
  });
  it('shows at most 3 fresh toasts, expires them, keeps a bounded history and counts unread', () => {
    let now = 0; const s = new NotifyStore(() => now);
    for (let i = 0; i < 6; i++) s.push({ group: 'system', title: `m${i}` });
    expect(s.getSnapshot().active).toHaveLength(MAX_ACTIVE); expect(s.getSnapshot().unread).toBe(6);
    now += TOAST_MS + 1; s.tick(); expect(s.getSnapshot().active).toHaveLength(0);
    s.markRead(); expect(s.getSnapshot().unread).toBe(0);
    for (let i = 0; i < 100; i++) s.push({ group: 'system', title: `n${i}` });
    expect(s.getSnapshot().history).toHaveLength(MAX_HISTORY); expect(s.getSnapshot().history[0].title).toBe('n99');
  });
});

describe('character diff', () => {
  const base: CharSnapshot = { xp: 10, level: 3, scrap: 100, fragments: 1, ore: 5, itemUids: ['a'], readyQuests: [], honor: 0 };
  const T = { levelUp: (n: number) => `Level ${n}!`, xp: 'XP', scrap: 'scrap', fragments: 'fragments', ore: 'ore', honor: 'honor', questReady: 'Ready' };
  const d = (next: Partial<CharSnapshot>) => diffCharacter(base, { ...base, ...next }, (u) => `item-${u}`, (q) => `Quest ${q}`, T);
  it('announces gains, new items, ready quests and level ups, not spending', () => {
    expect(d({})).toEqual([]);
    expect(d({ scrap: 40 })).toEqual([]);
    expect(d({ scrap: 160 })[0]).toMatchObject({ group: 'loot', key: 'scrap', amount: 60 });
    expect(d({ xp: 30 })[0]).toMatchObject({ group: 'xp', amount: 20 });
    expect(d({ level: 4, xp: 2 })[0]).toMatchObject({ key: 'level', title: 'Level 4!' });
    expect(d({ itemUids: ['a', 'b'] })[0]).toMatchObject({ group: 'loot', title: 'item-b' });
    expect(d({ readyQuests: ['q1'] })[0]).toMatchObject({ group: 'quest', title: 'Ready: Quest q1' });
  });
});
