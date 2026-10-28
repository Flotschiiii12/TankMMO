import { describe, expect, it } from 'vitest';
import { RemoteInterpolator } from '../src/net/interpolation.ts';

describe('remote vehicle interpolation', () => {
  it('moves smoothly through late and bunched-up updates', () => {
    const ip = new RemoteInterpolator();
    // a vehicle driving at 1 unit/ms, updates every 100 ms but two of them arrive 80 ms late and bunched together
    const arrivals = [0, 100, 200, 380, 400, 500, 600, 700];
    for (const t of arrivals) ip.push(1, t, t / 1, 0, 0, 0);
    let prev = -Infinity; let maxStep = 0; let minStep = Infinity;
    for (let now = 300; now <= 700; now += 16) {
      const s = ip.sample(1, now)!;
      expect(s.x).toBeGreaterThanOrEqual(prev); // never goes backwards
      if (prev > -Infinity) { maxStep = Math.max(maxStep, s.x - prev); minStep = Math.min(minStep, s.x - prev); }
      prev = s.x;
    }
    expect(minStep).toBeGreaterThan(0); // never stands still
    expect(maxStep).toBeLessThan(30);   // ~16 units per 16 ms frame, no jump
  });

  it('far entities that update every 200 ms get a longer delay than near ones', () => {
    const ip = new RemoteInterpolator();
    for (let i = 0; i < 12; i++) { ip.push(1, i * 100, i * 100, 0, 0, 0); ip.push(2, i * 200, i * 200, 0, 0, 0); }
    expect(ip.delayFor(2)).toBeGreaterThan(ip.delayFor(1));
    expect(ip.delayFor(1)).toBeGreaterThanOrEqual(130);
    expect(ip.delayFor(2)).toBeLessThanOrEqual(380);
  });

  it('interpolates angles over the short way round', () => {
    const ip = new RemoteInterpolator();
    ip.push(1, 0, 0, 0, Math.PI - 0.1, 0); ip.push(1, 130, 0, 0, -Math.PI + 0.1, 0);
    const s = ip.sample(1, 130 + 65)!; // halfway between the two samples (delay 130)
    expect(Math.abs(Math.abs(s.a) - Math.PI)).toBeLessThan(0.15);
  });
});
