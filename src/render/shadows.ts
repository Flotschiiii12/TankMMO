import type { Vec2 } from '../../shared/types.ts';

const shadowCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();

function getShadowSprite(image: HTMLImageElement): HTMLCanvasElement | null {
  const cached = shadowCache.get(image);
  if (cached) return cached;
  if (typeof document === 'undefined' || image.naturalWidth <= 0 || image.naturalHeight <= 0) return null;

  const silhouette = document.createElement('canvas');
  silhouette.width = image.naturalWidth;
  silhouette.height = image.naturalHeight;
  const silhouetteContext = silhouette.getContext('2d');
  if (!silhouetteContext) return null;
  silhouetteContext.drawImage(image, 0, 0);
  silhouetteContext.globalCompositeOperation = 'source-in';
  silhouetteContext.fillStyle = '#090806';
  silhouetteContext.fillRect(0, 0, silhouette.width, silhouette.height);

  const shadow = document.createElement('canvas');
  shadow.width = image.naturalWidth;
  shadow.height = image.naturalHeight;
  const shadowContext = shadow.getContext('2d');
  if (!shadowContext) return null;
  shadowContext.filter = `blur(${Math.max(2, Math.min(7, image.naturalWidth * 0.018))}px)`;
  shadowContext.drawImage(silhouette, 0, 0);
  shadowContext.filter = 'none';
  shadowCache.set(image, shadow);
  return shadow;
}

/** Cached alpha silhouettes are blurred once at creation, never during an entity draw. */
export function drawSpriteShadow(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  sunDirection: Vec2,
  zoom: number,
  angle = 0,
): boolean {
  const shadow = getShadowSprite(image);
  if (!shadow) return false;

  ctx.save();
  ctx.translate(centerX - sunDirection.x * 8 * zoom, centerY - sunDirection.y * 8 * zoom);
  ctx.rotate(angle);
  ctx.transform(1, 0, 0.12, 0.76, 0, 0);
  ctx.globalAlpha *= 0.38;
  ctx.drawImage(shadow, -width / 2, -height / 2, width, height);
  ctx.restore();
  return true;
}

export function drawStaticSpriteShadow(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  sunDirection: Vec2,
  zoom: number,
): boolean {
  const shadow = getShadowSprite(image);
  if (!shadow) return false;
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = previousAlpha * 0.38;
  ctx.drawImage(
    shadow,
    centerX - sunDirection.x * 8 * zoom - width / 2,
    centerY - sunDirection.y * 8 * zoom - height * 0.38,
    width,
    height * 0.76,
  );
  ctx.globalAlpha = previousAlpha;
  return true;
}
