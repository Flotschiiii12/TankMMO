/**
 * PvP rules (design doc section 8). Pure functions used by the world for target validation and damage.
 * PvP exists only on maps 21-29 (and in the arena) between players of DIFFERENT factions/teams.
 */
import type { SimEntity } from '../types.ts';
import type { World } from './world.ts';

/** Player-vs-player damage modifier: keeps duels at 20-40 s (see docs/BALANCE_REPORT.md); PvE is unaffected. */
export const PVP_DAMAGE_MULT = 0.7;
export const PVP_MIN_LEVEL = 15;
export const PVP_LEVEL_WINDOW = 5;
export const PORTAL_SAFE_RADIUS = 400;
export const KILL_CAP_COUNT = 3;
export const KILL_CAP_WINDOW_SECONDS = 30 * 60;
export const KILL_CAP_IMMUNITY_SECONDS = 60 * 60;
export const HONOR_REPEAT_SECONDS = 30 * 60;

/** Maps with open PvP: borderlands 21-24 and endgame 25-29. */
export function isPvpMap(numericMapId: number): boolean {
  return numericMapId >= 21 && numericMapId <= 29;
}

export interface PvpContext {
  pvpEnabled: boolean;
  /** arena: teams decide enmity instead of factions, and level rules do not apply */
  arena: boolean;
}

function inPortalZone(world: World, e: SimEntity): boolean {
  for (const g of world.map?.gates ?? []) if ((e.pos.x - g.x) ** 2 + (e.pos.y - g.y) ** 2 <= PORTAL_SAFE_RADIUS ** 2) return true;
  return false;
}

export function allianceKey(a: string, b: string): string {
  const x = a.toUpperCase(); const y = b.toUpperCase();
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

/** Allied clans (different factions) are immune to each other while the victim stands on a war control point. */
function alliedOnWarPoint(world: World, attacker: SimEntity, victim: SimEntity): boolean {
  if (!attacker.clanTag || !victim.clanTag || !world.war) return false;
  if (!world.alliances.has(allianceKey(attacker.clanTag, victim.clanTag))) return false;
  return world.war.some((p) => (victim.pos.x - p.x) ** 2 + (victim.pos.y - p.y) ** 2 <= p.radius ** 2);
}

/**
 * May `attacker` (a player vehicle or a projectile fired by one) damage `victim`?
 * Monsters vs players always works (existing isHostile rule); player vs player follows the PvP rules.
 */
export function canEngage(world: World, attacker: SimEntity, victim: SimEntity): boolean {
  if (attacker.isHostile !== victim.isHostile) return true;
  if (attacker.isHostile) return false;
  const aIsPlayer = attacker.kind === 'player' || (attacker.kind === 'projectile' && attacker.fromPlayer);
  if (!aIsPlayer || victim.kind !== 'player') return false;
  const ctx = world.pvp;
  if (!ctx?.pvpEnabled) return false;
  const aSource = attacker.kind === 'projectile' ? world.entities.get(attacker.sourceEntityId ?? -1) : attacker;
  if (attacker.id === victim.id || (aSource && aSource.id === victim.id)) return false;

  if (ctx.arena) {
    return attacker.team !== undefined && victim.team !== undefined && attacker.team !== victim.team && victim.invulnerableTime <= 0;
  }
  if (!attacker.faction || !victim.faction || attacker.faction === victim.faction) return false;
  if (attacker.level < PVP_MIN_LEVEL || victim.level < PVP_MIN_LEVEL) return false;
  if (Math.abs(attacker.level - victim.level) > PVP_LEVEL_WINDOW) return false;
  if (victim.invulnerableTime > 0 || attacker.invulnerableTime > 0) return false; // respawn / portal protection
  if (world.safeZones.some((z) => (victim.pos.x - z.x) ** 2 + (victim.pos.y - z.y) ** 2 <= z.radius ** 2)) return false;
  if (inPortalZone(world, victim) || inPortalZone(world, attacker.kind === 'projectile' && aSource ? aSource : attacker)) return false;
  if (world.alliances.size > 0 && alliedOnWarPoint(world, aSource ?? attacker, victim)) return false;
  const key = `${aSource?.id ?? attacker.id}>${victim.id}`;
  const until = world.pvpImmunity.get(key);
  if (until !== undefined && until > world.time) return false; // kill cap: this attacker may not hit this victim for 1 h
  return true;
}

/** Called when `killer` kills `victim` in PvP: tracks the kill cap and returns whether it was just triggered. */
export function registerPvpKill(world: World, killerId: number, victimId: number): { capTriggered: boolean } {
  const key = `${killerId}>${victimId}`;
  const list = (world.pvpKills.get(key) ?? []).filter((t) => world.time - t < KILL_CAP_WINDOW_SECONDS);
  list.push(world.time);
  world.pvpKills.set(key, list);
  if (list.length >= KILL_CAP_COUNT) {
    world.pvpImmunity.set(key, world.time + KILL_CAP_IMMUNITY_SECONDS);
    world.pvpKills.delete(key);
    return { capTriggered: true };
  }
  return { capTriggered: false };
}

/** Honor only for targets within +-5 levels and once per victim per 30 minutes (arena kills give none). */
export function honorForKill(world: World, killer: SimEntity, victim: SimEntity, lastHonorAt: Map<number, number>, nowSeconds: number): number {
  if (world.pvp?.arena) return 0;
  if (Math.abs(killer.level - victim.level) > PVP_LEVEL_WINDOW) return 0;
  const last = lastHonorAt.get(victim.id);
  if (last !== undefined && nowSeconds - last < HONOR_REPEAT_SECONDS) return 0;
  lastHonorAt.set(victim.id, nowSeconds);
  return 20 + victim.level;
}

export const HONOR_LOSS_ON_DEATH = 5;
export const BOUNTY_STREAK = 5;
export const BOUNTY_SCRAP_PER_STREAK = 400;
