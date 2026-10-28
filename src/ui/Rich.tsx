import React from 'react';
import { tr } from '../i18n.ts';

/** Translates `text` and renders `*word*` segments highlighted, so sentences keep their word order in every language. */
export function Rich({ text, className = 'text-white font-medium' }: { text: string; className?: string }) {
  const parts = tr(text).split('*');
  return <>{parts.map((p, i) => (i % 2 === 1 ? <span key={i} className={className}>{p}</span> : <React.Fragment key={i}>{p}</React.Fragment>))}</>;
}
