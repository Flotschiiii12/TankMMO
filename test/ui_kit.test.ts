import { describe, expect, it } from 'vitest';
import { RARITIES, RARITY_STYLE, compactNumber, formatDelta, gridColumns, rarityIconName, rarityStyle, ringDash, tooltipPosition, virtualRange } from '../src/ui/kit/logic.ts';
import { RARITY_CONFIGS } from '../shared/data/items.ts';

describe('rarity mapping', () => {
  it('matches the game data colours and orders the five rarities', () => {
    for (const r of RARITIES) expect(RARITY_STYLE[r].hex).toBe(RARITY_CONFIGS[r].color);
    expect(RARITIES.map((r) => RARITY_STYLE[r].rank)).toEqual([0, 1, 2, 3, 4]);
    expect(rarityStyle('nonsense').hex).toBe(RARITY_STYLE.Common.hex);
    expect(rarityIconName('Epic')).toBe('rarity_epic'); expect(rarityIconName('x')).toBe('rarity_common');
  });
});

describe('delta formatting', () => {
  it('signs, units, direction and good/bad (lower is better flips colour)', () => {
    expect(formatDelta(28)).toEqual({ text: '+28', dir: 'up', good: true });
    expect(formatDelta(-3.5, { unit: 's' })).toEqual({ text: '−3.5s', dir: 'down', good: false });
    expect(formatDelta(0.3, { unit: 's', lowerIsBetter: true })).toEqual({ text: '+0.3s', dir: 'up', good: false });
    expect(formatDelta(-0.3, { lowerIsBetter: true }).good).toBe(true);
    expect(formatDelta(-0.08, { percent: true })).toEqual({ text: '−8.0%', dir: 'down', good: false });
  });
  it('tiny and invalid differences are flat', () => {
    expect(formatDelta(0)).toMatchObject({ dir: 'flat', good: null });
    expect(formatDelta(0.04, { digits: 1 })).toMatchObject({ dir: 'flat' });
    expect(formatDelta(NaN)).toMatchObject({ dir: 'flat' });
  });
});

describe('tooltip positioning', () => {
  const view = { w: 800, h: 400 }; const tip = { w: 200, h: 60 };
  it('prefers the asked side and centres on the anchor', () => {
    const p = tooltipPosition({ x: 300, y: 200, w: 100, h: 40 }, tip, view, 'top');
    expect(p.placement).toBe('top'); expect(p.x).toBe(250); expect(p.y).toBe(200 - 8 - 60);
  });
  it('flips when there is no room and clamps into the viewport', () => {
    expect(tooltipPosition({ x: 300, y: 10, w: 100, h: 40 }, tip, view, 'top').placement).toBe('bottom');
    const edge = tooltipPosition({ x: 0, y: 200, w: 30, h: 30 }, tip, view, 'top');
    expect(edge.x).toBeGreaterThanOrEqual(6);
    const right = tooltipPosition({ x: 790, y: 200, w: 10, h: 30 }, tip, view, 'top');
    expect(right.x + tip.w).toBeLessThanOrEqual(view.w - 6);
  });
});

describe('virtual scrolling maths', () => {
  it('renders only the window plus overscan and keeps the total height', () => {
    const r = virtualRange(1000, 300, 50, 5000);
    expect(r.first).toBe(16); expect(r.last).toBe(30);
    expect(r.padTop + (r.last - r.first) * 50 + r.padBottom).toBe(5000 * 50);
    expect(virtualRange(0, 300, 50, 3)).toMatchObject({ first: 0, last: 3, padBottom: 0 });
    expect(virtualRange(0, 300, 50, 0)).toEqual({ first: 0, last: 0, padTop: 0, padBottom: 0 });
    const end = virtualRange(1e9, 300, 50, 100); expect(end.last).toBe(100);
  });
  it('grid columns follow the width', () => { expect(gridColumns(340, 64, 8)).toBe(4); expect(gridColumns(10, 64, 8)).toBe(1); });
});

describe('ring and numbers', () => {
  it('dash offset for 0, half, full and out-of-range values', () => {
    const c = 2 * Math.PI * 20;
    expect(ringDash(0, 20).offset).toBeCloseTo(c); expect(ringDash(0.5, 20).offset).toBeCloseTo(c / 2); expect(ringDash(1, 20).offset).toBeCloseTo(0);
    expect(ringDash(5, 20).offset).toBeCloseTo(0); expect(ringDash(-1, 20).offset).toBeCloseTo(c); expect(ringDash(NaN, 20).offset).toBeCloseTo(c);
  });
  it('compact numbers', () => {
    expect(compactNumber(950)).toBe('950'); expect(compactNumber(9999)).toBe('9,999'); expect(compactNumber(12400)).toBe('12.4k'); expect(compactNumber(2_500_000)).toBe('2.5M'); expect(compactNumber(3e9)).toBe('3B'); expect(compactNumber(NaN)).toBe('0');
  });
});

import { decideTouchLayout } from '../src/ui/useTouchLayout.ts';
describe('touch layout decision', () => {
  it('explicit setting wins, auto follows the primary pointer', () => {
    expect(decideTouchLayout('on', false)).toBe(true); expect(decideTouchLayout('off', true)).toBe(false);
    expect(decideTouchLayout('auto', true)).toBe(true); expect(decideTouchLayout(undefined, false)).toBe(false);
  });
});
