import { describe, expect, it } from 'vitest';
import { dprCap, PerfMonitor } from '../src/ui/perfMonitor.ts';

describe('performance mode trigger', () => {
  const run = (m: PerfMonitor, ms: number, seconds: number) => { let fired = 0; for (let t = 0; t < seconds * 1000; t += ms) if (m.frame(ms)) fired++; return fired; };
  it('fires once after 5 s of frames above 22 ms and never for a healthy game', () => {
    expect(run(new PerfMonitor(), 16.7, 60)).toBe(0);
    expect(run(new PerfMonitor(), 21, 60)).toBe(0);
    const m = new PerfMonitor();
    expect(run(m, 30, 4.5)).toBe(0);
    expect(run(m, 30, 1)).toBe(1);
    expect(run(m, 30, 20)).toBe(0); // only once
  });
  it('a short stutter resets the streak; tab pauses and garbage are ignored', () => {
    const m = new PerfMonitor();
    expect(run(m, 40, 4)).toBe(0);
    expect(run(m, 10, 3)).toBe(0); // recovers: counter back to 0
    expect(run(m, 40, 4)).toBe(0);
    expect(m.frame(5000)).toBe(false); expect(m.frame(NaN)).toBe(false); expect(m.frame(-3)).toBe(false);
    expect(run(new PerfMonitor(), 40, 4.9)).toBe(0);
  });
  it('the DPR cap drops from 2 to 1.5', () => { expect(dprCap(false)).toBe(2); expect(dprCap(undefined)).toBe(2); expect(dprCap(true)).toBe(1.5); });
});
