import { useSyncExternalStore } from 'react';
import { keybinds, type BindMap } from './keybinds.ts';

/** Re-renders when the player remaps a key; returns the live map. */
export function useKeybinds(): BindMap { return useSyncExternalStore((l) => keybinds.subscribe(l), () => keybinds.get()); }
