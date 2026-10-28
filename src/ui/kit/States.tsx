import React from 'react';

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: React.ReactNode; text?: React.ReactNode; action?: React.ReactNode }> = ({ icon = '∅', title, text, action }) => (
  <div className="k-empty" role="status"><div className="k-empty__icon" aria-hidden>{icon}</div><div className="k-empty__title">{title}</div>{text && <div className="k-empty__text">{text}</div>}{action}</div>
);

/** Placeholder block while data loads; shape it with width/height. */
export const Skeleton: React.FC<{ w?: number | string; h?: number | string; radius?: number; className?: string }> = ({ w = '100%', h = 16, radius, className = '' }) => (
  <div className={`k-skel ${className}`} style={{ width: w, height: h, borderRadius: radius }} aria-hidden />
);
export const SkeletonRows: React.FC<{ rows?: number; h?: number }> = ({ rows = 4, h = 44 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-busy="true" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} h={h} />)}</div>
);
