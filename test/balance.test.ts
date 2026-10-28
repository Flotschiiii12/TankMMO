import { describe, expect, it } from 'vitest';
import { CLASSES, DUNGEONS, Build, duelPve, duelPvp, groupVsBoss, groupVsGate, tierForLevel } from '../scripts/balanceLib.ts';
import { enemyScale, ENEMY_SCALE_ANCHORS } from '../shared/data/balance.ts';

/**
 * Guard rails for the numbers produced by `npm run balance-fit / balance-normalize / balance-classes / balance-bosses`
 * (see docs/BALANCE_REPORT.md for the full tables). Bands are the GDD targets widened by a tolerance, because
 * single fights are noisy; the report script is the place for the exact picture.
 */
const TOL = 0.3;
const band = ([lo, hi]: readonly [number, number]): [number, number] => [lo * (1 - TOL), hi * (1 + TOL)];
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const SEEDS = [1, 2, 3, 4];

function pve(b: Build, enemies: string[], elite = false) {
  const t: number[] = []; let wins = 0, n = 0;
  for (const e of enemies) for (const seed of SEEDS) { const r = duelPve(b, e, { elite, seed }); n++; if (r.win) { wins++; t.push(r.seconds); } }
  return { ttk: mean(t), win: wins / n };
}

describe('enemy scale table', () => {
  it('is increasing in level, interpolates between anchors and is clamped at the ends', () => {
    for (let i = 1; i < ENEMY_SCALE_ANCHORS.length; i++) {
      expect(ENEMY_SCALE_ANCHORS[i][0]).toBeGreaterThan(ENEMY_SCALE_ANCHORS[i - 1][0]);
      expect(ENEMY_SCALE_ANCHORS[i][1]).toBeGreaterThan(ENEMY_SCALE_ANCHORS[i - 1][1] * 0.95);
    }
    const a = ENEMY_SCALE_ANCHORS;
    expect(enemyScale(a[0][0] - 5)).toEqual(enemyScale(a[0][0]));
    expect(enemyScale(500).hull).toBeCloseTo(a[a.length - 1][1], 3);
    const mid = enemyScale((a[3][0] + a[4][0]) / 2).hull;
    expect(mid).toBeGreaterThan(a[3][1]);
    expect(mid).toBeLessThan(a[4][1]);
  });
});

describe('time to kill stays inside the design bands', () => {
  it('normal enemies: 5-15 s for every class at a spread of tiers, and the player wins', () => {
    const [lo, hi] = band([5, 15]);
    const bad: string[] = [];
    for (const cls of CLASSES) for (const tier of [1, 4, 7, 10]) {
      const r = pve({ cls, tier }, ['scout_buggy', 'gunner_truck', 'ice_tank', 'lava_truck']);
      if (!(r.ttk >= lo && r.ttk <= hi) || r.win < 0.85) bad.push(`${cls} T${tier}: ${r.ttk.toFixed(1)} s, win ${(r.win * 100).toFixed(0)}%`);
    }
    expect(bad, `outside ${lo.toFixed(1)}-${hi.toFixed(1)} s:\n${bad.join('\n')}`).toEqual([]);
  });

  it('elite enemies: 30-60 s and still winnable', () => {
    const [lo, hi] = band([30, 60]);
    const bad: string[] = [];
    for (const cls of ['medium', 'heavy', 'support'] as const) for (const tier of [2, 5, 8]) {
      const r = pve({ cls, tier }, ['gunner_truck'], true);
      if (!(r.ttk >= lo && r.ttk <= hi) || r.win < 0.75) bad.push(`${cls} T${tier}: ${r.ttk.toFixed(1)} s, win ${(r.win * 100).toFixed(0)}%`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('PvP duels at equal tier last 20-40 s', () => {
    const [lo, hi] = band([20, 40]);
    const bad: string[] = [];
    for (const tier of [3, 6, 9]) {
      const t = mean(SEEDS.map((seed) => duelPvp({ cls: 'medium', tier }, { cls: 'medium', tier }, seed).seconds));
      if (!(t >= lo && t <= hi)) bad.push(`T${tier}: ${t.toFixed(1)} s`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});

describe('no class dominates', () => {
  it('cross-class PvP win rates stay within 35-65 % when averaged over tiers', () => {
    const w: Record<string, number> = {}, n: Record<string, number> = {};
    for (const c of CLASSES) { w[c] = 0; n[c] = 0; }
    for (const tier of [3, 6, 9]) for (const a of CLASSES) for (const b of CLASSES) {
      if (a >= b) continue;
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const r1 = duelPvp({ cls: a, tier }, { cls: b, tier }, seed);
        const r2 = duelPvp({ cls: b, tier }, { cls: a, tier }, seed);
        const aWins = (r1.win ? 1 : 0) + (r2.win || r2.timedOut ? 0 : 1);
        w[a] += aWins; w[b] += 2 - aWins; n[a] += 2; n[b] += 2;
      }
    }
    const rates = CLASSES.map((c) => ({ c, r: w[c] / n[c] }));
    for (const { c, r } of rates) expect(r, `${c} wins ${(r * 100).toFixed(0)}%`).toBeGreaterThan(0.35);
    for (const { c, r } of rates) expect(r, `${c} wins ${(r * 100).toFixed(0)}%`).toBeLessThan(0.65);
  }, 120_000);

  it('weapon families deal similar damage against normal enemies (time to kill within 25 % of the cannon)', () => {
    for (const tier of [2, 6, 9]) {
      const base = pve({ cls: 'medium', tier, family: 'cannon' }, ['gunner_truck', 'ice_tank']).ttk;
      for (const family of ['rapid_fire', 'rocket', 'mortar', 'railgun', 'flamethrower'] as const) {
        const t = pve({ cls: 'medium', tier, family }, ['gunner_truck', 'ice_tank']).ttk;
        expect(Math.abs(t / base - 1), `${family} T${tier}: ${t.toFixed(1)} vs cannon ${base.toFixed(1)}`).toBeLessThan(0.25);
      }
    }
  }, 120_000);
});

describe('group content', () => {
  const party = (lvl: number): Build[] => (['heavy', 'medium', 'artillery', 'support'] as const).map((cls) => ({ cls, tier: tierForLevel(lvl), level: lvl }));

  it('a mini boss takes a party of 4 about 3-8 minutes and the party usually survives', () => {
    const [lo, hi] = band([180, 480]);
    const rs = [1, 2, 3].map((s) => groupVsBoss('boss_cape_warden', party(15), s));
    const wins = rs.filter((r) => r.win);
    expect(wins.length).toBeGreaterThanOrEqual(2);
    const t = mean(wins.map((r) => r.seconds));
    expect(t, `${t.toFixed(0)} s`).toBeGreaterThan(lo);
    expect(t, `${t.toFixed(0)} s`).toBeLessThan(hi);
  }, 120_000);

  it('gates are cleared by a party of 4 inside the 15 minute limit', () => {
    for (const id of ['gate_rusted_depot', 'gate_glowworm_sump']) {
      const d = DUNGEONS.find((x) => x.id === id)!;
      const rs = [1, 2, 3].map((s) => groupVsGate(id, party(d.recommendedLevel), s));
      const wins = rs.filter((r) => r.win);
      expect(wins.length, `${id}: ${rs.map((r) => (r.win ? 'W' : 'L') + r.seconds.toFixed(0)).join(' ')}`).toBeGreaterThanOrEqual(2);
      for (const r of wins) expect(r.seconds).toBeLessThan(d.timeLimitSeconds);
    }
  }, 120_000);
});
