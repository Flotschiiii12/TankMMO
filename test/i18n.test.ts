import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DE_TABLE, EN_TABLE, tr } from '../src/i18n.ts';
import { TRANSLATIONS } from '../shared/data/i18n.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Every literal passed to tr('...'), T('...') or <Rich text="..." /> in src/. */
function usedKeys(): Array<{ key: string; file: string }> {
  const found: Array<{ key: string; file: string }> = [];
  const re = /\b(?:tr|T)\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1|<Rich\s+text=(["'])((?:(?!\3).)*)\3/g;
  for (const file of walk('src')) {
    if (file.endsWith('src/i18n.ts')) continue;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(re)) {
      const raw = m[2] ?? m[4];
      if (raw === undefined || raw.includes('${')) continue; // dynamic template: cannot be checked statically
      found.push({ key: raw.replace(/\\(['"`\\])/g, '$1'), file });
    }
  }
  return found;
}

function untranslatedJsxText(): Array<{ key: string; file: string }> {
  const found: Array<{ key: string; file: string }> = [];
  for (const file of walk('src/ui').filter((p) => p.endsWith('.tsx'))) {
    if (file.endsWith('src/ui/kit/Gallery.tsx')) continue;
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/<([A-Za-z][\w.]*)\b[^<>]*>([^<>]+)<\/\1>/g)) {
      const key = match[2].trim();
      if (/[A-Za-z]/.test(key) && !/[{}]/.test(key) && key !== 'TREADFRONT') found.push({ key, file });
    }
    for (const match of text.matchAll(/\b(?:aria-label|placeholder|title)=(["'])(.*?)\1/g)) {
      const key = match[2].trim();
      if (/[A-Za-z]/.test(key) && !/[{}]/.test(key) && key !== 'Treadfront' && !/^X+(?:-X+)+$/.test(key)) found.push({ key, file });
    }
  }
  return found;
}

describe('i18n', () => {
  it('has a non-empty English and German entry for every UI key', () => {
    expect(Object.keys(EN_TABLE).sort()).toEqual(Object.keys(DE_TABLE).sort());
    for (const key of Object.keys(EN_TABLE)) {
      expect(EN_TABLE[key]?.trim().length, `English entry "${key}"`).toBeGreaterThan(0);
      expect(DE_TABLE[key]?.trim().length, `German entry "${key}"`).toBeGreaterThan(0);
    }
  });

  it('has non-empty English and German entries for every shared data key', () => {
    expect(Object.keys(TRANSLATIONS.en).sort()).toEqual(Object.keys(TRANSLATIONS.de).sort());
    for (const key of Object.keys(TRANSLATIONS.en)) {
      expect(TRANSLATIONS.en[key]?.trim().length, `English data entry "${key}"`).toBeGreaterThan(0);
      expect(TRANSLATIONS.de[key]?.trim().length, `German data entry "${key}"`).toBeGreaterThan(0);
    }
  });

  it('every tr()/T() key used in src/ has a German entry', () => {
    const missing = usedKeys().filter(({ key }) => !(key in DE_TABLE));
    const list = [...new Set(missing.map((m) => `${m.key}   (${m.file})`))];
    expect(list, `missing German entries:\n${list.join('\n')}`).toEqual([]);
  });

  it('does not leave English text directly in UI JSX', () => {
    const missing = untranslatedJsxText().filter(({ key }) => !(key in DE_TABLE) || !(key in EN_TABLE));
    const list = [...new Set(missing.map((m) => `${m.key}   (${m.file})`))];
    expect(list, `untranslated JSX text:\n${list.join('\n')}`).toEqual([]);
  });

  it('finds a healthy number of keys (guards against the scanner silently matching nothing)', () => {
    expect(usedKeys().length).toBeGreaterThan(150);
  });

  it('has no German entry that is empty or identical placeholders-mismatched', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const [en, de] of Object.entries(DE_TABLE)) {
      expect(de.trim().length, en).toBeGreaterThan(0);
      expect(ph(de), `placeholders of "${en}"`).toBe(ph(en));
    }
  });

  it('interpolates {vars} and falls back to the key', () => {
    expect(tr('Hello {name}', { name: 'Ada' })).toBe('Hello Ada');
    expect(tr('No such key {n}', { n: 3 })).toBe('No such key 3');
  });
});
