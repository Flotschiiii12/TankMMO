import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import * as C from '../shared/rules/character.ts';
import { SimRNG } from '../shared/prng.ts';

describe('auction recent sales', () => {
  it('returns the last sold prices of one item newest first, nothing for active or other items', () => {
    const ctx = createApp({});
    const a = ctx.service.createGuest(true); if (!a.ok) throw new Error('no account');
    const ch = C.createCharacter('S'); const rng = new SimRNG(3);
    const mk = (defId: string) => { const r = C.createItem(ch, defId, 'Common', rng); if (!r.ok) throw new Error('item'); return r.item; };
    const ids: number[] = [];
    for (const price of [500, 700, 650]) { const l = ctx.market.list(a.cred.accountId, 0, mk('wpn_cannon_t1'), price, 24); if (!l.ok) throw new Error(l.error); ids.push(l.id); }
    const other = ctx.market.list(a.cred.accountId, 0, mk('wpn_cannon_t3'), 3000, 24); if (!other.ok) throw new Error('other');
    expect(ctx.market.recentSales('wpn_cannon_t1')).toEqual([]); // nothing sold yet
    for (const id of ids) ctx.market.close(id, 'sold');
    ctx.market.close(other.id, 'cancelled');
    expect(ctx.market.recentSales('wpn_cannon_t1').map((s) => s.price)).toEqual([650, 700, 500]);
    expect(ctx.market.recentSales('wpn_cannon_t1', 2)).toHaveLength(2);
    expect(ctx.market.recentSales('wpn_cannon_t3')).toEqual([]);
  });
});
