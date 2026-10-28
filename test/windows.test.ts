import { describe, expect, it } from 'vitest';
import { WindowStore, clampOffset, windowMode } from '../src/ui/wm/windowStore.ts';
import { OTHER_SHORTCUTS, WINDOW_DEFS, windowForCode } from '../src/ui/wm/defs.ts';

describe('window stack', () => {
  it('opens on top, raises instead of duplicating, closes the top first', () => {
    const w = new WindowStore();
    w.open('inventory'); w.open('garage'); w.open('inventory');
    expect(w.getSnapshot()).toEqual(['garage', 'inventory']); expect(w.top()).toBe('inventory');
    expect(w.closeTop()).toBe('inventory'); expect(w.top()).toBe('garage');
    expect(w.closeTop()).toBe('garage'); expect(w.closeTop()).toBeUndefined();
  });
  it('toggle closes only when on top, otherwise raises', () => {
    const w = new WindowStore();
    w.open('quests'); w.open('map');
    w.toggle('quests'); expect(w.top()).toBe('quests'); expect(w.size).toBe(2);
    w.toggle('quests'); expect(w.isOpen('quests')).toBe(false);
  });
  it('notifies subscribers once per change and snapshots are stable between changes', () => {
    const w = new WindowStore(); let n = 0; const off = w.subscribe(() => n++);
    w.open('map'); w.open('map'); w.close('garage'); expect(n).toBe(1);
    const a = w.getSnapshot(); expect(w.getSnapshot()).toBe(a);
    w.set('map', false); expect(n).toBe(2); off(); w.open('map'); expect(n).toBe(2);
  });
});

describe('window geometry', () => {
  it('keeps a dragged window reachable', () => {
    const c = clampOffset({ dx: 5000, dy: 5000 }, { w: 800, h: 500 }, { w: 1280, h: 720 });
    expect(c.dx).toBeLessThanOrEqual(1280 / 2 + 400 - 80); expect(c.dy).toBeLessThanOrEqual(720 / 2 + 250 - 80);
    const t = clampOffset({ dx: -9000, dy: -9000 }, { w: 800, h: 500 }, { w: 1280, h: 720 });
    expect(t.dx).toBeGreaterThanOrEqual(-(640 + 400 - 80)); expect(t.dy).toBe(-(360 - 250 - 8)); // window top stays 8 px below the screen edge
    expect(clampOffset({ dx: 10, dy: -20 }, { w: 800, h: 500 }, { w: 1280, h: 720 })).toEqual({ dx: 10, dy: -20 });
  });
  it('phones and short screens get sheets', () => {
    expect(windowMode({ w: 844, h: 390 })).toBe('sheet'); expect(windowMode({ w: 1280, h: 540 })).toBe('sheet'); expect(windowMode({ w: 1280, h: 720 })).toBe('float'); expect(windowMode({ w: 800, h: 900 })).toBe('sheet');
  });
});

describe('shortcut table', () => {
  it('has no key bound twice and the documented keys', () => {
    const codes = WINDOW_DEFS.flatMap((d) => d.codes); expect(new Set(codes).size).toBe(codes.length);
    for (const [k, id] of [['KeyI', 'inventory'], ['KeyJ', 'quests'], ['KeyM', 'map'], ['KeyC', 'social'], ['KeyG', 'garage'], ['KeyV', 'garage']] as const) expect(windowForCode(k)?.id).toBe(id);
    for (const reserved of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyF', 'Digit1', 'Space', 'Tab', 'Enter']) expect(codes).not.toContain(reserved);
    expect(OTHER_SHORTCUTS.length).toBeGreaterThan(4);
  });
});
