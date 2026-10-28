import { useEffect } from 'react';
import { keybinds, windowForBoundCode } from '../title/keybinds.ts';
import { windowForCode } from './defs.ts';
import { windows } from './windowStore.ts';

const typing = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);

/**
 * Global keys for the window system: window shortcuts toggle, Escape closes the top window, and the browser/Android back button
 * closes the top window instead of leaving the game (one history entry is kept while any window is open).
 */
export function WindowKeys({ enabled = true }: { enabled?: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Escape') { if (typing(e.target) && windows.size === 0) return; if (windows.closeTop()) e.stopPropagation(); return; }
      if (typing(e.target)) return;
      const def = e.code === 'Slash' || e.code === 'F1' ? windowForCode(e.code) : windowForBoundCode(keybinds.get(), e.code);
      if (!def) return;
      if (e.code === 'Slash' && !e.shiftKey) return; // plain "/" is for chat commands, only "?" opens the help
      e.preventDefault();
      windows.toggle(def.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let guard = false; let ignorePop = 0;
    const sync = () => {
      if (windows.size > 0 && !guard) { try { history.pushState({ tfwin: 1 }, ''); guard = true; } catch { /* ignore */ } }
      else if (windows.size === 0 && guard) { guard = false; if ((history.state as { tfwin?: number } | null)?.tfwin) { ignorePop++; history.back(); } }
    };
    const onPop = () => {
      if (ignorePop > 0) { ignorePop--; return; }
      if (guard) { guard = false; windows.closeTop(); if (windows.size > 0) { try { history.pushState({ tfwin: 1 }, ''); guard = true; } catch { /* ignore */ } } }
    };
    const off = windows.subscribe(sync);
    window.addEventListener('popstate', onPop);
    return () => { off(); window.removeEventListener('popstate', onPop); };
  }, [enabled]);
  return null;
}
