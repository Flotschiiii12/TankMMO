import React from 'react';
import { CurrencyIcon } from '../GameIcon.tsx';
import { CountUp } from '../motion/CountUp.tsx';
import { compactNumber, formatDelta } from './logic.ts';

/** Wallet chip with the painted icon: <CurrencyChip kind="scrap" value={1234} />. */
export const CurrencyChip: React.FC<{ kind: string; value: number; label?: string; compact?: boolean; title?: string }> = ({ kind, value, label, compact, title }) => (
  <span className="k-chip" title={title ?? label ?? kind.replace(/_/g, ' ')}>
    <CurrencyIcon kind={kind} size={16} label={label ?? kind} />
    {label && <span className="k-chip__label">{label}</span>}
    {compact ? <span>{compactNumber(value)}</span> : <CountUp value={Math.round(value)} />}
  </span>
);

/** One line of a stat table; with `compareTo` it shows a green/red delta (inverse stats like reload use lowerIsBetter). */
export const StatRow: React.FC<{ label: React.ReactNode; value: number; compareTo?: number; unit?: string; digits?: number; percent?: boolean; lowerIsBetter?: boolean }> = ({ label, value, compareTo, unit, digits, percent, lowerIsBetter }) => {
  const shown = percent ? `${(value * 100).toFixed(digits ?? 1)}%` : `${Number.isInteger(value) && digits === undefined ? value : value.toFixed(digits ?? 1)}${unit ?? ''}`;
  const d = compareTo !== undefined ? formatDelta(value - compareTo, { unit, digits, percent, lowerIsBetter }) : undefined;
  return (
    <div className="k-stat">
      <span className="k-stat__label">{label}</span>
      <span className="k-stat__value">{shown}</span>
      {d && <span className="k-stat__delta" data-dir={d.dir} data-good={d.good === null ? undefined : String(d.good)} aria-label={d.dir === 'flat' ? 'unchanged' : d.good ? 'better' : 'worse'}>{d.dir === 'up' ? '▲' : d.dir === 'down' ? '▼' : '•'} {d.text}</span>}
    </div>
  );
};
