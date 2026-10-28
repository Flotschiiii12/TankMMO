/**
 * Companion drones (cloud run 3). A vehicle carries up to `droneSlots` drones; each is described by a `DroneSpec` on the
 * owner entity (type, tier, slot, power) and is NOT an entity of its own:
 *  - positions are a pure function of owner pose + world time (`dronePosition`), so the client draws them with the same
 *    code and nothing but the owner's small `drones` list goes over the wire;
 *  - effects run in `stepDrones` from deterministic per-owner state in `world.droneRt` (cooldowns, guardian pool, aegis).
 * Drones are harmless and idle inside safe zones, die with the owner (state is dropped) and cannot be targeted.
 *
 * Power: `power` = item base value (40 x tier) x rarity/upgrade multiplier x talent efficiency. Damaging drones deal
 * `power x 0.25` per shot, the same number the old flat "+25 % of drone DPS to every main shot" bonus used.
 */
import type { SimEntity, Vec2, DroneSpec } from '../types.ts';
import { PVP_DAMAGE_MULT, canEngage } from './pvp.ts';
import { dealDirectDamage, isPosInSafeZone, World } from './world.ts';
import { isInertKind, spawnMine } from './pve.ts';

export const DRONE_TYPES = ['guardian', 'sentinel', 'repair_bot', 'recon', 'arc_drone', 'sapper', 'interceptor', 'aegis'] as const;
export type DroneType = (typeof DRONE_TYPES)[number];

const TICKS_PER_SECOND = 30;
export const MAX_MINES_PER_OWNER = 3;
export const MINE_LIFETIME_SECONDS = 14;

interface DroneRuntime {
  cd: number[]; // per slot
  pool: number; // guardian absorption pool
  aegisUntil: number;
  reduced: Set<number>; // telegraph ids already weakened by an interceptor
  lastFx: number;
  mines: number[];
}

const rotate = (v: Vec2, a: number): Vec2 => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });

/** World position of a drone: formation per type, slot decides which of the two positions it takes. */
export function dronePosition(owner: { pos: Vec2; chassisAngle: number; radius: number }, d: Pick<DroneSpec, 'type' | 'slot'>, time: number): Vec2 {
  const r = owner.radius; const side = d.slot % 2 === 0 ? 1 : -1; const ph = d.slot * Math.PI;
  let local: Vec2;
  switch (d.type) {
    case 'guardian': { const a = time * 1.3 + ph; local = { x: Math.cos(a) * (r + 34), y: Math.sin(a) * (r + 34) }; break; }
    case 'sentinel': local = { x: 4, y: side * (r + 30) + Math.sin(time * 3 + ph) * 4 }; break;
    case 'repair_bot': local = { x: -(r + 40 + d.slot * 24), y: Math.sin(time * 2 + ph) * 12 }; break;
    case 'recon': { const a = time * 0.45 + ph; local = { x: Math.cos(a) * (r + 92), y: Math.sin(a) * (r + 92) }; break; }
    case 'arc_drone': { const a = -time * 2.1 + ph; local = { x: Math.cos(a) * (r + 26), y: Math.sin(a) * (r + 26) }; break; }
    case 'sapper': local = { x: -(r + 30), y: side * (r + 22) }; break;
    case 'interceptor': local = { x: r + 26, y: side * (r + 34) + Math.sin(time * 2.4 + ph) * 3 }; break;
    case 'aegis': { const a = time * 0.8 + ph; local = { x: Math.cos(a) * (r + 50), y: Math.sin(a) * (r + 50) }; break; }
    default: local = { x: 0, y: r + 30 };
  }
  const w = rotate(local, owner.chassisAngle);
  return { x: owner.pos.x + w.x, y: owner.pos.y + w.y };
}

/** How strong a drone is relative to its tier baseline (rarity, upgrades, talents): 1 = plain item. */
const quality = (d: DroneSpec): number => Math.max(0.25, Math.min(4, d.power / (40 * Math.max(1, d.tier))));
const hit = (d: DroneSpec): number => d.power * 0.25;

function runtime(world: World, owner: SimEntity): DroneRuntime {
  let rt = world.droneRt.get(owner.id);
  if (!rt) {
    const guard = owner.drones?.find((d) => d.type === 'guardian');
    rt = { cd: [], pool: guard ? guard.power * 6 : 0, aegisUntil: 0, reduced: new Set(), lastFx: -1, mines: [] };
    world.droneRt.set(owner.id, rt);
  }
  return rt;
}

/** Share of a hit that the owner's drones take: guardian (pool) and aegis (timed). Called after damage was applied. */
export function droneAbsorb(world: World, victim: SimEntity, armorDamage: number, hullDamage: number): void {
  if (!victim.drones?.length || victim.hull <= 0 && hullDamage <= 0) return;
  const rt = world.droneRt.get(victim.id);
  if (!rt) return;
  let share = 0; let guardShare = 0;
  const guard = victim.drones.find((d) => d.type === 'guardian');
  if (guard && rt.pool > 0) { guardShare = Math.min(0.5, 0.15 + 0.05 * guard.tier); share += guardShare; }
  if (rt.aegisUntil > world.time) share += 0.6;
  share = Math.min(0.8, share);
  if (share <= 0) return;
  const back = (armorDamage + hullDamage) * share;
  if (guardShare > 0) rt.pool = Math.max(0, rt.pool - (armorDamage + hullDamage) * guardShare);
  victim.armor = Math.min(victim.maxArmor, victim.armor + armorDamage * share);
  victim.hull = Math.min(victim.maxHull, victim.hull + hullDamage * share);
  if (back > 0 && world.time - rt.lastFx > 0.3) {
    rt.lastFx = world.time;
    world.events.push({ type: 'drone_fx', ownerId: victim.id, kind: 'absorb', slot: guard?.slot ?? 0, pos: { ...victim.pos } });
  }
}

function validTarget(world: World, owner: SimEntity): SimEntity | undefined {
  if (owner.targetId === undefined) return undefined;
  const t = world.entities.get(owner.targetId);
  if (!t || t.hull <= 0 || isInertKind(t.kind) || t.invulnerableTime > 0 || isPosInSafeZone(world, t.pos) || !canEngage(world, owner, t)) return undefined;
  return t;
}

const pvpMult = (owner: SimEntity, t: SimEntity): number => (owner.kind === 'player' && t.kind === 'player' ? PVP_DAMAGE_MULT : 1);

export function stepDrones(world: World, dt: number): void {
  // owners that disappeared
  for (const id of world.droneRt.keys()) { const e = world.entities.get(id); if (!e || e.hull <= 0 || !e.drones?.length) world.droneRt.delete(id); }

  for (const owner of world.entities.values()) {
    if (!owner.drones?.length || owner.hull <= 0) continue;
    const rt = runtime(world, owner);
    const safe = isPosInSafeZone(world, owner.pos);
    const sinceHit = (world.tick - (owner.lastDamagedTick ?? -1e9)) / TICKS_PER_SECOND;
    const guard = owner.drones.find((d) => d.type === 'guardian');
    if (guard && sinceHit > 3) rt.pool = Math.min(guard.power * 6, rt.pool + guard.power * 0.6 * dt);

    for (const d of owner.drones) {
      rt.cd[d.slot] = (rt.cd[d.slot] ?? 0.5 + d.slot * 0.3) - dt;
      const from = dronePosition(owner, d, world.time);
      if (safe) { if (rt.cd[d.slot] < 0) rt.cd[d.slot] = 0.5; continue; } // harmless in safe zones
      const ready = rt.cd[d.slot] <= 0;
      switch (d.type) {
        case 'sentinel': {
          if (!ready) break;
          const t = validTarget(world, owner);
          if (!t || Math.hypot(t.pos.x - owner.pos.x, t.pos.y - owner.pos.y) > owner.mainRange * 1.1) break;
          rt.cd[d.slot] = Math.max(0.6, owner.mainReloadTime);
          world.events.push({ type: 'drone_fx', ownerId: owner.id, kind: 'shot', slot: d.slot, pos: from, to: { ...t.pos } });
          dealDirectDamage(world, owner, t, hit(d) * pvpMult(owner, t));
          break;
        }
        case 'arc_drone': {
          if (!ready) break;
          const t = validTarget(world, owner);
          if (!t || Math.hypot(t.pos.x - owner.pos.x, t.pos.y - owner.pos.y) > owner.mainRange * 1.1) break;
          rt.cd[d.slot] = 2.2;
          const chain: SimEntity[] = [t];
          const near = [...world.entities.values()].filter((e) => e.id !== t.id && e.hull > 0 && !isInertKind(e.kind) && e.invulnerableTime <= 0 && Math.hypot(e.pos.x - t.pos.x, e.pos.y - t.pos.y) <= 260 && canEngage(world, owner, e) && !isPosInSafeZone(world, e.pos));
          near.sort((a, b) => Math.hypot(a.pos.x - t.pos.x, a.pos.y - t.pos.y) - Math.hypot(b.pos.x - t.pos.x, b.pos.y - t.pos.y) || a.id - b.id);
          chain.push(...near.slice(0, 2));
          world.events.push({ type: 'drone_fx', ownerId: owner.id, kind: 'arc', slot: d.slot, pos: from, points: chain.map((c) => ({ ...c.pos })) });
          for (const c of chain) dealDirectDamage(world, owner, c, hit(d) * 0.9 * pvpMult(owner, c));
          break;
        }
        case 'repair_bot': {
          if (sinceHit < 4 || (owner.hull >= owner.maxHull && owner.armor >= owner.maxArmor)) break;
          const rate = 0.003 * d.tier * quality(d) * dt;
          owner.hull = Math.min(owner.maxHull, owner.hull + owner.maxHull * rate);
          owner.armor = Math.min(owner.maxArmor, owner.armor + owner.maxArmor * rate);
          if (ready) { rt.cd[d.slot] = 1.5; world.events.push({ type: 'drone_fx', ownerId: owner.id, kind: 'repair', slot: d.slot, pos: from, to: { ...owner.pos } }); }
          break;
        }
        case 'aegis': {
          if (!ready || sinceHit > 5) break;
          rt.cd[d.slot] = Math.max(10, 22 - 2 * d.tier);
          const dur = 2.5 + 0.3 * d.tier;
          rt.aegisUntil = world.time + dur;
          world.events.push({ type: 'drone_fx', ownerId: owner.id, kind: 'aegis', slot: d.slot, pos: { ...owner.pos }, duration: dur });
          break;
        }
        case 'interceptor': {
          // weaken enemy ground attacks aimed at the owner (once per telegraph) ...
          for (const t of world.entities.values()) {
            if (t.kind !== 'telegraph' || rt.reduced.has(t.id) || t.isHostile === owner.isHostile) continue;
            if (Math.hypot(t.pos.x - owner.pos.x, t.pos.y - owner.pos.y) > (t.telegraphRadius ?? 100) + owner.radius) continue;
            rt.reduced.add(t.id);
            t.telegraphDamage = Math.round((t.telegraphDamage ?? 0) * (1 - Math.min(0.5, 0.1 * d.tier)));
            world.events.push({ type: 'drone_fx', ownerId: owner.id, kind: 'intercept', slot: d.slot, pos: from, to: { ...t.pos } });
          }
          if (rt.reduced.size > 64) for (const id of rt.reduced) if (!world.entities.has(id)) rt.reduced.delete(id);
          // ... and shoot down incoming shells
          if (!ready) break;
          let best: SimEntity | undefined; let bd = 450;
          for (const p of world.entities.values()) {
            if (p.kind !== 'projectile' || !canEngage(world, p, owner)) continue;
            const dd = Math.hypot(p.pos.x - owner.pos.x, p.pos.y - owner.pos.y);
            if (dd < bd) { bd = dd; best = p; }
          }
          if (best) {
            rt.cd[d.slot] = Math.max(1.2, 3.2 - 0.25 * d.tier);
            world.events.push({ type: 'drone_fx', ownerId: owner.id, kind: 'intercept', slot: d.slot, pos: from, to: { ...best.pos } });
            world.entities.delete(best.id);
          }
          break;
        }
        case 'sapper': {
          rt.mines = rt.mines.filter((id) => world.entities.get(id)?.kind === 'mine');
          if (!ready || rt.mines.length >= MAX_MINES_PER_OWNER) break;
          if (Math.hypot(owner.vel.x, owner.vel.y) < 30) break;
          const foe = [...world.entities.values()].some((e) => e.hull > 0 && !isInertKind(e.kind) && e.id !== owner.id && Math.hypot(e.pos.x - owner.pos.x, e.pos.y - owner.pos.y) < 1000 && canEngage(world, owner, e));
          if (!foe) break;
          rt.cd[d.slot] = Math.max(2, 5.5 - 0.4 * d.tier);
          const m = spawnMine(world, owner, from, hit(d) * 2, MINE_LIFETIME_SECONDS);
          rt.mines.push(m.id);
          world.events.push({ type: 'drone_fx', ownerId: owner.id, kind: 'mine', slot: d.slot, pos: from });
          break;
        }
        default: break; // guardian (pool) and recon (radar range) act through other paths
      }
    }
  }
  stepMines(world, dt);
}

function stepMines(world: World, dt: number): void {
  for (const m of Array.from(world.entities.values())) {
    if (m.kind !== 'mine') continue;
    m.wreckTimer = (m.wreckTimer ?? 0) - dt;
    const owner = m.sourceEntityId !== undefined ? world.entities.get(m.sourceEntityId) : undefined;
    if ((m.wreckTimer ?? 0) <= 0 || !owner || owner.hull <= 0) { world.entities.delete(m.id); continue; }
    for (const v of world.entities.values()) {
      if (v.id === owner.id || v.hull <= 0 || isInertKind(v.kind) || v.invulnerableTime > 0) continue;
      if (Math.hypot(v.pos.x - m.pos.x, v.pos.y - m.pos.y) > m.radius + v.radius * 0.6 + 40) continue;
      if (!canEngage(world, owner, v) || isPosInSafeZone(world, v.pos)) continue;
      v.statusEffects = v.statusEffects.filter((s) => s.type !== 'slowed');
      v.statusEffects.push({ type: 'slowed', duration: 3, maxDuration: 3, value: 0.5, sourceId: owner.id });
      world.events.push({ type: 'status_applied', entityId: v.id, status: 'slowed', duration: 3 });
      world.events.push({ type: 'explosion', pos: { ...m.pos }, radius: 70 });
      dealDirectDamage(world, owner, v, (m.telegraphDamage ?? 0) * pvpMult(owner, v));
      world.entities.delete(m.id);
      break;
    }
  }
}
