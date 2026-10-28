/**
 * Combat visuals that have no art asset: shell looks per weapon family and ammo type, status auras, spawn-protection
 * bubbles and impact sizing. Everything is plain canvas paths (no shadowBlur) and skips itself in "Reduced effects".
 */
import type { SimEntity } from '../../shared/types.ts';
import type { Camera } from './camera.ts';

export interface AmmoLook { color: string; core: string; trail: number; width: number }
export const AMMO_LOOK: Record<string, AmmoLook> = {
  STANDARD: { color: '#fde047', core: '#fffbeb', trail: 22, width: 3 },
  REINFORCED: { color: '#fdba74', core: '#fff7ed', trail: 24, width: 5 },
  ARMOR_PIERCING: { color: '#38bdf8', core: '#f0f9ff', trail: 46, width: 2 },
  SHAPED_CHARGE: { color: '#fb923c', core: '#fef3c7', trail: 30, width: 3.5 },
  EXPLOSIVE: { color: '#ef4444', core: '#fecaca', trail: 26, width: 4.5 },
};

export interface FamilyLook { scale: number; smoke: boolean; beam: boolean; arc: boolean; flame: boolean }
export const FAMILY_LOOK: Record<string, FamilyLook> = {
  cannon: { scale: 1, smoke: false, beam: false, arc: false, flame: false },
  rapid_fire: { scale: 0.7, smoke: false, beam: false, arc: false, flame: false },
  rocket: { scale: 1.25, smoke: true, beam: false, arc: false, flame: false },
  mortar: { scale: 1.2, smoke: false, beam: false, arc: true, flame: false },
  railgun: { scale: 0.8, smoke: false, beam: true, arc: false, flame: false },
  flamethrower: { scale: 1.5, smoke: false, beam: false, arc: false, flame: true },
};
const DEFAULT_FAMILY: FamilyLook = FAMILY_LOOK.cannon;
export const familyLook = (family?: string): FamilyLook => (family && FAMILY_LOOK[family]) || DEFAULT_FAMILY;
export const ammoLook = (ammo?: string): AmmoLook => (ammo && AMMO_LOOK[ammo]) || AMMO_LOOK.STANDARD;

/** Impact strength 0..3 from the share of the target's health that one hit removed (small hits stay subtle). */
export function impactLevel(finalDamage: number, targetMaxHealth: number): 0 | 1 | 2 | 3 {
  const f = finalDamage / Math.max(1, targetMaxHealth);
  return f >= 0.2 ? 3 : f >= 0.06 ? 2 : f >= 0.015 ? 1 : 0;
}
export const SPARKS_BY_LEVEL = [3, 6, 10, 15] as const;
export const RING_BY_LEVEL = [0, 0, 36, 60] as const;

/** Height of the mortar's visual lob (0..1..0) over its flight. */
export const lobHeight = (travelled: number, total: number): number => { const k = Math.max(0, Math.min(1, travelled / Math.max(1, total))); return Math.sin(k * Math.PI); };

export interface ShellDrawOptions { family?: string; now: number; reduced: boolean; smoke?: (x: number, y: number) => void }

/** Draws the glow, trail and family detail BEHIND/AROUND a shell; the sprite itself is drawn by the caller. */
export function drawShellTrail(ctx: CanvasRenderingContext2D, camera: Camera, proj: SimEntity, o: ShellDrawOptions): void {
  const a = ammoLook(proj.selectedAmmo); const f = familyLook(o.family);
  const s = camera.worldToScreen(proj.pos); const z = camera.zoom;
  const ang = Math.atan2(proj.vel.y, proj.vel.x);
  const len = a.trail * f.scale * z;
  const lob = f.arc ? lobHeight((proj as any).distanceTraveled ?? 0, (proj as any).maxDistance ?? 1) : 0;
  const lift = lob * 14 * z;
  ctx.save();
  ctx.translate(s.x, s.y - lift);
  ctx.rotate(ang);
  // trail: a fading streak behind the shell
  const g = ctx.createLinearGradient(-len, 0, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, a.color);
  ctx.fillStyle = g; ctx.fillRect(-len, -a.width * f.scale * z * 0.5, len, a.width * f.scale * z);
  if (f.beam) { ctx.fillStyle = 'rgba(103,232,249,0.55)'; ctx.fillRect(-len * 3.2, -1.2 * z, len * 3.2, 2.4 * z); }
  if (f.flame) { ctx.fillStyle = 'rgba(251,146,60,0.55)'; ctx.beginPath(); ctx.ellipse(-4 * z, 0, 14 * z, 7 * z, 0, 0, Math.PI * 2); ctx.fill(); }
  // bright core
  ctx.fillStyle = a.core; ctx.beginPath(); ctx.arc(0, 0, 2.2 * f.scale * z, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (f.arc) { // ground shadow shrinks while the shell is "high"
    ctx.fillStyle = `rgba(0,0,0,${0.28 * (1 - lob * 0.5)})`; ctx.beginPath(); ctx.ellipse(s.x, s.y + 4 * z, (5 - lob * 2) * z, 2.2 * z, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (f.smoke && !o.reduced && o.smoke && Math.sin(o.now * 40 + proj.id) > 0.2) o.smoke(proj.pos.x - Math.cos(ang) * 14, proj.pos.y - Math.sin(ang) * 14);
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
