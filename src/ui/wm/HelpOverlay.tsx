import React from 'react';
import { tr } from '../../i18n.ts';
import { OTHER_SHORTCUTS, WINDOW_DEFS } from './defs.ts';
import { WindowFrame } from './WindowFrame.tsx';

/** Keyboard shortcut list; opens with ? / F1, closes with Escape. */
export const HelpOverlay: React.FC = () => (
  <WindowFrame id="shortcuts" width="min(520px, 94vw)" height="min(520px, 90vh)">
    <div className="grid gap-1" style={{ gridTemplateColumns: 'auto 1fr', columnGap: 16 }}>
      {WINDOW_DEFS.filter((d) => d.key).map((d) => (<React.Fragment key={d.id}><kbd className="k-badge k-badge--accent" style={{ justifySelf: 'start' }}>{d.key}</kbd><span>{tr(d.title)}</span></React.Fragment>))}
      {OTHER_SHORTCUTS.map((s) => (<React.Fragment key={s.key}><kbd className="k-badge" style={{ justifySelf: 'start' }}>{s.key}</kbd><span>{tr(s.text)}</span></React.Fragment>))}
    </div>
  </WindowFrame>
);
