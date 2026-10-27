import { describe, expect, it } from 'vitest';
import * as A from '../shared/rules/arena.ts';

const e = (id: string, power: number, rating = 1000, mode: A.ArenaMode = '1v1', queuedAt = 0): A.QueueEntry => ({ id, mode, power, rating, queuedAt });

describe('Arena rules', () => {
  it('leagues come from combat power, not level', () => {
    expect([0, 399, 400, 1200, 3000, 7000, 15000, 99999].map(A.leagueForPower)).toEqual(['bronze', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'master']);
    expect(A.arenaPower(300, 4000, 3000)).toBeGreaterThan(A.arenaPower(100, 4000, 3000));
    expect(A.arenaPower(300, 4000, 3000, 30)).toBeGreaterThan(A.arenaPower(300, 4000, 3000, 0));
  });

  it('Elo is zero-sum, favors upsets and keeps equal ratings at +-K/2', () => {
    expect(A.eloDelta(1000, 1000, 1)).toEqual({ a: 16, b: -16 });
    const upset = A.eloDelta(800, 1200, 1).a;
    const expected = A.eloDelta(1200, 800, 1).a;
    expect(upset).toBeGreaterThan(expected);
    const d = A.eloDelta(1100, 900, 0);
    expect(d.a + d.b).toBe(0);
  });

  it('matchmaking pairs same league, waits before crossing leagues, builds balanced teams of the right size', () => {
    expect(A.findMatches([e('a', 100), e('b', 5000)], 0)).toEqual([]); // different leagues, no wait yet
    expect(A.findMatches([e('a', 100), e('b', 300)], 0)).toHaveLength(1);
    // neighbouring league only after waiting 30 s
    expect(A.findMatches([e('a', 100), e('b', 500)], 10)).toHaveLength(0);
    expect(A.findMatches([e('a', 100, 1000, '1v1', 0), e('b', 500, 1000, '1v1', 0)], 31)).toHaveLength(1);
    const q = Array.from({ length: 6 }, (_, i) => e(`p${i}`, 100 + i, 800 + i * 60, '3v3'));
    const [m] = A.findMatches(q, 0);
    expect(m.teamA).toHaveLength(3); expect(m.teamB).toHaveLength(3);
    const avg = (t: A.QueueEntry[]) => t.reduce((s, x) => s + x.rating, 0) / t.length;
    expect(Math.abs(avg(m.teamA) - avg(m.teamB))).toBeLessThanOrEqual(60);
    expect(A.findMatches(q.slice(0, 5), 0)).toEqual([]); // one short
    expect(new Set([...m.teamA, ...m.teamB].map((x) => x.id)).size).toBe(6);
  });

  it('best of 3: countdown, rounds, break, winner; timeout gives the round to the team with more survivors', () => {
    const m = A.newMatch('3v3', 0);
    expect(A.advanceMatch(m, 1, [3, 3])).toBe('none');
    expect(A.advanceMatch(m, A.COUNTDOWN_SECONDS, [3, 3])).toBe('round_started');
    expect(m.phase).toBe('fighting');
    expect(A.advanceMatch(m, 20, [2, 1])).toBe('none');
    expect(A.advanceMatch(m, 30, [2, 0])).toBe('round_over');
    expect(m.wins).toEqual([1, 0]);
    expect(m.phase).toBe('break');
    A.advanceMatch(m, 30 + A.ROUND_BREAK_SECONDS, [3, 3]);
    expect(m.phase).toBe('countdown');
    expect(m.round).toBe(2);
    A.advanceMatch(m, 100, [3, 3]);
    expect(A.advanceMatch(m, 100 + A.ROUND_TIME_LIMIT_SECONDS, [1, 2])).toBe('round_over'); // time up: team B has more survivors
    expect(m.wins).toEqual([1, 1]);
    A.advanceMatch(m, 400, [3, 3]); A.advanceMatch(m, 410, [3, 3]);
    expect(A.advanceMatch(m, 420, [0, 2])).toBe('match_over');
    expect(m.winner).toBe(1);
    expect(A.advanceMatch(m, 500, [1, 1])).toBe('none');
  });
});
