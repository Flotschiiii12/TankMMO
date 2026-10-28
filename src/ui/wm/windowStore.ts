import type { WindowId } from './defs.ts';

/**
 * Stack of open windows. The last entry is on top and has the focus; Escape/back close it. Pure and framework free:
 * React reads it with useSyncExternalStore (see useWindows.ts), tests drive it directly.
 */
export class WindowStore {
  private stack: WindowId[] = [];
  private subs = new Set<() => void>();
  private version = 0;
  private snapshot: readonly WindowId[] = [];

  private emit(): void { this.version++; this.snapshot = [...this.stack]; this.subs.forEach((f) => f()); }
  subscribe = (f: () => void): (() => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  getSnapshot = (): readonly WindowId[] => this.snapshot;

  isOpen(id: WindowId): boolean { return this.stack.includes(id); }
  top(): WindowId | undefined { return this.stack[this.stack.length - 1]; }
  /** z-order index of a window (0 = bottom). -1 when closed. */
  order(id: WindowId): number { return this.stack.indexOf(id); }
  open(id: WindowId): void { if (this.top() === id) return; this.stack = [...this.stack.filter((w) => w !== id), id]; this.emit(); }
  close(id: WindowId): void { if (!this.isOpen(id)) return; this.stack = this.stack.filter((w) => w !== id); this.emit(); }
  toggle(id: WindowId): void { if (this.isOpen(id) && this.top() === id) this.close(id); else this.open(id); }
  set(id: WindowId, open: boolean): void { if (open) this.open(id); else this.close(id); }
  raise(id: WindowId): void { if (this.isOpen(id) && this.top() !== id) this.open(id); }
  /** Closes the top window; returns what was closed. */
  closeTop(): WindowId | undefined { const t = this.top(); if (t) this.close(t); return t; }
  closeAll(): void { if (this.stack.length) { this.stack = []; this.emit(); } }
  get size(): number { return this.stack.length; }
  get changes(): number { return this.version; }
}

export const windows = new WindowStore();

// ---------------------------------------------------------------- window positions (desktop floating windows)
export interface Offset { dx: number; dy: number }
/** Keeps a dragged window reachable: at least `grab` px of its header stay inside the viewport. Offsets are relative to the centred position. */
export function clampOffset(o: Offset, size: { w: number; h: number }, view: { w: number; h: number }, grab = 80): Offset {
  const maxDx = view.w / 2 + size.w / 2 - grab; const maxDy = view.h / 2 + size.h / 2 - grab;
  const minDy = Math.min(0, -(view.h / 2 - size.h / 2 - 8)); // the header never leaves the top edge
  return { dx: Math.max(-maxDx, Math.min(maxDx, o.dx)), dy: Math.max(minDy, Math.min(maxDy, o.dy)) };
}

/** Phones and small screens get full-height sheets, everything else floats. */
export function windowMode(view: { w: number; h: number }): 'sheet' | 'float' { return view.w < 900 || view.h < 560 ? 'sheet' : 'float'; }

const POS_KEY = 'treadfront_win_pos';
export function loadOffsets(): Record<string, Offset> {
  try { const v = JSON.parse(localStorage.getItem(POS_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
export function saveOffset(id: string, o: Offset): void {
  try { const all = loadOffsets(); all[id] = { dx: Math.round(o.dx), dy: Math.round(o.dy) }; localStorage.setItem(POS_KEY, JSON.stringify(all)); } catch { /* private mode */ }
}
