import { ART, useArtFrame } from './art.tsx';
import React from 'react';
import { ringDash } from './logic.ts';

export const Badge: React.FC<{ tone?: 'neutral' | 'accent' | 'good' | 'bad' | 'warn'; children: React.ReactNode; title?: string }> = ({ tone = 'neutral', children, title }) => {
  const ribbon = useArtFrame(ART.badgeRibbon, 12); // painted ribbon behind accent badges once the image exists
  return <span className={`k-badge ${tone === 'neutral' ? '' : `k-badge--${tone}`}`} title={title} {...(tone === 'accent' ? ribbon : {})}>{children}</span>;
};

/** Notification dot or number on top of any child. `count` 0 / false hides it. */
export const PipHost: React.FC<{ count?: number | boolean; children: React.ReactNode; label?: string }> = ({ count, children, label }) => (
  <span className="k-pip-host">
    {children}
    {typeof count === 'number' && count > 0 ? <span className="k-counter" role="status" aria-label={label ? `${label}: ${count}` : String(count)}>{count > 99 ? '99+' : count}</span> : count === true ? <span className="k-pip" role="status" aria-label={label ?? 'new'} /> : null}
  </span>
);

const BAR_COLOR = { hull: 'var(--c-hull)', armor: 'var(--c-armor)', xp: 'var(--c-xp)', accent: 'var(--accent)', warn: 'var(--c-warn)', bad: 'var(--c-bad)' } as const;
export type BarKind = keyof typeof BAR_COLOR;

/** Horizontal bar; `ghost` shows the value from a moment ago, so damage and gains read as a trailing chunk. */
export const ProgressBar: React.FC<{ value: number; max?: number; kind?: BarKind; large?: boolean; label?: React.ReactNode; ghost?: number; ariaLabel?: string }> = ({ value, max = 1, kind = 'accent', large, label, ghost, ariaLabel }) => {
  const p = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const g = ghost !== undefined && max > 0 ? Math.max(0, Math.min(1, ghost / max)) : undefined;
  return (
    <div className={`k-bar ${large ? 'k-bar--lg' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} aria-label={ariaLabel} style={{ ['--bar' as string]: BAR_COLOR[kind] }}>
      {g !== undefined && <div className="k-bar__ghost" style={{ transform: `scaleX(${g})` }} />}
      <div className="k-bar__fill" style={{ transform: `scaleX(${p})` }} />
      {label !== undefined && <div className="k-bar__label">{label}</div>}
    </div>
  );
};

/** Circular gauge (hull / armor / XP). */
export const Ring: React.FC<{ value: number; max?: number; kind?: BarKind; size?: number; stroke?: number; children?: React.ReactNode; ariaLabel?: string }> = ({ value, max = 1, kind = 'accent', size = 56, stroke = 6, children, ariaLabel }) => {
  const r = (size - stroke) / 2; const { circumference, offset } = ringDash(max > 0 ? value / max : 0, r);
  return (
    <div className="k-ring" style={{ width: size, height: size, ['--bar' as string]: BAR_COLOR[kind] }} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} aria-label={ariaLabel}>
      <svg width={size} height={size} aria-hidden>
        <circle className="k-ring__track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className="k-ring__value" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeDasharray={circumference} strokeDashoffset={offset} />
      </svg>
      {children !== undefined && <div className="k-ring__center">{children}</div>}
    </div>
  );
};
