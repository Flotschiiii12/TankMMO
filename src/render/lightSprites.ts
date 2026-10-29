let radialLight: HTMLCanvasElement | null = null;

function getRadialLight(): HTMLCanvasElement | null {
  if (radialLight) return radialLight;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(128, 128, 2, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(255, 232, 173, 0.9)');
  gradient.addColorStop(0.28, 'rgba(255, 180, 90, 0.42)');
  gradient.addColorStop(1, 'rgba(255, 130, 48, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  radialLight = canvas;
  return radialLight;
}

export function drawRadialLight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha = 1,
  angle = 0,
): void {
  const light = getRadialLight();
  if (!light) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(light, -width / 2, -height / 2, width, height);
  ctx.restore();
}
