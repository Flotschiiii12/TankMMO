/**
 * Combat visuals that have no art asset: shell looks per weapon family and ammo type, status auras, spawn-protection
 * bubbles and impact sizing. Everything is plain canvas paths (no shadowBlur) and skips itself in "Reduced effects".
 */
import type { SimEntity } from '../../shared/types.ts';
import type { Camera } from './camera.ts';
import { familyProjectileScale, getProjectileStyle, type ProjectileShape } from './projectileStyles.ts';

export interface AmmoLook { color: string; core: string; trail: number; width: number }
const AMMO_TYPES = ['STANDARD', 'REINFORCED', 'ARMOR_PIERCING', 'SHAPED_CHARGE', 'EXPLOSIVE'] as const;
export const AMMO_LOOK: Record<string, AmmoLook> = Object.fromEntries(AMMO_TYPES.map((ammo) => {
  const style = getProjectileStyle('cannon', ammo);
  return [ammo, { color: style.glow, core: style.core, trail: style.trail.length, width: style.width }];
}));

export interface FamilyLook { scale: number; smoke: boolean; beam: boolean; arc: boolean; flame: boolean }
const FAMILY_NAMES = ['cannon', 'rapid_fire', 'rocket', 'mortar', 'railgun', 'flamethrower'] as const;
export const FAMILY_LOOK: Record<string, FamilyLook> = Object.fromEntries(FAMILY_NAMES.map((family) => {
  const style = getProjectileStyle(family);
  return [family, {
    scale: familyProjectileScale(family),
    smoke: style.trail.smoke,
    beam: style.trail.lightLine,
    arc: style.rotation === 'tumble',
    flame: style.trail.flame,
  }];
}));
const DEFAULT_FAMILY: FamilyLook = FAMILY_LOOK.cannon!;
export const familyLook = (family?: string): FamilyLook => (family && FAMILY_LOOK[family]) || DEFAULT_FAMILY;
export const ammoLook = (ammo?: string): AmmoLook => (ammo && AMMO_LOOK[ammo]) || AMMO_LOOK.STANDARD!;

/** Impact strength 0..3 from the share of the target's health that one hit removed (small hits stay subtle). */
export function impactLevel(finalDamage: number, targetMaxHealth: number): 0 | 1 | 2 | 3 {
  const f = finalDamage / Math.max(1, targetMaxHealth);
  return f >= 0.2 ? 3 : f >= 0.06 ? 2 : f >= 0.015 ? 1 : 0;
}
export const SPARKS_BY_LEVEL = [3, 6, 10, 15] as const;
export const RING_BY_LEVEL = [0, 0, 36, 60] as const;

/** Height of the mortar's visual lob (0..1..0) over its flight. */
export const lobHeight = (travelled: number, total: number): number => { const k = Math.max(0, Math.min(1, travelled / Math.max(1, total))); return Math.sin(k * Math.PI); };

export interface ShellDrawOptions { family?: string; now: number; reduced: boolean; simplified?: boolean; smoke?: (x: number, y: number) => void }

/** Draws the glow, trail and family detail BEHIND/AROUND a shell; the sprite itself is drawn by the caller. */
export function drawShellTrail(ctx: CanvasRenderingContext2D, camera: Camera, proj: SimEntity, o: ShellDrawOptions): void {
  const style = getProjectileStyle(o.family, proj.selectedAmmo);
  const f = familyLook(o.family);
  const s = camera.worldToScreen(proj.pos); const z = camera.zoom;
  const ang = Math.atan2(proj.vel.y, proj.vel.x);
  const len = style.trail.length * z;
  const lob = f.arc ? lobHeight((proj as any).distanceTraveled ?? 0, (proj as any).maxDistance ?? 1) : 0;
  const lift = lob * 14 * z;
  if (!o.reduced && !o.simplified && len > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(s.x, s.y - lift);
    ctx.rotate(ang);
    const g = ctx.createLinearGradient(-len, 0, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, style.glow);
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.68;
    ctx.fillRect(-len, -style.width * z * 0.32, len, style.width * z * 0.64);
    if (style.trail.lightLine) {
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = style.glow;
      ctx.fillRect(-len * 3.2, -Math.max(1, z), len * 3.2, Math.max(2, 2 * z));
    }
    if (style.trail.flame) {
      ctx.globalAlpha = 0.62;
      ctx.fillStyle = style.glow;
      ctx.beginPath();
      ctx.ellipse(-4 * z, 0, 14 * z, 5 * z, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (style.trail.sparks) {
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = style.core;
      ctx.lineWidth = Math.max(1, z);
      ctx.beginPath();
      ctx.moveTo(-len * 0.45, 0);
      ctx.lineTo(-len * 0.22, -2 * z);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (f.smoke && !o.reduced && !o.simplified && o.smoke && Math.sin(o.now * 40 + proj.id) > 0.2) {
    o.smoke(proj.pos.x - Math.cos(ang) * 14, proj.pos.y - Math.sin(ang) * 14);
  }
  if (f.arc) {
    ctx.fillStyle = `rgba(0,0,0,${0.28 * (1 - lob * 0.5)})`;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + 4 * z, (5 - lob * 2) * z, 2.2 * z, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Ammo glyphs use distinct silhouettes as well as color, including when a listed sprite is drawn beneath them. */
export function drawProjectileGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, style: ReturnType<typeof getProjectileStyle>, zoom: number, now: number): void {
  const turn = style.rotation === 'tumble' ? Math.sin(now * 10) * 0.3 : style.rotation === 'spin' ? now * 8 : 0;
  const z = zoom;
  const halfL = Math.max(3, style.length * z * 0.5);
  const halfW = Math.max(2, style.width * z * 0.5);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(x, y);
  ctx.rotate(angle + turn);
  ctx.fillStyle = style.glow;
  ctx.strokeStyle = style.core;
  ctx.lineWidth = Math.max(1, z);
  ctx.beginPath();
  drawAmmoSilhouette(ctx, style.shape, halfL, halfW);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = style.core;
  ctx.beginPath();
  ctx.arc(halfL * 0.22, 0, Math.max(1, halfW * 0.32), 0, Math.PI * 2);
  ctx.fill();
  if (style.shape === 'block') {
    ctx.beginPath();
    ctx.moveTo(-halfL * 0.35, -halfW * 0.45);
    ctx.lineTo(halfL * 0.3, halfW * 0.45);
    ctx.moveTo(-halfL * 0.35, halfW * 0.45);
    ctx.lineTo(halfL * 0.3, -halfW * 0.45);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAmmoSilhouette(ctx: CanvasRenderingContext2D, shape: ProjectileShape, halfL: number, halfW: number): void {
  switch (shape) {
    case 'round':
      ctx.ellipse(0, 0, halfL * 0.72, halfW, 0, 0, Math.PI * 2);
      break;
    case 'block':
      ctx.rect(-halfL * 0.75, -halfW, halfL * 1.5, halfW * 2);
      break;
    case 'dart':
      ctx.moveTo(halfL, 0);
      ctx.lineTo(-halfL * 0.65, -halfW * 0.45);
      ctx.lineTo(-halfL * 0.4, 0);
      ctx.lineTo(-halfL * 0.65, halfW * 0.45);
      ctx.closePath();
      break;
    case 'cone':
      ctx.moveTo(halfL, 0);
      ctx.lineTo(-halfL * 0.7, -halfW);
      ctx.lineTo(-halfL * 0.42, 0);
      ctx.lineTo(-halfL * 0.7, halfW);
      ctx.closePath();
      break;
    case 'burst':
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const r = i % 2 === 0 ? halfL : halfL * 0.52;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r * Math.max(0.35, halfW / halfL);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
  }
}

const AURA_TYPES = ['burning', 'slowed', 'stunned', 'marked', 'smoked', 'boosted', 'repairing', 'invulnerable', 'fortified'] as const;

/** Rings, flames and pictograms around a vehicle for the status effects that change how it fights. */
export function drawAuras(ctx: CanvasRenderingContext2D, camera: Camera, ent: SimEntity, now: number, reduced: boolean): void {
  const eff = ent.statusEffects;
  const protectedNow = ent.invulnerableTime > 0;
  if ((!eff || eff.length === 0) && !protectedNow) return;
  const s = camera.worldToScreen(ent.pos); const z = camera.zoom; const r = ent.radius * z;
  const has = (t: string) => eff?.some((e) => e.type === t);
  if (protectedNow) { // spawn / portal protection bubble
    ctx.strokeStyle = 'rgba(165,243,252,0.7)'; ctx.fillStyle = 'rgba(165,243,252,0.10)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, r + 9 * z + Math.sin(now * 6) * 1.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  if (!eff?.length) return;
  if (has('invulnerable') && !protectedNow) { ctx.strokeStyle = 'rgba(250,250,250,0.85)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(s.x, s.y, r + 8 * z, 0, Math.PI * 2); ctx.stroke(); }
  if (has('fortified')) { ctx.strokeStyle = 'rgba(148,163,184,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y, r + 5 * z, 0, Math.PI * 2); ctx.stroke(); }
  if (has('slowed')) { ctx.strokeStyle = 'rgba(96,165,250,0.8)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, r + 3 * z, now * 1.5, now * 1.5 + Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
  if (has('repairing')) { const k = (now * 1.4) % 1; ctx.strokeStyle = `rgba(74,222,128,${0.8 * (1 - k)})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(s.x, s.y, r * (0.7 + k * 0.9), 0, Math.PI * 2); ctx.stroke(); }
  if (has('boosted')) { const a = ent.chassisAngle + Math.PI; ctx.strokeStyle = 'rgba(56,189,248,0.7)'; ctx.lineWidth = 3 * z; ctx.beginPath(); ctx.moveTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r); ctx.lineTo(s.x + Math.cos(a) * (r + 34 * z), s.y + Math.sin(a) * (r + 34 * z)); ctx.stroke(); }
  if (has('smoked')) { ctx.fillStyle = 'rgba(148,163,184,0.35)'; for (let i = 0; i < 4; i++) { const a = now * 0.6 + i * 1.57; ctx.beginPath(); ctx.arc(s.x + Math.cos(a) * r * 0.8, s.y + Math.sin(a) * r * 0.6, r * 0.55, 0, Math.PI * 2); ctx.fill(); } }
  if (has('marked')) { ctx.strokeStyle = 'rgba(239,68,68,0.9)'; ctx.lineWidth = 2; const q = r + 14 * z; ctx.beginPath(); ctx.arc(s.x, s.y, q, 0, Math.PI * 2); ctx.moveTo(s.x - q - 5, s.y); ctx.lineTo(s.x - q + 7, s.y); ctx.moveTo(s.x + q - 7, s.y); ctx.lineTo(s.x + q + 5, s.y); ctx.moveTo(s.x, s.y - q - 5); ctx.lineTo(s.x, s.y - q + 7); ctx.moveTo(s.x, s.y + q - 7); ctx.lineTo(s.x, s.y + q + 5); ctx.stroke(); }
  if (has('stunned')) { ctx.fillStyle = '#fde047'; for (let i = 0; i < 3; i++) { const a = now * 4 + i * 2.09; ctx.beginPath(); ctx.arc(s.x + Math.cos(a) * r * 0.7, s.y - r - 8 * z + Math.sin(a) * 4 * z, 2.6 * z, 0, Math.PI * 2); ctx.fill(); } }
  if (has('burning') && !reduced) { for (let i = 0; i < 3; i++) { const k = (now * 2.2 + i * 0.33) % 1; ctx.fillStyle = `rgba(${i % 2 ? 251 : 250},${i % 2 ? 146 : 204},${i % 2 ? 60 : 21},${0.85 * (1 - k)})`; ctx.beginPath(); ctx.arc(s.x + (i - 1) * r * 0.5, s.y - r * 0.2 - k * 22 * z, (4 - k * 2.5) * z, 0, Math.PI * 2); ctx.fill(); } }
}

export const STATUS_AURA_TYPES = AURA_TYPES;
