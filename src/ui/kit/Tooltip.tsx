import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Placement, tooltipPosition } from './logic.ts';

/**
 * Tooltip for hover, keyboard focus and touch: long-press (450 ms) opens it, any tap elsewhere closes it.
 * Wraps the anchor in a span so it works for any child.
 */
export const Tooltip: React.FC<{ content: React.ReactNode; placement?: Placement; children: React.ReactNode; disabled?: boolean }> = ({ content, placement = 'top', children, disabled }) => {
  const anchor = useRef<HTMLSpanElement>(null); const tip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false); const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<number | undefined>(undefined); const suppressClick = useRef(false);
  const id = useRef(`tip-${Math.random().toString(36).slice(2, 8)}`);

  const show = useCallback(() => { if (!disabled) setOpen(true); }, [disabled]);
  const hide = useCallback(() => { window.clearTimeout(timer.current); setOpen(false); setPos(null); }, []);
  useLayoutEffect(() => {
    if (!open || !anchor.current || !tip.current) return;
    const a = anchor.current.getBoundingClientRect(); const t = tip.current.getBoundingClientRect();
    const p = tooltipPosition({ x: a.left, y: a.top, w: a.width, h: a.height }, { w: t.width, h: t.height }, { w: window.innerWidth, h: window.innerHeight }, placement);
    setPos({ x: p.x, y: p.y });
  }, [open, content, placement]);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!anchor.current?.contains(e.target as Node)) hide(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [open, hide]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <span ref={anchor} className="k-tip-anchor" style={{ display: 'inline-flex' }} aria-describedby={open ? id.current : undefined}
      onMouseEnter={(e) => { if ((e.nativeEvent as PointerEvent).pointerType !== 'touch') show(); }} onMouseLeave={hide} onFocus={show} onBlur={hide}
      onTouchStart={() => { suppressClick.current = false; timer.current = window.setTimeout(() => { suppressClick.current = true; show(); }, 450); }}
      onTouchEnd={() => window.clearTimeout(timer.current)} onTouchMove={() => window.clearTimeout(timer.current)}
      onClickCapture={(e) => { if (suppressClick.current) { e.stopPropagation(); e.preventDefault(); suppressClick.current = false; } }}>
      {children}
      {open && <div ref={tip} id={id.current} role="tooltip" className="k-tip" style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999 }}>{content}</div>}
    </span>
  );
};
