import { describe, expect, it, vi } from 'vitest';
import { countUpDuration, countUpValue, easeOutCubic, isRevealRarity, rarityRank } from '../src/ui/motion/motion.ts';
import { ANNOUNCE_MS, AnnounceStore, MAX_QUEUE, diffAnnouncements } from '../src/ui/motion/announce.ts';

describe('motion maths', () => {
  it('easing and count-up end exactly on target and never overshoot', () => {
    expect(easeOutCubic(0)).toBe(0); expect(easeOutCubic(1)).toBe(1); expect(easeOutCubic(2)).toBe(1); expect(easeOutCubic(-1)).toBe(0);
    expect(countUpValue(100, 250, 1)).toBe(250);
    let prev = 100;
    for (let t = 0; t <= 1; t += 0.1) { const v = countUpValue(100, 250, t); expect(v).toBeGreaterThanOrEqual(prev); expect(v).toBeLessThanOrEqual(250); prev = v; }
    expect(countUpValue(500, 100, 0.5)).toBeLessThan(500);
  });
  it('duration is zero for no change and capped for big jumps', () => {
    expect(countUpDuration(5, 5)).toBe(0);
    expect(countUpDuration(0, 10)).toBeLessThan(countUpDuration(0, 100000));
    expect(countUpDuration(0, 1e12)).toBeLessThanOrEqual(900);
  });
  it('rare and above are revealed', () => {
    expect(rarityRank('Legendary')).toBe(4); expect(rarityRank('nope')).toBe(0);
    expect(isRevealRarity('Rare')).toBe(true); expect(isRevealRarity('Uncommon')).toBe(false); expect(isRevealRarity(undefined)).toBe(false);
  });
});

describe('announcements', () => {
  it('diffs level, tier and newly ready quests', () => {
    const a = { level: 4, tier: 1, readyQuests: ['q1'] };
    expect(diffAnnouncements(a, a)).toEqual([]);
    expect(diffAnnouncements(a, { level: 5, tier: 1, readyQuests: ['q1'] })).toEqual([{ kind: 'levelup', value: 5 }]);
    expect(diffAnnouncements(a, { level: 6, tier: 3, readyQuests: ['q1', 'q2'] })).toEqual([{ kind: 'levelup', value: 6 }, { kind: 'rankup', value: 3 }, { kind: 'quest', value: 'q2' }]);
    expect(diffAnnouncements({ ...a, level: 9 }, { ...a, level: 8 })).toEqual([]); // no announcement for going down
  });
  it('shows one at a time, in order, and caps the queue', () => {
    vi.useFakeTimers();
    const shown: string[] = [];
    const s = new AnnounceStore((x) => shown.push(x.title));
    s.push({ kind: 'levelup', title: 'A' }); s.push({ kind: 'quest', title: 'B' });
    expect(s.getSnapshot()?.title).toBe('A');
    vi.advanceTimersByTime(ANNOUNCE_MS + 1);
    expect(s.getSnapshot()?.title).toBe('B');
    vi.advanceTimersByTime(ANNOUNCE_MS + 1);
    expect(s.getSnapshot()).toBeNull();
    for (let i = 0; i < MAX_QUEUE + 3; i++) s.push({ kind: 'quest', title: `Q${i}` });
    expect(shown[shown.length - 1]).toBe('Q0');
    s.clear(); expect(s.getSnapshot()).toBeNull();
    vi.useRealTimers();
  });
});
