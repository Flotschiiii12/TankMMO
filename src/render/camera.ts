import { clamp, lerp, Vec2 } from '../sim/types.ts';

export class Camera {
  public pos: Vec2 = { x: 2000, y: 2000 };
  public targetPos: Vec2 = { x: 2000, y: 2000 };
  public viewportWidth = 1200;
  public viewportHeight = 700;
  public zoom = 0.95;

  private shakeIntensity = 0;
  private shakeDecay = 8.0;
  private shakeOffsetX = 0;
  private shakeOffsetY = 0;

  public resize(width: number, height: number) {
    this.viewportWidth = width;
    this.viewportHeight = height;

    // Responsive zoom: maintain comfortable view across phone landscape and large desktop
    if (width < 960) {
      this.zoom = 0.88;
    } else if (width > 1600) {
      this.zoom = 1.05;
    } else {
      this.zoom = 0.95;
    }
  }

  public setTarget(target: Vec2) {
    this.targetPos = target;
  }

  public addShake(amount: number) {
    this.shakeIntensity = Math.min(22, this.shakeIntensity + amount);
  }

  public update(dt: number, mapWidth = 4000, mapHeight = 4000) {
    // Smooth lerp camera tracking
    const followSpeed = 6.0;
    this.pos.x = lerp(this.pos.x, this.targetPos.x, followSpeed * dt);
    this.pos.y = lerp(this.pos.y, this.targetPos.y, followSpeed * dt);

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

    // Clamp camera within map bounds so edges don't show infinite void
    const halfW = (this.viewportWidth / (2 * this.zoom));
    const halfH = (this.viewportHeight / (2 * this.zoom));

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
