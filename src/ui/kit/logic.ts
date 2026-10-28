/** Pure helpers of the UI kit (no DOM, no React): unit tested in test/ui_kit.test.ts. */

export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
export const RARITIES: readonly Rarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

/** Rarity -> CSS variable and the same hex as RARITY_CONFIGS (canvas code cannot read CSS variables). */
export const RARITY_STYLE: Record<Rarity, { cssVar: string; hex: string; rank: number }> = {
  Common: { cssVar: '--r-common', hex: '#94a3b8', rank: 0 },
  Uncommon: { cssVar: '--r-uncommon', hex: '#22c55e', rank: 1 },
  Rare: { cssVar: '--r-rare', hex: '#3b82f6', rank: 2 },
  Epic: { cssVar: '--r-epic', hex: '#a855f7', rank: 3 },
  Legendary: { cssVar: '--r-legendary', hex: '#eab308', rank: 4 },
};
export function rarityStyle(r: string): { cssVar: string; hex: string; rank: number } { return RARITY_STYLE[(r in RARITY_STYLE ? r : 'Common') as Rarity]; }
export function rarityIconName(r: string): string { return `rarity_${(r in RARITY_STYLE ? r : 'Common').toLowerCase()}`; }

export interface Delta { text: string; dir: 'up' | 'down' | 'flat'; good: boolean | null }
/**
 * "+12" / "-3.5%" with direction and whether it is good. `lowerIsBetter` flips the colour for stats like reload time.
 * Differences smaller than half a unit of the shown precision count as flat.
 */
export function formatDelta(diff: number, opts: { unit?: string; digits?: number; lowerIsBetter?: boolean; percent?: boolean } = {}): Delta {
  const digits = opts.digits ?? (opts.percent ? 1 : Number.isInteger(diff) ? 0 : 1);
  const v = opts.percent ? diff * 100 : diff;
  const eps = 0.5 * 10 ** -digits;
  if (!Number.isFinite(v) || Math.abs(v) < eps) return { text: '±0', dir: 'flat', good: null };
  const dir = v > 0 ? 'up' : 'down';
  const unit = opts.percent ? '%' : opts.unit ?? '';
  const text = `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}${unit}`;
  const good = opts.lowerIsBetter ? v < 0 : v > 0;
  return { text, dir, good };
}

export type Placement = 'top' | 'bottom' | 'left' | 'right';
/**
 * Tooltip placement: prefer `prefer`, flip when it does not fit, then clamp into the viewport with a margin.
 * Coordinates are the top-left corner of the tooltip in viewport pixels.
 */
export function tooltipPosition(anchor: { x: number; y: number; w: number; h: number }, tip: { w: number; h: number }, view: { w: number; h: number }, prefer: Placement = 'top', gap = 8, margin = 6): { x: number; y: number; placement: Placement } {
  const fits = (p: Placement) => {
    if (p === 'top') return anchor.y - gap - tip.h >= margin;
    if (p === 'bottom') return anchor.y + anchor.h + gap + tip.h <= view.h - margin;
    if (p === 'left') return anchor.x - gap - tip.w >= margin;
    return anchor.x + anchor.w + gap + tip.w <= view.w - margin;
  };
  const opposite: Record<Placement, Placement> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  const order: Placement[] = [prefer, opposite[prefer], 'bottom', 'top', 'right', 'left'];
  const placement = order.find(fits) ?? prefer;
  let x: number; let y: number;
  if (placement === 'top' || placement === 'bottom') { x = anchor.x + anchor.w / 2 - tip.w / 2; y = placement === 'top' ? anchor.y - gap - tip.h : anchor.y + anchor.h + gap; }
  else { y = anchor.y + anchor.h / 2 - tip.h / 2; x = placement === 'left' ? anchor.x - gap - tip.w : anchor.x + anchor.w + gap; }
  x = Math.max(margin, Math.min(view.w - tip.w - margin, x));
  y = Math.max(margin, Math.min(view.h - tip.h - margin, y));
  return { x, y, placement };
}

/** Which rows of a long list to render: [first, last) with overscan, for fixed row height. */
export function virtualRange(scrollTop: number, viewportH: number, rowH: number, count: number, overscan = 4): { first: number; last: number; padTop: number; padBottom: number } {
  if (count <= 0 || rowH <= 0) return { first: 0, last: 0, padTop: 0, padBottom: 0 };
  const first = Math.max(0, Math.floor(scrollTop / rowH) - overscan);
  const last = Math.min(count, Math.ceil((scrollTop + viewportH) / rowH) + overscan);
  return { first, last, padTop: first * rowH, padBottom: Math.max(0, (count - last) * rowH) };
}

/** Grid version: items per row from the container width, then the same range maths per row. */
export function gridColumns(width: number, cell: number, gap: number): number { return Math.max(1, Math.floor((width + gap) / (cell + gap))); }

/** SVG ring: circumference and dash offset for a 0..1 value (clamped). */
export function ringDash(value: number, radius: number): { circumference: number; offset: number } {
  const c = 2 * Math.PI * radius; const v = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return { circumference: c, offset: c * (1 - v) };
}

/** 12400 -> "12.4k", 2_500_000 -> "2.5M"; below 10 000 the full number with thousands separators. */
export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return Math.round(n).toLocaleString('en-US');
}

export const FACTION_THEMES = ['coastal', 'highland', 'steppe'] as const;
export type FactionTheme = (typeof FACTION_THEMES)[number];
export function applyFactionTheme(f: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  if (f && (FACTION_THEMES as readonly string[]).includes(f)) document.documentElement.dataset.faction = f; else delete document.documentElement.dataset.faction;
}
