import type { MapColorGrade } from '../../shared/types.ts';

export const DEFAULT_MAP_COLOR_GRADE: MapColorGrade = { r: 242, g: 235, b: 220, a: 0.02 };

interface VignetteCache {
  width: number;
  height: number;
  gradient: CanvasGradient;
}

const vignetteCache = new WeakMap<CanvasRenderingContext2D, VignetteCache>();

export function colorGradeCss(grade?: MapColorGrade): string {
  const value = grade ?? DEFAULT_MAP_COLOR_GRADE;
  const channel = (n: number) => Math.round(Math.max(0, Math.min(255, n)));
  const alpha = Math.max(0, Math.min(0.08, value.a));
  return `rgba(${channel(value.r)}, ${channel(value.g)}, ${channel(value.b)}, ${alpha})`;
}

export function drawPostProcessing(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  grade?: MapColorGrade,
): void {
  const alpha = Math.max(0, Math.min(0.08, grade?.a ?? DEFAULT_MAP_COLOR_GRADE.a));
  if (alpha > 0) {
    ctx.fillStyle = colorGradeCss(grade);
    ctx.fillRect(0, 0, width, height);
  }

  let cached = vignetteCache.get(ctx);
  if (!cached || cached.width !== width || cached.height !== height) {
    const gradient = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.45,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.75,
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
    cached = { width, height, gradient };
    vignetteCache.set(ctx, cached);
  }
  ctx.fillStyle = cached.gradient;
  ctx.fillRect(0, 0, width, height);
}
