import type { DroneSpec, SimEntity, SimEvent, Vec2 } from '../../shared/types.ts';
import { dronePosition } from '../../shared/sim/drones.ts';
import type { Camera } from './camera.ts';

/** Accent colour per drone type (body is a small quadcopter, the accent says what it does). */
const COLOR: Record<string, string> = {
  guardian: '#38bdf8', sentinel: '#f97316', repair_bot: '#4ade80', recon: '#fbbf24',
  arc_drone: '#a78bfa', sapper: '#f43f5e', interceptor: '#e2e8f0', aegis: '#22d3ee',
};

type DroneFx = { kind: string; born: number; life: number; a: Vec2; b?: Vec2; pts?: Vec2[]; owner: number; slot: number; color: string };
const MAX_FX = 48;

/** Draws companion drones and their short effects. Cheap on purpose: no shadowBlur, a handful of paths per drone, effects capped. */
export class DroneRenderer {
  private fx: DroneFx[] = [];
  private shield = new Map<number, number>(); // owner id -> aegis until (render clock)
  private flash = new Map<number, number>(); // owner id -> guardian absorb flash start

  /** Feed `drone_fx` simulation events; `now` is the render clock in seconds. */
  onEvent(ev: SimEvent, now: number): void {
    if (ev.type !== 'drone_fx') return;
    if (ev.kind === 'aegis') { this.shield.set(ev.ownerId, now + (ev.duration ?? 3)); return; }
    if (ev.kind === 'absorb') { this.flash.set(ev.ownerId, now); return; }
    if (this.fx.length >= MAX_FX) this.fx.shift();
    const life = ev.kind === 'arc' ? 0.28 : ev.kind === 'repair' ? 0.5 : ev.kind === 'mine' ? 0.4 : 0.14;
    this.fx.push({ kind: ev.kind, born: now, life, a: ev.pos, b: ev.to, pts: ev.points, owner: ev.ownerId, slot: ev.slot, color: ev.kind === 'arc' ? COLOR.arc_drone : ev.kind === 'repair' ? COLOR.repair_bot : ev.kind === 'intercept' ? '#ffffff' : COLOR.sentinel });
  }

  drawMine(ctx: CanvasRenderingContext2D, camera: Camera, mine: SimEntity, now: number): void {
    const s = camera.worldToScreen(mine.pos); const z = camera.zoom;
    const on = Math.sin(now * 7 + mine.id) > 0;
    ctx.fillStyle = 'rgba(15,23,42,0.85)'; ctx.beginPath(); ctx.arc(s.x, s.y, 7 * z, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = on ? '#f43f5e' : '#7f1d1d'; ctx.beginPath(); ctx.arc(s.x, s.y, 2.6 * z, 0, Math.PI * 2); ctx.fill();
  }

  drawOwner(ctx: CanvasRenderingContext2D, camera: Camera, owner: SimEntity, now: number): void {
    const list = owner.drones; if (!list?.length || owner.hull <= 0) return;
    const z = camera.zoom;
    const shieldUntil = this.shield.get(owner.id);
    if (shieldUntil !== undefined) {
      if (shieldUntil <= now) this.shield.delete(owner.id);
      else { const s = camera.worldToScreen(owner.pos); ctx.strokeStyle = 'rgba(34,211,238,0.75)'; ctx.fillStyle = 'rgba(34,211,238,0.12)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, (owner.radius + 14) * z, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    }
    const fl = this.flash.get(owner.id);
    if (fl !== undefined) {
      const k = (now - fl) / 0.25;
      if (k >= 1) this.flash.delete(owner.id);
      else { const s = camera.worldToScreen(owner.pos); ctx.strokeStyle = `rgba(56,189,248,${0.8 * (1 - k)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y, (owner.radius + 8 + k * 16) * z, 0, Math.PI * 2); ctx.stroke(); }
    }
    for (const d of list) this.drawDrone(ctx, camera, owner, d, now);
  }

  private drawDrone(ctx: CanvasRenderingContext2D, camera: Camera, owner: SimEntity, d: DroneSpec, now: number): void {
    const p = camera.worldToScreen(dronePosition(owner, d, now));
    const z = camera.zoom; const color = COLOR[d.type] ?? '#94a3b8';
    const bob = Math.sin(now * 5 + d.slot * 2) * 1.5 * z;
    const r = (5.5 + d.tier * 0.5) * z;
    // cheap ground shadow (no shadowBlur)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(p.x + 3 * z, p.y + 9 * z, r * 0.9, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    const y = p.y + bob;
    // arms + spinning rotors
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1.6 * z;
    const arm = r * 1.35; const rot = now * 38 + d.slot;
    ctx.beginPath();
    for (let i = 0; i < 2; i++) { const a = Math.PI / 4 + i * Math.PI / 2; ctx.moveTo(p.x - Math.cos(a) * arm, y - Math.sin(a) * arm); ctx.lineTo(p.x + Math.cos(a) * arm, y + Math.sin(a) * arm); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(203,213,225,0.35)';
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; const rx = p.x + Math.cos(a) * arm, ry = y + Math.sin(a) * arm; ctx.beginPath(); ctx.ellipse(rx, ry, r * 0.7, r * 0.22, rot + i, 0, Math.PI * 2); ctx.fill(); }
    // body
    ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(p.x, y, r * 0.75, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, y, r * 0.42, 0, Math.PI * 2); ctx.fill();
    // type accent
    switch (d.type) {
      case 'recon': { const k = (now * 0.8 + d.slot * 0.5) % 1; ctx.strokeStyle = `rgba(251,191,36,${0.5 * (1 - k)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, y, r * (1 + k * 4), 0, Math.PI * 2); ctx.stroke(); break; }
      case 'guardian': ctx.strokeStyle = 'rgba(56,189,248,0.45)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, y, r * 1.5, 0, Math.PI * 2); ctx.stroke(); break;
      case 'repair_bot': ctx.strokeStyle = '#ecfdf5'; ctx.lineWidth = 1.6 * z; ctx.beginPath(); ctx.moveTo(p.x - r * 0.3, y); ctx.lineTo(p.x + r * 0.3, y); ctx.moveTo(p.x, y - r * 0.3); ctx.lineTo(p.x, y + r * 0.3); ctx.stroke(); break;
      case 'arc_drone': if (Math.sin(now * 23 + d.slot) > 0.6) { ctx.strokeStyle = '#ddd6fe'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(p.x - r, y - r); ctx.lineTo(p.x, y); ctx.lineTo(p.x + r, y + r * 0.6); ctx.stroke(); } break;
      case 'sapper': if (Math.sin(now * 6 + d.slot) > 0) { ctx.fillStyle = '#f43f5e'; ctx.beginPath(); ctx.arc(p.x, y + r * 0.9, 1.8 * z, 0, Math.PI * 2); ctx.fill(); } break;
      case 'aegis': ctx.strokeStyle = 'rgba(34,211,238,0.5)'; ctx.lineWidth = 1.3; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + now; const px = p.x + Math.cos(a) * r * 1.4, py = y + Math.sin(a) * r * 1.4; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.closePath(); ctx.stroke(); break;
      default: break;
    }
  }

  /** Short beams / lightning / repair pulses; call after the vehicles. */
  drawFx(ctx: CanvasRenderingContext2D, camera: Camera, now: number): void {
    if (!this.fx.length) return;
    this.fx = this.fx.filter((f) => now - f.born < f.life);
    for (const f of this.fx) {
      const k = (now - f.born) / f.life; const alpha = 1 - k;
      const a = camera.worldToScreen(f.a);
      ctx.lineWidth = 2; ctx.strokeStyle = f.color; ctx.globalAlpha = alpha;
      if (f.kind === 'arc' && f.pts?.length) {
        ctx.beginPath(); ctx.moveTo(a.x, a.y);
        let prev = a;
        for (const pt of f.pts) { const b = camera.worldToScreen(pt); const n = 4; for (let i = 1; i <= n; i++) { const t = i / n; const jx = i === n ? 0 : Math.sin(f.born * 91 + i * 7 + b.x) * 7; const jy = i === n ? 0 : Math.cos(f.born * 57 + i * 5 + b.y) * 7; ctx.lineTo(prev.x + (b.x - prev.x) * t + jx, prev.y + (b.y - prev.y) * t + jy); } prev = b; }
        ctx.stroke();
      } else if (f.b) {
        const b = camera.worldToScreen(f.b);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + (b.x - a.x) * Math.min(1, k * 3 + 0.3), a.y + (b.y - a.y) * Math.min(1, k * 3 + 0.3)); ctx.stroke();
        if (f.kind === 'repair') { ctx.beginPath(); ctx.arc(b.x, b.y, 14 + k * 10, 0, Math.PI * 2); ctx.stroke(); }
      } else if (f.kind === 'mine') { ctx.beginPath(); ctx.arc(a.x, a.y, 6 + k * 14, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
  }
}
