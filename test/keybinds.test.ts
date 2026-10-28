import { describe, expect, it } from 'vitest';
import { BIND_DEFS, actionForCode, codeLabel, defaultBinds, mergeBinds, rebind, windowForBoundCode } from '../src/ui/title/keybinds.ts';

describe('keybinds', () => {
  it('defaults are unique and cover the old keys', () => {
    const d = defaultBinds();
    const codes = Object.values(d);
    expect(new Set(codes).size).toBe(codes.length);
    expect(d.smoke).toBe('KeyQ'); expect(d['win:garage']).toBe('KeyG');
    expect(BIND_DEFS.length).toBeGreaterThan(20);
  });
  it('rebind refuses reserved keys and conflicts, swaps on request', () => {
    const d = defaultBinds();
    expect(rebind(d, 'smoke', 'Escape')).toEqual({ ok: false, reason: 'reserved' });
    const c = rebind(d, 'smoke', 'KeyE');
    expect(c).toEqual({ ok: false, reason: 'conflict', conflict: 'repair' });
    const s = rebind(d, 'smoke', 'KeyE', true);
    expect(s.ok && s.binds.smoke).toBe('KeyE');
    expect(s.ok && s.binds.repair).toBe('KeyQ');
    const f = rebind(d, 'smoke', 'KeyZ');
    expect(f.ok && f.binds.smoke).toBe('KeyZ');
  });
  it('mergeBinds survives garbage and duplicates', () => {
    expect(mergeBinds(null)).toEqual(defaultBinds());
    const m = mergeBinds({ smoke: 'KeyE', nope: 'KeyX', boost: 5, repair: 'Escape' });
    expect(m.smoke).toBe('KeyE');
    expect(m.repair).toBe(''); // its default key was taken, so it ends up unbound rather than doubled
    const codes = Object.values(m).filter(Boolean);
    expect(new Set(codes).size).toBe(codes.length);
  });
  it('window keys follow the remap and keep the secondary alias', () => {
    const d = defaultBinds();
    expect(windowForBoundCode(d, 'KeyV')?.id).toBe('garage');
    const r = rebind(d, 'win:garage', 'KeyZ');
    const b = r.ok ? r.binds : d;
    expect(windowForBoundCode(b, 'KeyZ')?.id).toBe('garage');
    expect(windowForBoundCode(b, 'KeyG')).toBeUndefined();
    expect(actionForCode(b, 'KeyZ')).toBe('win:garage');
    expect(codeLabel('KeyZ')).toBe('Z'); expect(codeLabel('Digit2')).toBe('2');
  });
});
