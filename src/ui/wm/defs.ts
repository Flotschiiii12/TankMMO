/** All in-game windows in one table: id, title, icon, shortcut. The menu, the help overlay and the key handler read from here. */
export type WindowId = 'garage' | 'inventory' | 'quests' | 'social' | 'map' | 'settings' | 'howto' | 'feedback' | 'shortcuts' | 'notifications' | 'market' | 'career';

export interface WindowDef {
  id: WindowId;
  /** English title (the UI passes it through tr()) */
  title: string;
  icon: string;
  /** KeyboardEvent.code values that toggle it, first one is shown in hints */
  codes: string[];
  /** label of the shortcut shown to players */
  key?: string;
  /** shown in the main menu rail */
  menu: boolean;
}

export const WINDOW_DEFS: readonly WindowDef[] = [
  { id: 'garage', title: 'Garage', icon: 'anvil', codes: ['KeyG', 'KeyV'], key: 'G', menu: true },
  { id: 'inventory', title: 'Inventory & Loadout', icon: 'inventory', codes: ['KeyI'], key: 'I', menu: true },
  { id: 'quests', title: 'Quests', icon: 'quests', codes: ['KeyJ'], key: 'J', menu: true },
  { id: 'social', title: 'Social', icon: 'friends', codes: ['KeyC'], key: 'C', menu: true },
  { id: 'map', title: 'World Map', icon: 'map', codes: ['KeyM'], key: 'M', menu: true },
  { id: 'howto', title: 'How to play', icon: 'tutorial', codes: ['KeyH'], key: 'H', menu: false },
  { id: 'settings', title: 'Settings', icon: 'settings', codes: ['KeyO'], key: 'O', menu: true },
  { id: 'career', title: 'Career', icon: 'codex', codes: ['KeyX', 'KeyT'], key: 'X', menu: true },
  { id: 'market', title: 'Market & Mail', icon: 'auction', codes: ['KeyK'], key: 'K', menu: true },
  { id: 'notifications', title: 'Notifications', icon: 'event', codes: ['KeyN'], key: 'N', menu: true },
  { id: 'feedback', title: 'Send feedback', icon: 'report', codes: [], menu: false },
  { id: 'shortcuts', title: 'Keyboard shortcuts', icon: 'settings', codes: ['F1', 'Slash'], key: '?', menu: false },
];
export const WINDOW_BY_ID = new Map(WINDOW_DEFS.map((d) => [d.id, d]));

/** Non-window shortcuts, listed in the help overlay. */
export const OTHER_SHORTCUTS: ReadonlyArray<{ key: string; text: string }> = [
  { key: 'W A S D / ↑ ← ↓ →', text: 'Drive' },
  { key: 'Space', text: 'Toggle auto fire' },
  { key: 'Q / E / F', text: 'Smoke, repair kit, boost' },
  { key: '1 / 2 / 3', text: 'Select ammo' },
  { key: 'Tab', text: 'Next target' },
  { key: 'Enter', text: 'Chat' },
  { key: 'Alt + 1-5', text: 'Emotes' },
  { key: 'F3', text: 'Debug panel' },
  { key: 'Esc', text: 'Close the top window' },
];

export function windowForCode(code: string): WindowDef | undefined { return WINDOW_DEFS.find((d) => d.codes.includes(code)); }
