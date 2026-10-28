import React from 'react';
import { tr } from '../../i18n.ts';
import { OTHER_SHORTCUTS, WINDOW_DEFS } from './defs.ts';
import { WindowFrame } from './WindowFrame.tsx';
import { keybinds } from '../title/keybinds.ts';
import { useKeybinds } from '../title/useKeybinds.ts';

/** Keyboard shortcut list; opens with ? / F1, closes with Escape. */
export const HelpOverlay: React.FC = () => {
  useKeybinds();
  return (
  <WindowFrame id="shortcuts" width="min(520px, 94vw)" height="min(520px, 90vh)">
    <div className="grid gap-1" style={{ gridTemplateColumns: 'auto 1fr', columnGap: 16 }}>
      {WINDOW_DEFS.filter((d) => d.key).map((d) => (<React.Fragment key={d.id}><kbd className="k-badge k-badge--accent" style={{ justifySelf: 'start' }}>{d.id === 'shortcuts' ? d.key : keybinds.label(`win:${d.id}`)}</kbd><span>{tr(d.title)}</span></React.Fragment>))}
      {[
        { key: (['moveUp', 'moveLeft', 'moveDown', 'moveRight'] as const).map((a) => keybinds.label(a)).join(' '), text: 'Drive' },
        { key: keybinds.label('autoFire'), text: 'Toggle auto fire' },
        { key: (['smoke', 'repair', 'boost'] as const).map((a) => keybinds.label(a)).join(' / '), text: 'Smoke, repair kit, boost' },
        { key: (['ammo1', 'ammo2', 'ammo3'] as const).map((a) => keybinds.label(a)).join(' / '), text: 'Select ammo' },
        { key: keybinds.label('cycleTarget'), text: 'Next target' },
        ...OTHER_SHORTCUTS.filter((o) => !['W A S D / ↑ ← ↓ →', 'Space', 'Q / E / F', '1 / 2 / 3', 'Tab'].includes(o.key)),
      ].map((s) => (<React.Fragment key={s.key}><kbd className="k-badge" style={{ justifySelf: 'start' }}>{s.key}</kbd><span>{tr(s.text)}</span></React.Fragment>))}
    </div>
  </WindowFrame>
  );
};
