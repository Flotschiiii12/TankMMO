import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { WindowId } from './defs.ts';
import { windowMode, windows } from './windowStore.ts';

/** Re-renders when any window opens, closes or is raised; returns the stack (bottom to top). */
export function useWindowStack(): readonly WindowId[] { return useSyncExternalStore(windows.subscribe, windows.getSnapshot, windows.getSnapshot); }

/** `[open, setOpen]` for one window, a drop-in for the old `useState(false)` flags. */
export function useWindowFlag(id: WindowId): [boolean, (v: boolean | ((prev: boolean) => boolean)) => void] {
  const stack = useWindowStack();
  const open = stack.includes(id);
  const set = useCallback((v: boolean | ((prev: boolean) => boolean)) => { windows.set(id, typeof v === 'function' ? v(windows.isOpen(id)) : v); }, [id]);
  return [open, set];
}

/** 'sheet' on phones / short screens, 'float' otherwise; follows resizes. */
export function useWindowMode(): 'sheet' | 'float' {
  const [mode, setMode] = useState(() => windowMode({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => { const on = () => setMode(windowMode({ w: window.innerWidth, h: window.innerHeight })); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  return mode;
}
