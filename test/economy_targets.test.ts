import { describe, expect, it } from 'vitest';
import { bestGearHours, milestones } from '../scripts/econ-sim.ts';

/**
 * Guard rails for the progression pace (docs/ECONOMY_REPORT.md): level 30 in about 20 h, level 60 in about 120 h and level 100
 * in about 500 h of play at the simulated kill rate. Tolerance +-30 %: the simulation is a model, the report has the exact numbers.
 */
describe('time to level', () => {
  it('stays on the design targets for a free player', () => {
    const m = milestones(40, 200, 'free', 7);
    const check = (level: number, target: number) => {
      expect(m[level], `level ${level}: ${m[level]} h (target ${target} h)`).toBeGreaterThan(target * 0.7);
      expect(m[level], `level ${level}: ${m[level]} h (target ${target} h)`).toBeLessThan(target * 1.3);
    };
    check(30, 20); check(60, 120); check(100, 500);
    for (const L of [10, 20, 30, 40, 50, 60, 70, 80, 90]) expect(m[L + 10]).toBeGreaterThan(m[L]);
  }, 60_000);

  it('paying for the premium time savers speeds up levelling by less than 10 %', () => {
    const free = milestones(40, 200, 'free', 7);
    const pay = milestones(40, 200, 'payer', 7);
    for (const L of [30, 60, 100]) expect(pay[L]).toBeGreaterThan(free[L] * 0.9);
  }, 60_000);
});

describe('endgame gear', () => {
  it('is very grindy for a free player (roughly twice the time to level 100) yet reachable, and paying barely helps', () => {
    const free = bestGearHours(8, 200, 'free', 7);
    const pay = bestGearHours(8, 200, 'payer', 7);
    expect(free, `${free} h`).toBeGreaterThan(800);   // more than ~57 casual weeks
    expect(free, `${free} h`).toBeLessThan(1800);     // but finite: ~2 years casual at most, a few months dedicated
    expect(pay, `${pay} h`).toBeGreaterThan(free * 0.8);
  }, 120_000);
});
