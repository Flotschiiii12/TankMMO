import { clamp, lerp, Vec2 } from '../sim/types.ts';

export class Camera {
  public pos: Vec2 = { x: 2000, y: 2000 };
  public targetPos: Vec2 = { x: 2000, y: 2000 };
  public viewportWidth = 1200;
  public viewportHeight = 700;
  
  public zoom = 0.85;
  public targetZoom = 0.85;
  public userZoomOverride: number | null = null;
  private motionStrength = 1;
  private combatFocus = false;
  private targetFocus = false;

  private shakeIntensity = 0;
  private shakeDecay = 8.0;
  private shakeOffsetX = 0;
  private shakeOffsetY = 0;
  private shakeElapsed = 0;
  private shakeEnabled = false;
  private shakeStrength = 0.5;

  public resize(width: number, height: number) {
    this.viewportWidth = width;
    this.viewportHeight = height;

    this.refreshTargetZoom();
  }

  public setUserZoom(z: number | null) {
    this.userZoomOverride = z !== null ? clamp(z, 0.5, 1.2) : null;
    this.refreshTargetZoom();
  }

  public adjustZoom(factor: number) {
    this.userZoomOverride = clamp(this.baseZoom() * factor, 0.5, 1.2);
    this.refreshTargetZoom();
  }

  public setMotionStrength(strength: number) {
    this.motionStrength = clamp(strength, 0, 1);
    this.refreshTargetZoom();
  }

  public setCombatFocus(inCombat: boolean, hasTarget: boolean) {
    this.combatFocus = inCombat;
    this.targetFocus = hasTarget;
    this.refreshTargetZoom();
  }

  public setTarget(target: Vec2, velocity?: Vec2) {
    const speed = velocity ? Math.hypot(velocity.x, velocity.y) : 0;
    const lead = Math.min(80, speed * 0.28) * this.motionStrength;
    const scale = speed > 0 ? lead / speed : 0;
    this.targetPos = {
      x: target.x + (velocity?.x ?? 0) * scale,
      y: target.y + (velocity?.y ?? 0) * scale,
    };
  }

  public setShakeSettings(enabled: boolean, strength = 0.5) {
    this.shakeEnabled = enabled;
    this.shakeStrength = clamp(strength, 0, 1);
    if (!enabled || this.shakeStrength === 0) {
      this.shakeIntensity = 0;
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }
  }

  public addShake(amount: number) {
    if (!this.shakeEnabled || amount <= 0) return;
    this.shakeIntensity = clamp(this.shakeIntensity + amount * this.shakeStrength, 0, 16);
  }

  private baseZoom(): number {
    if (this.userZoomOverride !== null) return this.userZoomOverride;
    return this.viewportWidth < 960 || this.viewportHeight < 500 ? 0.75 : 0.9;
  }

  private refreshTargetZoom(): void {
    const focusBoost = (this.combatFocus ? 0.035 : 0) + (this.targetFocus ? 0.045 : 0);
    this.targetZoom = clamp(this.baseZoom() + focusBoost * this.motionStrength, 0.5, 1.2);
  }

  public update(dt: number, mapWidth = 4000, mapHeight = 4000) {
    // Smooth lerp camera tracking
    const followSpeed = 6.0;
    this.pos.x = lerp(this.pos.x, this.targetPos.x, followSpeed * dt);
    this.pos.y = lerp(this.pos.y, this.targetPos.y, followSpeed * dt);

    // Smooth lerp zoom
    this.zoom = lerp(this.zoom, this.targetZoom, 8.0 * dt);

    // Screen shake uses smooth deterministic motion and is opt-in in settings.
    if (this.shakeIntensity > 0.05) {
      this.shakeElapsed += dt;
      this.shakeOffsetX = Math.sin(this.shakeElapsed * 47) * this.shakeIntensity;
      this.shakeOffsetY = Math.sin(this.shakeElapsed * 39 + 1.7) * this.shakeIntensity * 0.7;
      this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * dt);
    } else {
      this.shakeIntensity = 0;
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
      this.shakeElapsed = 0;
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
