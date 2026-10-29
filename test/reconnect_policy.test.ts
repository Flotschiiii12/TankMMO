import { describe, expect, it } from 'vitest';
import { MAX_AUTO_RECONNECT_ATTEMPTS, reconnectDelayMs } from '../src/net/reconnectPolicy.ts';

describe('connection recovery policy', () => {
  it('uses a bounded number of automatic attempts', () => {
    expect(MAX_AUTO_RECONNECT_ATTEMPTS).toBe(5);
  });

  it('backs off exponentially and caps the delay', () => {
    expect([0, 1, 2, 3, 4, 8].map(reconnectDelayMs)).toEqual([1000, 2000, 4000, 8000, 16000, 16000]);
    expect(reconnectDelayMs(-1)).toBe(1000);
  });
});
