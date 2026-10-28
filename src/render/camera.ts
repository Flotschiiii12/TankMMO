import { clamp, lerp, Vec2 } from '../sim/types.ts';

export class Camera {
  public pos: Vec2 = { x: 2000, y: 2000 };
  public targetPos: Vec2 = { x: 2000, y: 2000 };
  public viewportWidth = 1200;
  public viewportHeight = 700;
  
  public zoom = 0.85;
  public targetZoom = 0.85;
  public userZoomOverride: number | null = null;

  private shakeIntensity = 0;
  private shakeDecay = 8.0;
  private shakeOffsetX = 0;
  private shakeOffsetY = 0;

  public resize(width: number, height: number) {
    this.viewportWidth = width;
    this.viewportHeight = height;

    const baseDefault = width < 960 || height < 500 ? 0.75 : 0.9;
    if (this.userZoomOverride !== null) {
      this.targetZoom = clamp(this.userZoomOverride, 0.5, 1.2);
    } else {
      this.targetZoom = baseDefault;
    }
  }

  public setUserZoom(z: number | null) {
    this.userZoomOverride = z !== null ? clamp(z, 0.5, 1.2) : null;
    if (this.userZoomOverride !== null) {
      this.targetZoom = this.userZoomOverride;
    } else {
      const baseDefault = this.viewportWidth < 960 || this.viewportHeight < 500 ? 0.75 : 0.9;
      this.targetZoom = baseDefault;
    }
  }

  public adjustZoom(factor: number) {
    const newTarget = clamp(this.targetZoom * factor, 0.5, 1.2);
    this.targetZoom = newTarget;
    this.userZoomOverride = newTarget;
  }

  public setTarget(target: Vec2) {
    this.targetPos = target;
  }

  public addShake(amount: number) {
    // Screen shake is disabled for good (it made the whole view wobble).
    void amount;
  }

  public update(dt: number, mapWidth = 4000, mapHeight = 4000) {
    // Smooth lerp camera tracking
    const followSpeed = 6.0;
    this.pos.x = lerp(this.pos.x, this.targetPos.x, followSpeed * dt);
    this.pos.y = lerp(this.pos.y, this.targetPos.y, followSpeed * dt);

    // Smooth lerp zoom
    this.zoom = lerp(this.zoom, this.targetZoom, 8.0 * dt);

    // Screen shake update
    if (this.shakeIntensity > 0.05) {
      this.shakeOffsetX = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeOffsetY = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * dt);
    } else {
      this.shakeIntensity = 0;
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }

    // Clamp camera within map bounds so edges don't show empty void
    const halfW = this.viewportWidth / (2 * this.zoom);
    const halfH = this.viewportHeight / (2 * this.zoom);

    if (mapWidth > halfW * 2) {
      this.pos.x = clamp(this.pos.x, halfW, mapWidth - halfW);
    }
    if (mapHeight > halfH * 2) {
      this.pos.y = clamp(this.pos.y, halfH, mapHeight - halfH);
    }
  }

  public worldToScreen(worldPos: Vec2): Vec2 {
    const cx = this.viewportWidth / 2;
    const cy = this.viewportHeight / 2;
    return {
      x: cx + (worldPos.x - this.pos.x + this.shakeOffsetX) * this.zoom,
      y: cy + (worldPos.y - this.pos.y + this.shakeOffsetY) * this.zoom,
    };
  }

  public screenToWorld(screenPos: Vec2): Vec2 {
    const cx = this.viewportWidth / 2;
    const cy = this.viewportHeight / 2;
    return {
      x: this.pos.x - this.shakeOffsetX + (screenPos.x - cx) / this.zoom,
      y: this.pos.y - this.shakeOffsetY + (screenPos.y - cy) / this.zoom,
    };
  }
}
