import { describe, expect, it } from 'vitest';
import v8 from 'node:v8';
import vm from 'node:vm';
import { applyPatch, compactEntity, DeltaEncoder, diffEntity } from '../shared/net/delta.ts';
import type { SimEntity } from '../shared/types.ts';

const ent = (id: number, x: number, extra: Record<string, unknown> = {}): SimEntity => ({ id, kind: 'player', pos: { x, y: 10 }, vel: { x: 0, y: 0 }, hull: 100, name: 'n', ...extra } as unknown as SimEntity);

describe('delta encoding', () => {
  it('sends full entities first, then only changed fields, and reports removed ids', () => {
    const enc = new DeltaEncoder();
    const a = enc.encode([ent(1, 0), ent(2, 5)]);
    expect(a.patches.every((p) => p.full)).toBe(true);
    const b = enc.encode([ent(1, 3), ent(2, 5)].map((e) => compactEntity(e)));
    expect(b.patches).toHaveLength(1); // entity 2 did not change
    expect(b.patches[0]).toMatchObject({ id: 1, d: { pos: { x: 3, y: 10 } } });
    expect(b.removed).toEqual([]);
    const c = enc.encode([compactEntity(ent(1, 3))]);
    expect(c.removed).toEqual([2]);
    expect(enc.peek(2)).toBeUndefined();
    expect(enc.peek(1)?.pos.x).toBe(3);
    enc.reset();
    expect(enc.encode([compactEntity(ent(1, 3))]).patches[0].full).toBeDefined();
  });

  it('a client that applies the patches ends up with exactly the server state, including dropped fields', () => {
    const enc = new DeltaEncoder(); const client = new Map<number, SimEntity>();
    const states = [ent(1, 0, { targetId: 7 }), ent(1, 4, { targetId: 7 }), ent(1, 9), ent(1, 9, { statusEffects: [{ type: 'burn' }] })].map((e) => compactEntity(e));
    for (const s of states) {
      const { patches, removed } = enc.encode([s]);
      for (const p of patches) applyPatch(client, p);
      for (const id of removed) client.delete(id);
      expect(client.get(1)).toEqual(s);
    }
  });

  it('clients holding the same previous state share one diff object (computed once)', () => {
    const prev = compactEntity(ent(1, 0)); const cur = compactEntity(ent(1, 5));
    const p1 = diffEntity(prev, cur); const p2 = diffEntity(prev, cur);
    expect(p1).toBeDefined();
    expect(p2).toBe(p1);
    expect(diffEntity(prev, prev)).toBeUndefined();
    // a client further behind gets a correct diff against its own old state
    const newer = compactEntity(ent(1, 8));
    expect(diffEntity(prev, newer)).toMatchObject({ d: { pos: { x: 8, y: 10 } } });
    expect(diffEntity(prev, cur)).toMatchObject({ d: { pos: { x: 5, y: 10 } } });
  });

  it('the cache never makes a new state keep the old ones alive (this used to leak ~0.3 MB per tick with 100 players)', async () => {
    v8.setFlagsFromString('--expose-gc');
    const gc = vm.runInNewContext('gc') as () => void;
    const encs = [new DeltaEncoder(), new DeltaEncoder()];
    let first: WeakRef<SimEntity> | undefined;
    for (let t = 0; t < 300; t++) {
      const cur = compactEntity(ent(1, t));
      if (t === 0) first = new WeakRef(cur);
      for (const e of encs) e.encode([cur]); // two clients sharing the same objects, like the server does
    }
    await new Promise((r) => setTimeout(r, 5)); // WeakRef targets live until the end of the current job
    gc();
    expect(first!.deref(), 'oldest state is still referenced by the newest one').toBeUndefined();
  });

  it('compactEntity rounds numbers and positions, keeps other values and drops undefined', () => {
    const c: any = compactEntity(ent(1, 1.23456, { chassisAngle: 1.23456, extra: undefined, tags: ['a'] }));
    expect(c.pos.x).toBe(1.23);
    expect(c.chassisAngle).toBe(1.23);
    expect('extra' in c).toBe(false);
    expect(c.tags).toEqual(['a']);
    expect((compactEntity(ent(1, 1.26), true) as any).pos.x).toBe(1.3);
  });
});
