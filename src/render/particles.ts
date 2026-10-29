import { Vec2 } from '../sim/types.ts';
import { Camera } from './camera.ts';
import { spriteRegistry } from './assets.ts';
import { drawRadialLight } from './lightSprites.ts';

/** Hard cap of simultaneous particles; low quality lowers it to REDUCED_PARTICLE_CAP. */
export const PARTICLE_CAP = 600;
export const REDUCED_PARTICLE_CAP = 120;

export interface Particle {
  active: boolean;
  type: 'dust' | 'muzzle' | 'spark' | 'smoke' | 'explosion' | 'damage_text' | 'ring';
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  maxSize: number;
  life: number;
  maxLife: number;
  color: string;
  alpha: number;
  angle: number;
  text?: string;
  spriteId?: string;
}

export interface TreadMark {
  x: number;
  y: number;
  angle: number;
  alpha: number;
  width: number;
}

export class ParticleSystem {
  private pool: Particle[] = [];
  private treadMarks: TreadMark[] = [];
  private maxParticles = PARTICLE_CAP;
  private live = 0;
  private reducedMode = false;
  private maxTreads = 300;

  constructor() {
    // Pre-allocate pool
    for (let i = 0; i < this.maxParticles; i++) {
      this.pool.push({
        active: false,
        type: 'dust',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 0,
        maxSize: 0,
        life: 0,
        maxLife: 1,
        color: '#ffffff',
        alpha: 1,
        angle: 0,
      });
    }
  }

  /** Low quality: far fewer particles (damage numbers are still shown, they are information). */
  public setReduced(reduced: boolean): void { this.reducedMode = reduced; }
  public get activeCount(): number { return this.live; }
  public get cap(): number { return this.reducedMode ? REDUCED_PARTICLE_CAP : this.maxParticles; }

  private alloc(essential = false): Particle | null {
    if (!this.enabled && !essential) return null;
    if (this.live >= (essential ? this.maxParticles : this.cap)) return null;
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) {
        this.pool[i].active = true;
        this.live++;
        return this.pool[i];
      }
    }
    return null;
  }

  public emitDust(pos: Vec2, angle: number, speedRatio: number) {
    if (Math.random() > 0.45 * speedRatio) return;
    const p = this.alloc();
    if (!p) return;

    const backAngle = angle + Math.PI + (Math.random() - 0.5) * 0.8;
    const speed = 20 + Math.random() * 40;

    p.type = 'dust';
    p.x = pos.x + (Math.random() - 0.5) * 16;
    p.y = pos.y + (Math.random() - 0.5) * 16;
    p.vx = Math.cos(backAngle) * speed;
    p.vy = Math.sin(backAngle) * speed;
    p.size = 6 + Math.random() * 6;
    p.maxSize = p.size * 2.2;
    p.life = 0.5 + Math.random() * 0.4;
    p.maxLife = p.life;
    p.color = '#a89f91';
    p.alpha = 0.45;
    p.angle = Math.random() * Math.PI * 2;
    p.spriteId = Math.random() > 0.5 ? 'fx_24' : 'fx_25';
  }

  public addTreadMark(pos: Vec2, angle: number, width = 28) {
    if (this.treadMarks.length >= this.maxTreads) {
      this.treadMarks.shift();
    }
    this.treadMarks.push({
      x: pos.x,
      y: pos.y,
      angle,
      alpha: 0.35,
      width,
    });
  }

  /** Expanding ring (impact, crit, armor break, mortar landing). */
  public emitRing(pos: Vec2, radius: number, color = '#f97316') {
    const p = this.alloc();
    if (!p) return;
    p.type = 'ring'; p.x = pos.x; p.y = pos.y; p.vx = 0; p.vy = 0;
    p.size = radius * 0.35; p.maxSize = radius; p.life = 0.32; p.maxLife = 0.32; p.color = color; p.alpha = 0.9; p.angle = 0; p.spriteId = undefined;
  }

  /** One grey smoke puff (rocket trail, backblast). */
  public emitSmokePuff(pos: Vec2, size = 7, life = 0.5) {
    const p = this.alloc();
    if (!p) return;
    p.type = 'smoke'; p.x = pos.x; p.y = pos.y; p.vx = (Math.random() - 0.5) * 20; p.vy = (Math.random() - 0.5) * 20;
    p.size = size * 0.6; p.maxSize = size * 1.8; p.life = life; p.maxLife = life; p.color = '#a1a1aa'; p.alpha = 0.5; p.angle = Math.random() * Math.PI * 2; p.spriteId = undefined;
  }

  /** Flamethrower: a few short orange sparks fanned around the aim angle. */
  public emitFlame(pos: Vec2, angle: number) {
    for (let i = 0; i < 3; i++) {
      const p = this.alloc();
      if (!p) return;
      const a = angle + (Math.random() - 0.5) * 0.7; const sp = 160 + Math.random() * 120;
      p.type = 'spark'; p.x = pos.x; p.y = pos.y; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.size = 3 + Math.random() * 3; p.maxSize = p.size; p.life = 0.25 + Math.random() * 0.15; p.maxLife = p.life; p.color = i % 2 ? '#fb923c' : '#fde047'; p.alpha = 1; p.angle = a; p.spriteId = undefined;
    }
  }

  public emitMuzzleFlash(pos: Vec2, angle: number, family?: string) {
    if (family === 'flamethrower') { this.emitFlame(pos, angle); return; }
    if (family === 'railgun') this.emitRing(pos, 34, '#67e8f9');
    if (family === 'rocket') { const back = { x: pos.x - Math.cos(angle) * 30, y: pos.y - Math.sin(angle) * 30 }; this.emitSmokePuff(back, 11, 0.6); this.emitSmokePuff(back, 9, 0.5); }
    if (family === 'mortar') this.emitSmokePuff(pos, 12, 0.7);
    // Muzzle blast flare with random pick from fx_13-fx_17
    const p = this.alloc();
    if (p) {
      const flashNum = 13 + Math.floor(Math.random() * 5); // fx_13 to fx_17
      p.type = 'muzzle';
      p.x = pos.x;
      p.y = pos.y;
      p.vx = Math.cos(angle) * 70;
      p.vy = Math.sin(angle) * 70;
      p.size = 18;
      p.maxSize = 34;
      p.life = 0.08; // Short life, high kinetic pop
      p.maxLife = 0.08;
      p.color = '#fbbf24';
      p.alpha = 1.0;
      p.angle = angle;
      p.spriteId = `fx_${flashNum}`;
    }

    // A couple smoke puffs
    for (let i = 0; i < 3; i++) {
      const sp = this.alloc();
      if (!sp) break;
      const smokeAngle = angle + (Math.random() - 0.5) * 0.6;
      sp.type = 'smoke';
      sp.x = pos.x;
      sp.y = pos.y;
      sp.vx = Math.cos(smokeAngle) * (40 + Math.random() * 60);
      sp.vy = Math.sin(smokeAngle) * (40 + Math.random() * 60);
      sp.size = 8;
      sp.maxSize = 22;
      sp.life = 0.35 + Math.random() * 0.2;
      sp.maxLife = sp.life;
      sp.color = '#71717a';
      sp.alpha = 0.6;
      sp.angle = Math.random() * Math.PI * 2;
      sp.spriteId = Math.random() > 0.5 ? 'fx_24' : 'fx_25';
    }
  }

  public emitHitSparks(pos: Vec2, count = 6, color = '#f59e0b') {
    for (let i = 0; i < count; i++) {
      const p = this.alloc();
      if (!p) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 140;
      p.type = 'spark';
      p.x = pos.x;
      p.y = pos.y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.size = 2 + Math.random() * 2;
      p.maxSize = p.size;
      p.life = 0.15 + Math.random() * 0.15;
      p.maxLife = p.life;
      p.color = color;
      p.alpha = 1.0;
      p.angle = angle;
    }
  }

  public emitExplosion(pos: Vec2, isLarge = false, targetScale: 'small' | 'medium' | 'large' | 'boss' = isLarge ? 'large' : 'medium') {
    const count = isLarge ? 22 : 12;

    // Center fireball from fx_20-fx_23 scaled by target size
    const p = this.alloc();
    if (p) {
      const expSprite =
        targetScale === 'small'
          ? 'fx_20'
          : targetScale === 'medium'
          ? 'fx_21'
          : targetScale === 'large'
          ? 'fx_22'
          : 'fx_23';

      p.type = 'explosion';
      p.x = pos.x;
      p.y = pos.y;
      p.vx = 0;
      p.vy = 0;
      p.size = targetScale === 'small' ? 18 : targetScale === 'medium' ? 26 : targetScale === 'large' ? 42 : 60;
      p.maxSize = targetScale === 'small' ? 44 : targetScale === 'medium' ? 64 : targetScale === 'large' ? 95 : 140;
      p.life = 0.38;
      p.maxLife = 0.38;
      p.color = '#f97316';
      p.alpha = 1.0;
      p.angle = Math.random() * Math.PI * 2;
      p.spriteId = expSprite;
    }

    // Flying debris sparks and smoke
    for (let i = 0; i < count; i++) {
      const sp = this.alloc();
      if (!sp) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * (isLarge ? 200 : 120);
      sp.type = i % 2 === 0 ? 'smoke' : 'spark';
      sp.x = pos.x;
      sp.y = pos.y;
      sp.vx = Math.cos(angle) * speed;
      sp.vy = Math.sin(angle) * speed;
      sp.size = sp.type === 'smoke' ? 14 : 3;
      sp.maxSize = sp.type === 'smoke' ? 45 : 3;
      sp.life = 0.4 + Math.random() * 0.5;
      sp.maxLife = sp.life;
      sp.color = sp.type === 'smoke' ? '#3f3f46' : '#ef4444';
      sp.alpha = 0.8;
      sp.angle = angle;
      sp.spriteId = Math.random() > 0.5 ? 'fx_24' : 'fx_25';
    }
  }

  public emitDamageText(pos: Vec2, text: string, color = '#ef4444', isCrit = false) {
    const p = this.alloc(true);
    if (!p) return;
    p.type = 'damage_text';
    p.x = pos.x + (Math.random() - 0.5) * 20;
    p.y = pos.y - 15;
    p.vx = (Math.random() - 0.5) * 35;
    p.vy = isCrit ? -75 : -55; // Floats upwards faster on crits
    p.size = isCrit ? 19 : 13;
    p.maxSize = p.size;
    p.life = isCrit ? 0.95 : 0.75;
    p.maxLife = p.life;
    p.color = isCrit ? '#fef08a' : color;
    p.alpha = 1.0;
    p.angle = 0;
    p.text = isCrit ? `CRIT! ${text}` : text;
  }

  public update(dt: number) {
    // Update active particles
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.live--;
        continue;
      }

      const progress = 1 - p.life / p.maxLife;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Friction
      p.vx *= 0.94;
      p.vy *= 0.94;

      if (p.type === 'dust' || p.type === 'smoke') {
        p.size = p.size + (p.maxSize - p.size) * (dt * 3);
        p.alpha = (1 - progress) * 0.45;
      } else if (p.type === 'explosion') {
        p.size = p.size + (p.maxSize - p.size) * (dt * 7);
        p.alpha = 1 - progress;
      } else if (p.type === 'ring') {
        p.vx = 0; p.vy = 0;
        p.size = p.size + (p.maxSize - p.size) * (dt * 9);
        p.alpha = (1 - progress) * 0.9;
      } else if (p.type === 'damage_text') {
        p.alpha = Math.min(1, (1 - progress) * 1.5);
      } else {
        p.alpha = 1 - progress;
      }
    }

    // Fade tread marks slowly
    for (let i = this.treadMarks.length - 1; i >= 0; i--) {
      this.treadMarks[i].alpha -= dt * 0.03; // ~12s persistence
      if (this.treadMarks[i].alpha <= 0) {
        this.treadMarks.splice(i, 1);
      }
    }
  }

  public renderTreads(ctx: CanvasRenderingContext2D, camera: Camera) {
    if (!this.enabled) return;
    ctx.save();
    for (let i = 0; i < this.treadMarks.length; i++) {
      const tm = this.treadMarks[i];
      const s = camera.worldToScreen(tm);
      if (
        s.x < -40 ||
        s.x > camera.viewportWidth + 40 ||
        s.y < -40 ||
        s.y > camera.viewportHeight + 40
      ) {
        continue;
      }

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(tm.angle);
      ctx.fillStyle = `rgba(30, 24, 18, ${tm.alpha})`;
      const w = tm.width * camera.zoom;
      const l = 6 * camera.zoom;
      // Dual track marks
      ctx.fillRect(-l / 2, -w / 2, l, 5 * camera.zoom);
      ctx.fillRect(-l / 2, w / 2 - 5 * camera.zoom, l, 5 * camera.zoom);
      ctx.restore();
    }
    ctx.restore();
  }

  /** Accessibility: when false, particles and tread marks are not drawn. */
  public enabled = true;

  public renderParticles(ctx: CanvasRenderingContext2D, camera: Camera, nightLighting = false) {
    ctx.save();

    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      if (!this.enabled && p.type !== 'damage_text') continue; // reduced effects keep the damage numbers (they are information)

      const s = camera.worldToScreen({ x: p.x, y: p.y });
      if (
        s.x < -60 ||
        s.x > camera.viewportWidth + 60 ||
        s.y < -60 ||
        s.y > camera.viewportHeight + 60
      ) {
        continue;
      }

      const scaledSize = Math.max(1, p.size * camera.zoom);
      if (nightLighting && (p.type === 'muzzle' || p.type === 'explosion')) {
        if (p.type === 'muzzle') {
          drawRadialLight(
            ctx,
            s.x + Math.cos(p.angle) * scaledSize * 0.8,
            s.y + Math.sin(p.angle) * scaledSize * 0.8,
            scaledSize * 7,
            scaledSize * 4.5,
            p.alpha * 0.45,
            p.angle,
          );
        } else {
          drawRadialLight(ctx, s.x, s.y, scaledSize * 4.5, scaledSize * 4.5, p.alpha * 0.5);
        }
      }

      if (p.type === 'damage_text') {
        ctx.save();
        const fontSize = Math.max(12, Math.round(p.size * camera.zoom));
        ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = 'center';
        ctx.globalAlpha = p.alpha;
        // Dark outline for guaranteed readability
        ctx.strokeStyle = '#09090b';
        ctx.lineWidth = 3;
        ctx.strokeText(p.text || '', s.x, s.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text || '', s.x, s.y);
        ctx.restore();
      } else if (p.type === 'spark') {
        ctx.save();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(s.x, s.y, scaledSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (p.type === 'ring') {
        ctx.save();
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.lineWidth = Math.max(1.5, 3 * (1 - (1 - p.life / p.maxLife)) * camera.zoom);
        ctx.beginPath();
        ctx.arc(s.x, s.y, scaledSize, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (p.type === 'dust' || p.type === 'smoke') {
        const smokeImg = p.spriteId ? spriteRegistry.getImage(spriteRegistry.getFxPath(p.spriteId)) : null;
        if (smokeImg) {
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.translate(s.x, s.y);
          ctx.rotate(p.angle);
          ctx.drawImage(smokeImg, -scaledSize, -scaledSize, scaledSize * 2, scaledSize * 2);
          ctx.restore();
        } else {
          ctx.save();
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha;
          ctx.beginPath();
          ctx.arc(s.x, s.y, scaledSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else if (p.type === 'muzzle') {
        const flashImg = p.spriteId ? spriteRegistry.getImage(spriteRegistry.getFxPath(p.spriteId)) : null;
        if (flashImg) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter'; // Additive blending for kinetic pop
          ctx.globalAlpha = p.alpha;
          ctx.translate(s.x, s.y);
          ctx.rotate(p.angle);
          ctx.drawImage(flashImg, -scaledSize * 0.8, -scaledSize, scaledSize * 2.2, scaledSize * 2);
          ctx.restore();
        } else {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.translate(s.x, s.y);
          ctx.rotate(p.angle);
          ctx.fillStyle = '#fef08a';
          ctx.globalAlpha = p.alpha;
          ctx.beginPath();
          ctx.moveTo(scaledSize * 1.5, 0);
          ctx.lineTo(-scaledSize * 0.5, scaledSize * 0.8);
          ctx.lineTo(-scaledSize * 0.2, 0);
          ctx.lineTo(-scaledSize * 0.5, -scaledSize * 0.8);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      } else if (p.type === 'explosion') {
        const expImg = p.spriteId ? spriteRegistry.getImage(spriteRegistry.getFxPath(p.spriteId)) : null;
        if (expImg) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = p.alpha;
          ctx.translate(s.x, s.y);
          ctx.rotate(p.angle);
          ctx.drawImage(expImg, -scaledSize, -scaledSize, scaledSize * 2, scaledSize * 2);
          ctx.restore();
        } else {
          ctx.save();
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha * 0.8;
          ctx.beginPath();
          ctx.arc(s.x, s.y, scaledSize, 0, Math.PI * 2);
          ctx.fill();
          // Inner hot core
          ctx.fillStyle = '#fef08a';
          ctx.beginPath();
          ctx.arc(s.x, s.y, scaledSize * 0.45, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    ctx.restore();
  }
}
