/**
 * Remappable keys. Defaults match the old hard-coded ones; a player's changes live in localStorage (per device, not per
 * account). Arrow keys always drive as an alias, and a few keys (Esc, Enter, F1, F3...) are reserved for the system.
 */
import { WINDOW_DEFS, type WindowDef } from '../wm/defs.ts';

export type GameAction = 'moveUp' | 'moveDown' | 'moveLeft' | 'moveRight' | 'autoFire' | 'smoke' | 'repair' | 'boost' | 'ammo1' | 'ammo2' | 'ammo3' | 'cycleTarget';
export type WindowAction = `win:${string}`;
export type BindAction = GameAction | WindowAction;

export interface BindDef { action: BindAction; label: string; code: string; group: 'drive' | 'combat' | 'windows' }

const GAME: BindDef[] = [
  { action: 'moveUp', label: 'Drive forward', code: 'KeyW', group: 'drive' },
  { action: 'moveDown', label: 'Drive back', code: 'KeyS', group: 'drive' },
  { action: 'moveLeft', label: 'Turn left', code: 'KeyA', group: 'drive' },
  { action: 'moveRight', label: 'Turn right', code: 'KeyD', group: 'drive' },
  { action: 'autoFire', label: 'Toggle auto fire', code: 'Space', group: 'combat' },
  { action: 'smoke', label: 'Smoke screen', code: 'KeyQ', group: 'combat' },
  { action: 'repair', label: 'Repair kit', code: 'KeyE', group: 'combat' },
  { action: 'boost', label: 'Boost', code: 'KeyF', group: 'combat' },
  { action: 'ammo1', label: 'Standard ammo', code: 'Digit1', group: 'combat' },
  { action: 'ammo2', label: 'Armor-piercing ammo', code: 'Digit2', group: 'combat' },
  { action: 'ammo3', label: 'Explosive ammo', code: 'Digit3', group: 'combat' },
  { action: 'cycleTarget', label: 'Next target', code: 'Tab', group: 'combat' },
];

/** Windows with a shortcut can be remapped too (the first code of the window definition). */
const WINDOWS: BindDef[] = WINDOW_DEFS.filter((d) => d.codes.length > 0 && d.id !== 'shortcuts').map((d) => ({ action: `win:${d.id}` as WindowAction, label: d.title, code: d.codes[0], group: 'windows' as const }));

export const BIND_DEFS: readonly BindDef[] = [...GAME, ...WINDOWS];
export const RESERVED_CODES: ReadonlySet<string> = new Set(['Escape', 'Enter', 'NumpadEnter', 'F1', 'F3', 'F5', 'F11', 'F12', 'Slash', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);
const STORE_KEY = 'treadfront_keys';

export type BindMap = Record<string, string>;
export const defaultBinds = (): BindMap => Object.fromEntries(BIND_DEFS.map((d) => [d.action, d.code]));

/** Overrides on top of the defaults. Unknown actions, reserved codes and duplicates are dropped (first wins) so a bad save never breaks the controls. */
export function mergeBinds(overrides: unknown): BindMap {
  const out = defaultBinds();
  if (!overrides || typeof overrides !== 'object') return out;
  const proposed: BindMap = { ...out };
  for (const [a, c] of Object.entries(overrides as Record<string, unknown>)) {
    if (a in out && typeof c === 'string' && /^[A-Za-z0-9]{1,16}$/.test(c) && !RESERVED_CODES.has(c)) proposed[a] = c;
  }
  const seen = new Set<string>();
  for (const d of BIND_DEFS) { // a duplicate falls back to the default of the later action
    let c = proposed[d.action];
    if (seen.has(c)) c = out[d.action];
    if (seen.has(c)) c = '';
    out[d.action] = c; if (c) seen.add(c);
  }
  return out;
}

export type RebindResult = { ok: true; binds: BindMap; swapped?: BindAction } | { ok: false; reason: 'reserved' | 'conflict'; conflict?: BindAction };

/** Binds `code` to `action`. A key that another action uses is refused unless `swap` is set, then the two exchange keys. */
export function rebind(binds: BindMap, action: BindAction, code: string, swap = false): RebindResult {
  if (RESERVED_CODES.has(code)) return { ok: false, reason: 'reserved' };
  const other = (Object.keys(binds) as BindAction[]).find((a) => a !== action && binds[a] === code);
  if (other && !swap) return { ok: false, reason: 'conflict', conflict: other };
  const next = { ...binds };
  if (other) next[other] = binds[action];
  next[action] = code;
  return { ok: true, binds: next, swapped: other };
}

export function actionForCode(binds: BindMap, code: string): BindAction | undefined {
  return (Object.keys(binds) as BindAction[]).find((a) => binds[a] === code);
}

/** The window a key toggles: the player's remapped key, or one of the definition's secondary codes (V for the garage, T for career). */
export function windowForBoundCode(binds: BindMap, code: string): WindowDef | undefined {
  const a = actionForCode(binds, code);
  if (a?.startsWith('win:')) return WINDOW_DEFS.find((d) => `win:${d.id}` === a);
  if (a) return undefined; // the key is used for something else now
  return WINDOW_DEFS.find((d) => d.codes.slice(1).includes(code) && binds[`win:${d.id}`] === d.codes[0]);
}

export const codeLabel = (code: string): string => {
  if (!code) return '–';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  if (code === 'Space') return 'Space';
  return code.replace(/^(Left|Right)$/, '$1');
};

type Listener = () => void;
class KeyBindStore {
  private binds: BindMap = defaultBinds();
  private listeners = new Set<Listener>();
  constructor() { this.load(); }
  private load(): void {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) this.binds = mergeBinds(JSON.parse(raw)); } catch { /* private mode or bad json */ }
  }
  get(): BindMap { return this.binds; }
  codeOf(a: BindAction): string { return this.binds[a] ?? ''; }
  label(a: BindAction): string { return codeLabel(this.codeOf(a)); }
  set(next: BindMap): void {
    this.binds = next;
    const d = defaultBinds();
    const diff = Object.fromEntries(Object.entries(next).filter(([a, c]) => c !== d[a]));
    try { if (Object.keys(diff).length) localStorage.setItem(STORE_KEY, JSON.stringify(diff)); else localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    this.listeners.forEach((l) => l());
  }
  reset(): void { this.set(defaultBinds()); }
  subscribe(l: Listener): () => void { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
}
export const keybinds = new KeyBindStore();
