import { describe, expect, it } from 'vitest';
import { rollLoot } from '../shared/data/loot.ts';
import { SimRNG } from '../shared/prng.ts';

describe('Loot Tables & Pity Counter (Milestone 2)', () => {
  it('triggers pity drop when counter reaches PITY_THRESHOLD', () => {
    const rng = new SimRNG(12345);

    // At counter = 10, pity must trigger guaranteed Rare+
    const result = rollLoot(rng, 25, 3, false, false, 10);
    expect(result.pityTriggered).toBe(true);
    expect(['Rare', 'Epic', 'Legendary']).toContain(result.rarity);
    expect(result.newPityCounter).toBe(0);
  });

  it('drops scrap and scales with enemy level and boss status', () => {
    const rng1 = new SimRNG(42);
    const normal = rollLoot(rng1, 10, 1, false, false, 0);

    const rng2 = new SimRNG(42);
    const boss = rollLoot(rng2, 10, 1, false, true, 0);

    expect(normal.scrap).toBeGreaterThan(0);
    expect(boss.scrap).toBeGreaterThan(normal.scrap * 5);
    expect(boss.keys).toBe(1); // Bosses drop gate keys
  });
});
