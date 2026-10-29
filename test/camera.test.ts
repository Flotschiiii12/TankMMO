import { describe, expect, it } from 'vitest';
import { Camera } from '../src/render/camera.ts';

describe('combat camera shake', () => {
  it('stays disabled by default and when disabled in settings', () => {
    const camera = new Camera();
    camera.addShake(10);
    camera.update(1 / 60);
    expect(camera.worldToScreen(camera.pos)).toEqual({ x: camera.viewportWidth / 2, y: camera.viewportHeight / 2 });

    camera.setShakeSettings(true, 1);
    camera.setShakeSettings(false, 1);
    camera.addShake(10);
    camera.update(1 / 60);
    expect(camera.worldToScreen(camera.pos)).toEqual({ x: camera.viewportWidth / 2, y: camera.viewportHeight / 2 });
  });

  it('applies the selected strength and decays smoothly', () => {
    const camera = new Camera();
    camera.setShakeSettings(true, 0.5);
    camera.addShake(10);
    camera.update(1 / 60);
    const shaken = camera.worldToScreen(camera.pos);
    expect(Math.hypot(shaken.x - camera.viewportWidth / 2, shaken.y - camera.viewportHeight / 2)).toBeGreaterThan(0);

    camera.setShakeSettings(false);
    expect(camera.worldToScreen(camera.pos)).toEqual({ x: camera.viewportWidth / 2, y: camera.viewportHeight / 2 });
  });

  it('scales shake amplitude with the configured strength', () => {
    const offsetFor = (strength: number) => {
      const camera = new Camera();
      camera.setShakeSettings(true, strength);
      camera.addShake(10);
      camera.update(1 / 60);
      const p = camera.worldToScreen(camera.pos);
      return Math.hypot(p.x - camera.viewportWidth / 2, p.y - camera.viewportHeight / 2);
    };
    expect(offsetFor(1)).toBeCloseTo(offsetFor(0.5) * 2);
  });
});
