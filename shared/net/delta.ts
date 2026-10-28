/**
 * Entity delta encoding shared by server and client. The server keeps, per connection, the last state it
 * sent for every entity and transmits only changed fields; the client merges them back.
 */
import type { SimEntity } from '../types.ts';

export type EntityPatch = { id: number; full?: SimEntity; d?: Partial<SimEntity> };

const round = (v: number): number => Math.round(v * 100) / 100;
const round1 = (v: number): number => Math.round(v * 10) / 10;

/** Plain-data copy with numbers rounded to 0.01 so tiny float noise does not count as a change. */
export function compactEntity(e: SimEntity, coarse = false): SimEntity {
  const r = coarse ? round1 : round;
  const out: any = {};
  for (const k in e) { // for-in instead of Object.entries: no temporary [key, value] arrays (this runs for every entity every snapshot)
    const v = (e as any)[k];
    if (v === undefined) continue;
    if (typeof v === 'number') out[k] = k === 'chassisAngle' || k === 'turretAngle' ? round(v) : r(v);
    else if (v && typeof v === 'object' && 'x' in (v as any) && 'y' in (v as any) && Object.keys(v as object).length === 2) out[k] = { x: r((v as any).x), y: r((v as any).y) };
    else out[k] = v;
  }
  return out as SimEntity;
}

function fieldEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!fieldEq(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a as object);
  if (ka.length !== Object.keys(b as object).length) return false;
  for (const k of ka) if (!fieldEq((a as any)[k], (b as any)[k])) return false;
  return true;
}

/**
 * Most clients hold the same previous object for an entity, so the (prev -> cur) diff is computed once and reused.
 * The result is cached on `prev` (symbol key: invisible to Object.keys and JSON), pointing FORWARD to the newer object.
 * Caching backwards (cur -> prev), as a WeakMap keyed by `cur` did, makes every new state keep all older ones alive: the
 * heap grew without bound (~0.3 MB per tick with 100 players) and V8's ephemeron handling stalled ticks for seconds.
 */
const NEXT = Symbol('next');
type NextSlot = { cur: SimEntity; patch: EntityPatch | null };

export function diffEntity(prev: SimEntity | undefined, cur: SimEntity): EntityPatch | undefined {
  if (!prev) return { id: cur.id, full: cur };
  if (prev === cur) return undefined;
  const slot = (prev as any)[NEXT] as NextSlot | undefined;
  if (slot && slot.cur === cur) return slot.patch ?? undefined;
  const patch = computeDiff(prev, cur);
  (prev as any)[NEXT] = { cur, patch: patch ?? null } satisfies NextSlot;
  return patch;
}

function computeDiff(prev: SimEntity, cur: SimEntity): EntityPatch | undefined {
  const d: any = {};
  let changed = false;
  for (const k of Object.keys(cur) as Array<keyof SimEntity>) {
    if (!fieldEq(prev[k], cur[k])) { d[k] = cur[k]; changed = true; }
  }
  for (const k of Object.keys(prev) as Array<keyof SimEntity>) if (!(k in cur)) { d[k] = null; changed = true; }
  return changed ? { id: cur.id, d } : undefined;
}

export function applyPatch(entities: Map<number, SimEntity>, patch: EntityPatch): void {
  if (patch.full) { entities.set(patch.id, { ...patch.full }); return; }
  const e: any = entities.get(patch.id);
  if (!e || !patch.d) return;
  for (const [k, v] of Object.entries(patch.d)) { if (v === null) delete e[k]; else e[k] = v; }
}

const OTHER_AMMO = { STANDARD: -1, REINFORCED: 0, ARMOR_PIERCING: 0, SHAPED_CHARGE: 0, EXPLOSIVE: 0 };

/**
 * What a client is allowed to see of an entity. Own vehicle: everything (reload timers, cooldowns, ammo).
 * Others: volatile or hidden fields are held constant so they never show up in deltas (and AI internals never leak).
 */
export function viewFor(e: SimEntity, self: boolean): SimEntity {
  if (self) return e;
  return {
    ...e,
    hull: Math.round(e.hull),
    armor: Math.round(e.armor),
    vel: { x: Math.round(e.vel.x / 5) * 5, y: Math.round(e.vel.y / 5) * 5 },
    targetSpeed: 0,
    desiredDriveAngle: undefined,
    homePos: undefined,
    patrolAngle: undefined,
    aiTimer: undefined,
    aiState: undefined,
    armorRegenTimer: 0,
    mainReloadRemaining: 0,
    mgReloadRemaining: 0,
    abilityCooldowns: {},
    ammoInventory: OTHER_AMMO,
    stunDiminishingTimer: 0,
    stunCount: 0,
    bossSkillCooldown: undefined,
    lastDamagedTick: undefined,
    miningTimer: undefined,
    gateHoldTimer: undefined,
    damageBy: undefined,
    invulnerableTime: e.invulnerableTime > 0 ? 1 : 0,
    wreckTimer: e.wreckTimer !== undefined ? Math.round(e.wreckTimer) : undefined,
    telegraphDuration: e.telegraphDuration !== undefined ? Math.round(e.telegraphDuration * 10) / 10 : undefined,
    hitFlashTimer: e.hitFlashTimer && e.hitFlashTimer > 0 ? 0.1 : 0,
    statusEffects: e.statusEffects.map((st) => ({ type: st.type, duration: 1, maxDuration: 1 })),
  };
}

/** Tracks what one client already knows. */
export class DeltaEncoder {
  /** `gen` marks the last encode() that saw the entity, so "removed" needs no per-call Set. */
  private known = new Map<number, { ent: SimEntity; gen: number }>();
  private gen = 0;

  /** `visible` must already be compacted (see compactEntity); the same compact objects can be shared between clients. */
  encode(visible: SimEntity[]): { patches: EntityPatch[]; removed: number[] } {
    const patches: EntityPatch[] = [];
    const gen = ++this.gen;
    for (const cur of visible) {
      const slot = this.known.get(cur.id);
      const patch = diffEntity(slot?.ent, cur);
      if (patch) patches.push(patch);
      if (slot) { slot.ent = cur; slot.gen = gen; } else this.known.set(cur.id, { ent: cur, gen });
    }
    const removed: number[] = [];
    for (const [id, slot] of this.known) if (slot.gen !== gen) { removed.push(id); this.known.delete(id); }
    return { patches, removed };
  }

  /** What this client currently knows about an entity (used to skip low-priority updates). */
  peek(id: number): SimEntity | undefined { return this.known.get(id)?.ent; }

  /** Forget everything (map change): the next encode sends full entities. */
  reset(): void { this.known.clear(); }
}
