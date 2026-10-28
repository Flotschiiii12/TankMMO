import React, { useEffect, useState } from 'react';
import { tr } from '../../i18n.ts';
import { Button } from '../kit/Button.tsx';
import { BIND_DEFS, keybinds, rebind, type BindAction } from '../title/keybinds.ts';
import { useKeybinds } from '../title/useKeybinds.ts';

const GROUPS: Array<[string, 'drive' | 'combat' | 'windows']> = [['Driving', 'drive'], ['Combat', 'combat'], ['Windows', 'windows']];

/** Keybinding list. Click a key, press the new one (Esc cancels). A key that is already in use asks before swapping. */
export const KeysTab: React.FC = () => {
  useKeybinds();
  const [listening, setListening] = useState<BindAction | null>(null);
  const [problem, setProblem] = useState<{ action: BindAction; code: string; kind: 'reserved' | 'conflict'; other?: BindAction } | null>(null);
  const labelOf = (a: BindAction) => tr(BIND_DEFS.find((d) => d.action === a)?.label ?? a);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation(); // the game and window shortcuts must not react while we capture
      if (e.code === 'Escape') { setListening(null); return; }
      if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) return;
      const r = rebind(keybinds.get(), listening, e.code);
      if (r.ok) { keybinds.set(r.binds); setProblem(null); }
      else setProblem({ action: listening, code: e.code, kind: r.reason, other: r.conflict });
      setListening(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening]);

  return (
    <div className="st-body" data-testid="keys-tab">
      <p className="st-row__hint" style={{ margin: 0 }}>{tr('Arrow keys always drive as well. Esc, Enter, F1 and F3 are reserved.')}</p>
      {problem && (
        <div className="st-note" role="alert">
          {problem.kind === 'reserved' ? tr('That key is reserved.') : tr('{key} is already used for {action}.', { key: problem.code.replace(/^Key|^Digit/, ''), action: labelOf(problem.other!) })}{' '}
          {problem.kind === 'conflict' && <Button onClick={() => { const r = rebind(keybinds.get(), problem.action, problem.code, true); if (r.ok) keybinds.set(r.binds); setProblem(null); }}>{tr('Swap keys')}</Button>}
        </div>
      )}
      {GROUPS.map(([name, group]) => (
        <React.Fragment key={group}>
          <div className="st-groupname">{tr(name)}</div>
          <div className="st-keys">
            {BIND_DEFS.filter((d) => d.group === group).map((d) => (
              <div key={d.action} className="st-key">
                <span>{tr(d.label)}</span>
                <button type="button" data-listening={listening === d.action} data-bind={d.action} aria-label={`${tr(d.label)}: ${keybinds.label(d.action)}`}
                  onClick={() => { setProblem(null); setListening(listening === d.action ? null : d.action); }}>
                  {listening === d.action ? tr('Press a key…') : keybinds.label(d.action)}
                </button>
              </div>
            ))}
          </div>
        </React.Fragment>
      ))}
      <div><Button onClick={() => { keybinds.reset(); setProblem(null); }}>{tr('Reset keys to default')}</Button></div>
    </div>
  );
};
