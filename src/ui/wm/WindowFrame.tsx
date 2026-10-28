import React, { useCallback, useEffect, useRef, useState } from 'react';
import { tr } from '../../i18n.ts';
import { GameIcon } from '../GameIcon.tsx';
import { useFocusTrap } from '../kit/Modal.tsx';
import { Button } from '../kit/Button.tsx';
import { Tooltip } from '../kit/Tooltip.tsx';
import { Offset, clampOffset, loadOffsets, saveOffset, windows } from './windowStore.ts';
import { WINDOW_BY_ID, WindowId } from './defs.ts';
import { useWindowMode, useWindowStack } from './useWindows.ts';
import { keybinds } from '../title/keybinds.ts';

/**
 * The one frame every in-game window uses: stacking and focus, header with title and close, Escape/back close the top window
 * (see WindowKeys), draggable with remembered position on desktop, full-height sheet with a focus trap on phones.
 * Renders nothing while closed. `width`/`height` are the floating size; sheets always fill the screen.
 */
export const WindowFrame: React.FC<{ id: WindowId; title?: string; icon?: string; width?: string; height?: string; headerExtra?: React.ReactNode; className?: string; bodyClassName?: string; noPadding?: boolean; children: React.ReactNode }> = ({ id, title, icon, width = 'min(960px, 96vw)', height = 'min(640px, 92vh)', headerExtra, className = '', bodyClassName = '', noPadding, children }) => {
  const stack = useWindowStack(); const mode = useWindowMode();
  const open = stack.includes(id); const order = stack.indexOf(id); const isTop = order === stack.length - 1;
  const def = WINDOW_BY_ID.get(id);
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState<Offset>(() => loadOffsets()[id] ?? { dx: 0, dy: 0 });
  const drag = useRef<{ x: number; y: number; o: Offset } | null>(null);
  useFocusTrap(ref, open && mode === 'sheet' && isTop);
  useEffect(() => { if (open && mode === 'float') ref.current?.focus({ preventScroll: true }); }, [open, mode]);

  const onDown = useCallback((e: React.PointerEvent) => {
    if (mode !== 'float' || (e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    drag.current = { x: e.clientX, y: e.clientY, o: offset }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [mode, offset]);
  const onMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setOffset(clampOffset({ dx: drag.current.o.dx + e.clientX - drag.current.x, dy: drag.current.o.dy + e.clientY - drag.current.y }, { w: r.width, h: r.height }, { w: window.innerWidth, h: window.innerHeight }));
  }, []);
  const onUp = useCallback(() => { if (drag.current) { drag.current = null; saveOffset(id, offset); } }, [id, offset]);

  if (!open) return null;
  const label = tr(title ?? def?.title ?? id);
  const z = `calc(var(--z-window) + ${order})`;
  const sheet = mode === 'sheet';
  const frameStyle: React.CSSProperties = sheet
    ? { position: 'fixed', inset: 0, zIndex: z as unknown as number, paddingTop: 'var(--safe-top)', paddingLeft: 'var(--safe-left)', paddingRight: 'var(--safe-right)', paddingBottom: 'var(--safe-bottom)' }
    : { position: 'fixed', left: '50%', top: '50%', width, height, maxHeight: '96vh', zIndex: z as unknown as number, transform: `translate(calc(-50% + ${offset.dx}px), calc(-50% + ${offset.dy}px))` };
  return (
    <>
      {sheet && <div className="fixed inset-0" style={{ zIndex: z as unknown as number, background: 'rgba(4,7,12,0.94)' }} aria-hidden />}
      <div ref={ref} role="dialog" aria-label={label} aria-modal={sheet || undefined} tabIndex={-1} data-window={id} data-top={isTop || undefined} onPointerDown={() => windows.raise(id)}
        className={`k-root ${sheet ? '' : 'k-panel'} ${className}`} style={{ ...frameStyle, outline: 'none', ...(sheet ? { display: 'flex', flexDirection: 'column' } : {}) }}>
        <header className="k-panel__head" style={{ cursor: sheet ? 'default' : 'grab', touchAction: 'none', background: sheet ? 'var(--c-bg-1)' : undefined, flex: 'none' }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {(icon ?? def?.icon) && <GameIcon name={icon ?? def!.icon} size={24} />}
          <h3 className="k-panel__title">{label}</h3>
          {def?.key && !sheet && <Tooltip content={tr('Keyboard shortcut')}><kbd className="k-badge" style={{ cursor: 'help' }}>{def.id === 'shortcuts' ? def.key : keybinds.label(`win:${def.id}`)}</kbd></Tooltip>}
          {headerExtra}
          <Button variant="icon" label={tr('Close')} onClick={() => windows.close(id)} data-autofocus>✕</Button>
        </header>
        <div className={`k-panel__body ${noPadding ? '' : ''} ${bodyClassName}`} style={{ padding: noPadding ? 0 : undefined, background: sheet ? 'var(--c-bg-1)' : undefined }}>{children}</div>
      </div>
    </>
  );
};
