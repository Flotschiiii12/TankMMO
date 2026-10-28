import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface NewsItem { id: string; date: string; title: { de: string; en: string }; body: { de: string; en: string }; tag?: 'update' | 'event' | 'info' }

export const DEFAULT_NEWS: NewsItem[] = [
  { id: 'welcome', date: '2026-10-01', tag: 'info', title: { de: 'Willkommen bei Treadfront', en: 'Welcome to Treadfront' }, body: { de: 'Fahre, kämpfe, sammle Beute und baue dein Panzer-Imperium. Tipps findest du im Ladebildschirm.', en: 'Drive, fight, loot and build your tank empire. You will find tips on the loading screen.' } },
];

/** Strips everything but plain text of sane length; the client renders it as text, never as HTML. */
export function sanitizeNews(input: unknown): NewsItem[] {
  if (!Array.isArray(input)) return [];
  const s = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  const out: NewsItem[] = [];
  for (const raw of input.slice(0, 12)) {
    const r: any = raw ?? {};
    const title = { de: s(r.title?.de, 80), en: s(r.title?.en, 80) };
    if (!title.de && !title.en) continue;
    const tag = r.tag === 'update' || r.tag === 'event' || r.tag === 'info' ? r.tag : undefined;
    out.push({ id: s(r.id, 40) || `n${out.length}`, date: s(r.date, 10), title, body: { de: s(r.body?.de, 600), en: s(r.body?.en, 600) }, ...(tag ? { tag } : {}) });
  }
  return out;
}

/** Small JSON file next to the database (or in memory for tests). Edited through the admin page. */
export class NewsStore {
  private items: NewsItem[] = DEFAULT_NEWS;
  constructor(private file?: string) {
    if (file && existsSync(file)) { try { this.items = sanitizeNews(JSON.parse(readFileSync(file, 'utf8'))); } catch { /* keep defaults */ } }
  }
  list(): NewsItem[] { return this.items; }
  set(input: unknown): NewsItem[] {
    this.items = sanitizeNews(input);
    if (this.file) { try { mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(this.file, JSON.stringify(this.items, null, 1)); } catch { /* read-only volume: stays in memory */ } }
    return this.items;
  }
}
