import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** WCAG contrast of the design tokens (src/ui/kit/tokens.css) for the default theme and the three faction themes. */
const css = readFileSync('src/ui/kit/tokens.css', 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const base = block(':root');
const themes: Record<string, Record<string, string>> = { default: base };
for (const f of ['coastal', 'highland', 'steppe']) themes[f] = { ...base, ...block(`:root[data-faction="${f}"]`) };

const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', ''); const f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}
const luminance = (hex: string) => { const [r, g, b] = rgb(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
export function contrast(a: string, b: string): number { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }

describe('contrast helper', () => {
  it('matches known values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
    expect(contrast('#fff', '#fff')).toBeCloseTo(1, 5);
  });
});

describe('design token contrast (WCAG)', () => {
  const surfaces = ['--c-bg-0', '--c-bg-1', '--c-bg-2', '--c-bg-3'];
  for (const [name, t] of Object.entries(themes)) {
    describe(`theme ${name}`, () => {
      it('body text is at least 7:1 and secondary text at least 4.5:1 on every surface', () => {
        for (const s of surfaces) {
          expect(contrast(t['--c-text'], t[s]), `text on ${s}`).toBeGreaterThanOrEqual(7);
          expect(contrast(t['--c-text-2'], t[s]), `text-2 on ${s}`).toBeGreaterThanOrEqual(4.5);
        }
      });
      it('muted text keeps 4.5:1 on the panel surfaces it is used on', () => {
        for (const s of ['--c-bg-0', '--c-bg-1', '--c-bg-2']) expect(contrast(t['--c-text-3'], t[s]), `text-3 on ${s}`).toBeGreaterThanOrEqual(4.5);
      });
      it('status colours read as text on panels', () => {
        for (const c of ['--c-good', '--c-bad', '--c-warn', '--c-info']) for (const s of ['--c-bg-0', '--c-bg-1', '--c-bg-2']) expect(contrast(t[c], t[s]), `${c} on ${s}`).toBeGreaterThanOrEqual(4.5);
      });
      it('accent works as link/label colour and its ink works on accent buttons', () => {
        for (const s of ['--c-bg-0', '--c-bg-1', '--c-bg-2']) expect(contrast(t['--accent'], t[s]), `accent on ${s}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t['--accent-ink'], t['--accent']), 'accent-ink on accent').toBeGreaterThanOrEqual(4.5);
        expect(contrast(t['--accent-2'], t['--c-bg-1']), 'accent-2 on bg-1').toBeGreaterThanOrEqual(3);
      });
      it('rarity colours stand out from the surfaces (3:1 for icons and borders)', () => {
        for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary']) for (const s of ['--c-bg-1', '--c-bg-2']) expect(contrast(t[`--r-${r}`], t[s]), `rarity ${r} on ${s}`).toBeGreaterThanOrEqual(3);
      });
      it('borders are visible against panels (1.4:1) so controls have a clear edge', () => {
        expect(contrast(t['--c-line-strong'], t['--c-bg-1'])).toBeGreaterThanOrEqual(1.4);
      });
    });
  }
});
