/**
 * Deterministic 32-bit PRNG (Mulberry32)
 * Pure TypeScript with no external or browser dependencies.
 */
export class SimRNG {
  private state: number;

  constructor(seed = 123456789) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 1;
  }

  /**
   * Returns a pseudo-random float in [0, 1)
   */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a random integer in [min, max] inclusive
   */
  rangeInt(min: number, max: number): number {
    return Math.floor(min + this.next() * (max - min + 1));
  }

  /**
   * Returns a random float in [min, max)
   */
  rangeFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Choose random element from array
   */
  pick<T>(arr: T[]): T {
    const idx = Math.floor(this.next() * arr.length);
    return arr[idx];
  }

  /**
   * Get current internal seed/state for serialization
   */
  getState(): number {
    return this.state;
  }

  /**
   * Restore state
   */
  setState(state: number) {
    this.state = state >>> 0;
  }
}
