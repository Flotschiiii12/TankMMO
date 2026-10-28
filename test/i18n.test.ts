import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DE_TABLE, tr } from '../src/i18n.ts';

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

describe('i18n', () => {
  it('every tr()/T() key used in src/ has a German entry', () => {
    const missing = usedKeys().filter(({ key }) => !(key in DE_TABLE));
    const list = [...new Set(missing.map((m) => `${m.key}   (${m.file})`))];
    expect(list, `missing German entries:\n${list.join('\n')}`).toEqual([]);
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
