import React from 'react';
import { ArtSlot, ART } from '../kit/art.tsx';

/** Tread insignia + wordmark. A painted `logo.png` replaces it once listed in the asset manifest. */
export const Logo: React.FC<{ size?: 'sm' | 'lg'; tagline?: string }> = ({ size = 'lg', tagline }) => {
  const s = size === 'lg' ? 64 : 36;
  return (
    <div className={`tt-logo tt-logo--${size}`}>
      <ArtSlot src={ART.logo} alt="Treadfront" className="tt-logo__art">
        <svg width={s} height={s} viewBox="0 0 100 100" fill="none" aria-hidden className="tt-logo__mark">
          <rect x="16" y="20" width="68" height="16" rx="5" fill="var(--c-bg-3)" stroke="var(--accent)" strokeWidth="3" />
          <rect x="16" y="64" width="68" height="16" rx="5" fill="var(--c-bg-3)" stroke="var(--accent)" strokeWidth="3" />
          <rect x="26" y="32" width="48" height="36" rx="5" fill="var(--c-bg-2)" stroke="var(--c-text-3)" strokeWidth="2.5" />
          <line x1="50" y1="50" x2="92" y2="50" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" />
          <circle cx="50" cy="50" r="14" fill="var(--c-bg-0)" stroke="var(--accent)" strokeWidth="3" />
          <circle cx="50" cy="50" r="4" fill="var(--accent)" />
        </svg>
        <h1 className="tt-logo__word">TREADFRONT</h1>
      </ArtSlot>
      {tagline && <p className="tt-logo__tag">{tagline}</p>}
    </div>
  );
};
