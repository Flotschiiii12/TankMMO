import { describe, expect, it } from 'vitest';
import { isFlatPayload } from '../server/gameServer.ts';
import { runFuzz, makeRng, genFrame, toWire } from '../scripts/fuzzLib.ts';

describe('protocol fuzzing', () => {
  for (const seed of [1, 2, 3]) {
    it(`survives hostile frames from real clients (seed ${seed})`, async () => {
      const r = await runFuzz({ seed, clients: 3, framesPerClient: 300 });
      expect(r.sent).toBeGreaterThan(500);
      expect(r.uncaught, r.uncaught.join('\n')).toEqual([]);
      expect(r.violations, `seed ${seed}:\n${r.violations.join('\n')}`).toEqual([]);
    }, 60_000);
  }

  it('the generator is deterministic and really produces hostile input', () => {
    const ctx = { uids: ['i1'], names: ['a'], defIds: ['x'], ids: [1] };
    const a = Array.from({ length: 200 }, () => 0).map((_, i) => genFrame(makeRng(i), ctx));
    const b = Array.from({ length: 200 }, () => 0).map((_, i) => genFrame(makeRng(i), ctx));
    expect(a.map(String)).toEqual(b.map(String));
    const text = a.filter((x): x is string => typeof x === 'string');
    expect(text.some((t) => t.includes('1e999'))).toBe(true);
    expect(a.some((x) => Buffer.isBuffer(x))).toBe(true);
    expect(toWire({ n: '__INF__' })).toBe('{"n":1e999}');
  });

  it('rejects nested, prototype-keyed, non-finite and oversized payloads before they reach the rules', () => {
    expect(isFlatPayload({ op: 'x', items: ['a', 'b'], n: 3 })).toBe(true);
    expect(isFlatPayload(JSON.parse('{"op":"x","__proto__":{"a":1}}'))).toBe(false);
    expect(isFlatPayload({ op: 'x', n: Infinity })).toBe(false);
    expect(isFlatPayload(JSON.parse('{"op":"x","n":1e999}'))).toBe(false);
    expect(isFlatPayload({ op: 'x', nested: { a: 1 } })).toBe(false);
    expect(isFlatPayload({ op: 'x', toString: { a: 1 } })).toBe(false);
    expect(isFlatPayload({ op: 'x'.repeat(5000) })).toBe(false);
    expect(isFlatPayload({ items: Array.from({ length: 51 }, () => 'a') })).toBe(false);
    expect(isFlatPayload(null)).toBe(false);
    expect(isFlatPayload([])).toBe(false);
  });
});
