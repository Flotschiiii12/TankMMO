/**
 * Deterministic PRNG implementation (sfc32 - Small Fast Chaos 32-bit).
 * Fully deterministic across Node.js and browser runtimes.
 * NO Math.random() or Date.now() dependencies.
 */

export class SimRNG {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number = 1337) {
    // Seed initialization using SplitMix32
    let s = (seed | 0) || 1337;
    const splitmix = () => {
      s |= 0;
      s = (s + 0x9e3779b9) | 0;
      let t = s ^ (s >>> 16);
      t = Math.imul(t, 0x21f0aaad);
      t = t ^ (t >>> 15);
      t = Math.imul(t, 0x735a2d97);
      return (t ^ (t >>> 15)) >>> 0;
    };

    this.a = splitmix();
    this.b = splitmix();
    this.c = splitmix();
    this.d = splitmix();

    // Warm up the generator
    for (let i = 0; i < 15; i++) {
      this.nextU32();
    }
  }

  /**
   * Generates next unsigned 32-bit integer [0, 2^32 - 1]
   */
  nextU32(): number {
    this.a |= 0;
    this.b |= 0;
    this.c |= 0;
    this.d |= 0;
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = ((this.c << 21) | (this.c >>> 11));
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /**
   * Generates a floating point number in [0, 1)
   */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /**
   * Generates a float in [min, max)
   */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Alias of range(): float in [min, max) (the map generator uses this name)
   */
  rangeFloat(min: number, max: number): number {
    return this.range(min, max);
  }

  /**
   * Generates an integer in [min, max] inclusive
   */
  rangeInt(min: number, max: number): number {
    const fMin = Math.ceil(min);
    const fMax = Math.floor(max);
    return Math.floor(fMin + this.next() * (fMax - fMin + 1));
  }

  /**
   * Returns true with probability p (0 <= p <= 1)
   */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /**
   * Picks a random element from an array
   */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) {
      throw new Error('Cannot pick from empty array');
    }
    const idx = Math.floor(this.next() * arr.length);
    return arr[idx];
  }

  /**
   * Clones current PRNG state
   */
  getState(): [number, number, number, number] {
    return [this.a, this.b, this.c, this.d];
  }

  /**
   * Restores PRNG state
   */
  setState(state: [number, number, number, number]): void {
    this.a = state[0] | 0;
    this.b = state[1] | 0;
    this.c = state[2] | 0;
    this.d = state[3] | 0;
  }

  /**
   * Creates an independent child PRNG branched deterministically from this PRNG
   */
  fork(): SimRNG {
    const child = new SimRNG(this.nextU32());
    return child;
  }
}
