/** Pure rules behind the combat HUD (kept free of React / canvas so they can be unit tested). */
import type { AmmoType, SimEntity, Vec2 } from '../../shared/types.ts';
import { getAmmoDamageMultiplier } from '../../shared/rules/ammo.ts';

// ------------------------------------------------------------------------------------------------ name plates

export const NAME_DISTANCE = 700; // world units: farther away only a bar (if any) is drawn
export const BAR_DISTANCE = 1100;

export interface PlateLod { name: boolean; bars: boolean }
/** Level of detail of an enemy / player plate: no clutter for far, untouched vehicles. */
export function plateLod(ent: Pick<SimEntity, 'hull' | 'maxHull' | 'armor' | 'maxArmor' | 'kind' | 'isElite' | 'isHostile'>, distance: number, isTarget: boolean): PlateLod {
  const damaged = ent.hull < ent.maxHull - 0.5 || (ent.maxArmor > 0 && ent.armor < ent.maxArmor - 0.5);
  const important = isTarget || ent.kind === 'boss' || !!ent.isElite;
  return {
    name: important || distance <= NAME_DISTANCE,
    bars: (isTarget || damaged || ent.kind === 'boss' || ent.isHostile) && (important || distance <= BAR_DISTANCE),
  };
}

// ------------------------------------------------------------------------------------------------ damage numbers

export interface PendingNumber { x: number; y: number; amount: number; hits: number; crit: boolean; rear: boolean; armor: boolean; start: number }
export interface MergedNumber { pos: Vec2; text: string; amount: number; crit: boolean; rear: boolean; armor: boolean }
export const MERGE_WINDOW_MS = 200;

/** Hits on the same target within the window become one floating number ("-340 x3"), so a rapid-fire gun does not paint a wall of text. */
export class DamageNumberMerger {
  private pending = new Map<number, PendingNumber>();
  add(targetId: number, pos: Vec2, amount: number, opts: { crit?: boolean; rear?: boolean; armor?: boolean }, now: number): void {
    const p = this.pending.get(targetId);
    if (p) { p.amount += amount; p.hits++; p.crit ||= !!opts.crit; p.rear ||= !!opts.rear; p.armor ||= !!opts.armor; p.x = pos.x; p.y = pos.y; return; }
    this.pending.set(targetId, { x: pos.x, y: pos.y, amount, hits: 1, crit: !!opts.crit, rear: !!opts.rear, armor: !!opts.armor, start: now });
  }
  /** Numbers whose window has passed (all of them with `force`). */
  flush(now: number, force = false): MergedNumber[] {
    const out: MergedNumber[] = [];
    for (const [id, p] of this.pending) {
      if (!force && now - p.start < MERGE_WINDOW_MS) continue;
      this.pending.delete(id);
      out.push({ pos: { x: p.x, y: p.y }, text: `-${Math.round(p.amount)}${p.hits > 1 ? ` x${p.hits}` : ''}`, amount: p.amount, crit: p.crit, rear: p.rear, armor: p.armor });
    }
    return out;
  }
  get size(): number { return this.pending.size; }
}

// ------------------------------------------------------------------------------------------------ threats

export interface Threat { id: number; angle: number; distance: number; isTarget: boolean }
export const THREAT_RANGE = 1600;
export const MAX_THREATS = 4;

/** Off-screen enemies that currently aim at the player, plus the player's own off-screen target; nearest first, capped. */
export function selectThreats(player: Pick<SimEntity, 'id' | 'pos' | 'targetId'>, entities: SimEntity[], isOnScreen: (p: Vec2) => boolean): Threat[] {
  const out: Threat[] = [];
  for (const e of entities) {
    if (e.hull <= 0 || e.id === player.id || e.kind === 'projectile' || e.kind === 'telegraph' || e.kind === 'mine') continue;
    const isTarget = e.id === player.targetId;
    const aggressive = e.isHostile && e.targetId === player.id && e.kind !== 'gate';
    if (!isTarget && !aggressive) continue;
    if (isOnScreen(e.pos)) continue;
    const dx = e.pos.x - player.pos.x; const dy = e.pos.y - player.pos.y; const d = Math.hypot(dx, dy);
    if (d > THREAT_RANGE) continue;
    out.push({ id: e.id, angle: Math.atan2(dy, dx), distance: d, isTarget });
  }
  out.sort((a, b) => Number(b.isTarget) - Number(a.isTarget) || a.distance - b.distance || a.id - b.id);
  return out.slice(0, MAX_THREATS);
}

// ------------------------------------------------------------------------------------------------ target panel maths

const AMMOS: AmmoType[] = ['STANDARD', 'REINFORCED', 'ARMOR_PIERCING', 'SHAPED_CHARGE', 'EXPLOSIVE'] as AmmoType[];

/** The owned ammo type that does the most damage to this target (STANDARD is always available). */
export function bestAmmoAgainst(target: Pick<SimEntity, 'kind' | 'vehicleClass'>, inventory: Partial<Record<AmmoType, number>>): { ammo: AmmoType; multiplier: number } {
  let best: AmmoType = 'STANDARD' as AmmoType; let bm = getAmmoDamageMultiplier(best, target.kind, target.vehicleClass);
  for (const a of AMMOS) {
    if (a !== 'STANDARD' && !((inventory[a] ?? 0) > 0)) continue;
    const m = getAmmoDamageMultiplier(a, target.kind, target.vehicleClass);
    if (m > bm + 1e-9) { bm = m; best = a; }
  }
  return { ammo: best, multiplier: bm };
}

/** Rough shots / seconds until the target is dead with the player's current ammo (armor soaks 80 % first, so total health is the measure). */
export function killsToGo(target: Pick<SimEntity, 'hull' | 'armor' | 'kind' | 'vehicleClass'>, shooter: Pick<SimEntity, 'mainDamage' | 'mainReloadTime' | 'selectedAmmo'>): { shots: number; seconds: number } {
  const mult = getAmmoDamageMultiplier(shooter.selectedAmmo, target.kind, target.vehicleClass);
  const perShot = Math.max(1, shooter.mainDamage * mult);
  const shots = Math.max(1, Math.ceil((Math.max(0, target.hull) + Math.max(0, target.armor)) / perShot));
  return { shots, seconds: Math.round(shots * Math.max(0.2, shooter.mainReloadTime) * 10) / 10 };
}

// ------------------------------------------------------------------------------------------------ misc

export const LOW_HEALTH_RATIO = 0.3;
export const isLowHealth = (e: Pick<SimEntity, 'hull' | 'maxHull'>): boolean => e.hull > 0 && e.hull / Math.max(1, e.maxHull) < LOW_HEALTH_RATIO;

export interface KillFeedEntry { id: number; text: string; until: number; boss: boolean }
/** Only notable kills (elites, bosses) get a feed line; normal kills would drown the screen. */
export function killFeedEntry(victim: Pick<SimEntity, 'id' | 'kind' | 'isElite' | 'name'>, killerName: string, now: number): KillFeedEntry | undefined {
  const boss = victim.kind === 'boss';
  if (!boss && !victim.isElite) return undefined;
  return { id: victim.id, text: `${killerName} ▸ ${victim.name}`, until: now + (boss ? 8000 : 5000), boss };
}
