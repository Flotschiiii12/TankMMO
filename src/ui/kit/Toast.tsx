import React, { useEffect, useState } from 'react';

export type ToastKind = 'info' | 'success' | 'warn' | 'error';
export interface ToastItem { id: number; kind: ToastKind; text: string; icon?: string; ttl: number }

/** Tiny global toast store: push() from anywhere, <ToastHost/> renders them. Grouping/history lives in the notification centre. */
let nextId = 1; let items: ToastItem[] = []; const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const toasts = {
  push(text: string, kind: ToastKind = 'info', ttl = 4000, icon?: string): number { const id = nextId++; items = [...items.slice(-3), { id, kind, text, ttl, icon }]; emit(); return id; },
  dismiss(id: number): void { items = items.filter((t) => t.id !== id); emit(); },
  clear(): void { items = []; emit(); },
  get(): ToastItem[] { return items; },
  subscribe(f: () => void): () => void { subs.add(f); return () => { subs.delete(f); }; },
};

export const ToastHost: React.FC<{ position?: 'bottom-center' | 'top-center'; inline?: boolean }> = ({ position = 'top-center', inline }) => {
  const [list, setList] = useState<ToastItem[]>(toasts.get());
  useEffect(() => toasts.subscribe(() => setList(toasts.get())), []);
  useEffect(() => { const timers = list.map((t) => window.setTimeout(() => toasts.dismiss(t.id), t.ttl)); return () => timers.forEach(clearTimeout); }, [list]);
  const style: React.CSSProperties = inline ? { position: 'static' } : position === 'top-center' ? { top: 'max(12px, var(--safe-top, 0px))', left: '50%', transform: 'translateX(-50%)' } : { bottom: 'max(12px, var(--safe-bottom, 0px))', left: '50%', transform: 'translateX(-50%)' };
  return (
    <div className="k-toasts" style={style} role="log" aria-live="polite">
      {list.map((t) => <div key={t.id} className="k-toast" data-kind={t.kind} role="status">{t.icon && <span aria-hidden>{t.icon}</span>}<span style={{ flex: 1 }}>{t.text}</span><button type="button" className="k-btn k-btn--ghost k-btn--icon" aria-label="Close" onClick={() => toasts.dismiss(t.id)} style={{ minHeight: 28, width: 28 }}>✕</button></div>)}
    </div>
  );
};
