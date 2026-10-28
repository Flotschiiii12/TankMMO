import React, { useEffect, useRef } from 'react';
import { Panel } from './Panel.tsx';
import { Button } from './Button.tsx';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab inside `root` and restores focus to the opener on unmount. */
export function useFocusTrap(root: React.RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    if (!active || !root.current) return;
    const el = root.current; const opener = document.activeElement as HTMLElement | null;
    (el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus?.();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const f = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener('keydown', onKey);
    return () => { el.removeEventListener('keydown', onKey); opener?.focus?.(); };
  }, [active, root]);
}

/** Centered dialog; `sheet` makes it a bottom sheet (phones). Escape and a click on the scrim close it. */
export const Modal: React.FC<{ open: boolean; title: React.ReactNode; onClose: () => void; sheet?: boolean; footer?: React.ReactNode; closeLabel?: string; children: React.ReactNode }> = ({ open, title, onClose, sheet, footer, closeLabel = 'Close', children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true); }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="k-scrim" data-sheet={sheet ? 'true' : undefined} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} className="k-modal" tabIndex={-1}>
        <Panel title={title} accent footer={footer} actions={<Button variant="icon" label={closeLabel} onClick={onClose}>✕</Button>}>{children}</Panel>
      </div>
    </div>
  );
};
