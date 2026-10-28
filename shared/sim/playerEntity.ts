import { CharacterState, computeLoadoutStats } from '../rules/character.ts';
import { SimEntity, Vec2 } from '../types.ts';
import { spawnVehicle, World } from './world.ts';

/** Builds the player's vehicle entity from the character (vehicle + level + gear + talents + mastery) inside `world`. */
export function spawnPlayerFromCharacter(world: World, ch: CharacterState, pos: Vec2, ammo?: Partial<Record<string, number>>): SimEntity {
  const stats = computeLoadoutStats(ch)!;
  const ent = spawnVehicle(world, 'player', ch.name, ch.level, pos, {
    tier: stats.tier,
    vehicleClass: stats.vehicleClass as any,
    clanTag: 'CMD',
    maxHull: stats.maxHull,
    maxArmor: stats.maxArmor,
    maxSpeed: stats.maxSpeed,
    turnRate: stats.turnRate,
    turretTurnRate: stats.turretTurnRate,
    mainDamage: stats.mainDamage,
    mainReloadTime: stats.mainReloadTime,
    radius: 26 + stats.tier * 2,
  });
  ent.mainRange = stats.mainRange;
  ent.mgDamage = stats.mgDamage;
  ent.mgRange = stats.mgRange;
  ent.critChance = stats.critChance;
  ent.flatArmorReduction = stats.flatReduction;
  ent.invulnerableTime = 5;
  ent.faction = ch.faction;
  ent.drones = stats.drones.length ? stats.drones : undefined;
  ent.radarMult = stats.radarMult > 1 ? stats.radarMult : undefined;
  if (ammo) for (const [k, v] of Object.entries(ammo)) if (k !== 'STANDARD') (ent.ammoInventory as any)[k] = v ?? 0;
  return ent;
}

/** Applies fresh loadout stats to an existing player entity (after equipping, leveling...), keeping health ratios. */
export function refreshPlayerStats(ent: SimEntity, ch: CharacterState): void {
  const s = computeLoadoutStats(ch);
  if (!s) return;
  const hullRatio = ent.maxHull > 0 ? ent.hull / ent.maxHull : 1;
  const armorRatio = ent.maxArmor > 0 ? ent.armor / ent.maxArmor : 1;
  ent.skin = ch.activeSkin;
  ent.drones = s.drones.length ? s.drones : undefined;
  ent.radarMult = s.radarMult > 1 ? s.radarMult : undefined;
  Object.assign(ent, {
    maxHull: s.maxHull, maxArmor: s.maxArmor, maxSpeed: s.maxSpeed, turnRate: s.turnRate, turretTurnRate: s.turretTurnRate,
    mainReloadTime: s.mainReloadTime, mainDamage: s.mainDamage, mainRange: s.mainRange, mgDamage: s.mgDamage, mgRange: s.mgRange,
    critChance: s.critChance, flatArmorReduction: s.flatReduction, level: ch.level, vehicleClass: s.vehicleClass, tier: s.tier, radius: 26 + s.tier * 2,
  });
  if (ent.hull > 0) { ent.hull = Math.round(ent.maxHull * hullRatio); ent.armor = Math.round(ent.maxArmor * armorRatio); }
}
