import { describe, expect, it } from 'vitest';
import { runNewbie } from '../scripts/newbie-bot.ts';

describe('first minutes of a new account, played through the real protocol', () => {
  it('finishes the guided start and accepts the first story quest within 12 simulated minutes without long idle phases', { timeout: 120_000 }, async () => {
    const r = await runNewbie({ minutes: 12, seed: 7 });
    expect(r.tutorial.stuckOn, JSON.stringify(r)).toBeUndefined();
    expect(r.tutorial.done).toBe(11);
    expect(r.firstMs.firstKill).not.toBeNull(); expect(r.firstMs.firstKill!).toBeLessThan(1.5);
    expect(r.firstMs.tutorialDone!).toBeLessThan(10);
    expect(r.firstMs.level5).not.toBeNull(); expect(r.firstMs.level5!).toBeGreaterThan(1.5); // not a free skip through the tutorial
    expect(r.firstMs.level5!).toBeLessThan(12);
    expect(r.firstMs.firstCraft).not.toBeNull();
    expect(r.firstMs.firstStoryAccepted).not.toBeNull();
    expect(r.idleSeconds).toBeLessThan(120);
    expect(r.deaths).toBe(0);
  });
});
