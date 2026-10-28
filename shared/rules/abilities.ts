/**
 * Which abilities a character may trigger. The server checks this for every UseAbility command, so a modified client
 * cannot use abilities that its vehicle or loadout does not provide.
 */
import type { AbilityId } from '../types.ts';
import type { CharacterState } from './character.ts';
import { VEHICLE_CATALOG } from '../data/vehicles.ts';
import { ITEM_BY_ID } from '../data/items.ts';

/** Available to every vehicle. */
export const BASE_ABILITIES: readonly AbilityId[] = ['smoke', 'repair_kit', 'boost'];
/** One signature ability per vehicle class. */
export const CLASS_ABILITY: Record<string, AbilityId> = { scout: 'dash', medium: 'overcharge', heavy: 'fortify', artillery: 'barrage', support: 'repair_aura' };
/** Module item -> ability it grants while equipped on the active vehicle. */
export const MODULE_ABILITY: Record<string, AbilityId> = { mod_emergency_shield: 'emergency_shield' };

export function allowedAbilities(ch: CharacterState): Set<AbilityId> {
  const out = new Set<AbilityId>(BASE_ABILITIES);
  const veh = VEHICLE_CATALOG.find((v) => v.id === ch.activeVehicle);
  const cls = veh && CLASS_ABILITY[veh.vehicleClass];
  if (cls) out.add(cls);
  const g = ch.garage.find((x) => x.vehicleId === ch.activeVehicle);
  if (g) for (const uid of Object.values(g.loadout)) {
    const item = ch.inventory.find((i) => i.uid === uid);
    const granted = item && MODULE_ABILITY[item.defId];
    if (granted && ITEM_BY_ID.has(item!.defId)) out.add(granted);
  }
  return out;
}
