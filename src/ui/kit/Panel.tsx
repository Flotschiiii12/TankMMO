import React from 'react';
import { ART, useArt } from './art.tsx';

/** Card with optional header, footer and an art slot for a painted frame (falls back to the CSS border). */
export const Panel: React.FC<{ title?: React.ReactNode; actions?: React.ReactNode; footer?: React.ReactNode; accent?: boolean; flat?: boolean; art?: string; className?: string; bodyClassName?: string; style?: React.CSSProperties; children?: React.ReactNode }> = ({ title, actions, footer, accent, flat, art = ART.panelFrame, className = '', bodyClassName = '', style, children }) => {
  const hasArt = useArt(art);
  return (
    <section className={`k-panel ${flat ? 'k-panel--flat' : ''} ${accent ? 'k-panel--accent' : ''} ${className}`} style={style} data-art={hasArt ? 'yes' : 'no'}>
      {hasArt && <div className="k-panel__art" style={{ backgroundImage: `url(${art})` }} />}
      {(title || actions) && <header className="k-panel__head"><h3 className="k-panel__title">{title}</h3>{actions}</header>}
      <div className={`k-panel__body ${bodyClassName}`}>{children}</div>
      {footer && <footer className="k-panel__foot">{footer}</footer>}
    </section>
  );
};
