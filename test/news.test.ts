import { describe, it, expect } from 'vitest';
import { createApp } from '../server/app.ts';
import { sanitizeNews, NewsStore } from '../server/news.ts';

describe('news', () => {
  it('sanitizes and caps items', () => {
    const out = sanitizeNews([{ id: 'a', title: { de: 'x'.repeat(200), en: '' }, body: { de: 'b', en: 'c' }, tag: 'evil' }, { title: {} }, ...Array.from({ length: 30 }, (_, i) => ({ title: { en: 'n' + i } }))]);
    expect(out.length).toBe(11); // the cap counts raw entries, the blank one is dropped
    expect(out[0].title.de.length).toBe(80);
    expect(out[0].tag).toBeUndefined();
  });
  it('store keeps defaults without a file', () => {
    const s = new NewsStore();
    expect(s.list().length).toBeGreaterThan(0);
    expect(s.set([{ title: { en: 'Hi' } }]).length).toBe(1);
  });
  it('serves news, status and legal texts; admin edits need the token', async () => {
    const ctx = createApp({ adminToken: 'secret' });
    await new Promise<void>((r) => ctx.server.listen(0, '127.0.0.1', () => r()));
    const base = `http://127.0.0.1:${(ctx.server.address() as any).port}`;
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    try {
      expect(((await (await fetch(base + '/api/news')).json()) as any).items.length).toBeGreaterThan(0);
      const st: any = await (await fetch(base + '/api/status')).json();
      expect(typeof st.online).toBe('number');
      expect(typeof st.protocol).toBe('string');
      expect((await fetch(base + '/legal/terms')).status).toBe(200);
      expect((await fetch(base + '/legal/nope')).status).toBe(404);
      expect((await post('/admin/api/news', { items: [] })).status).toBe(401);
      const r: any = await (await post('/admin/api/news', { items: [{ title: { en: 'Patch' }, body: { en: 'Notes' } }] }, { 'x-admin-token': 'secret' })).json();
      expect(r[0].title.en).toBe('Patch');
      expect(((await (await fetch(base + '/api/news')).json()) as any).items[0].title.en).toBe('Patch');
    } finally { await ctx.game.close(); }
  });
});
