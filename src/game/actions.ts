import { SimRNG } from '../../shared/prng.ts';
import { CharacterState, ItemInstance, Result } from '../../shared/rules/character.ts';
import { ITEM_BY_ID, ItemDefinition, RARITY_CONFIGS } from '../../shared/data/items.ts';
import { UserProfile } from '../save/profile.ts';

/** Runs a rules function on a copy of the profile; returns the new profile only if the action succeeded. */
export function mutateCharacter(profile: UserProfile, fn: (ch: CharacterState, rng: SimRNG) => Result<any>): { profile: UserProfile; result: Result<any> } {
  const next: UserProfile = structuredClone(profile);
  const result = fn(next.character, new SimRNG((Date.now() ^ (next.character.nextUid * 2654435761)) >>> 0));
  return { profile: result.ok ? next : profile, result };
}

const ERRORS: Record<string, string> = {
  not_enough_materials: 'Not enough scrap, ore or fragments',
  not_enough_scrap: 'Not enough scrap',
  not_enough_ore: 'Not enough ore',
  inventory_full: 'Inventory full',
  level_too_low: 'Level too low',
  item_equipped: 'Unequip the item first',
  max_upgrade: 'Already at +15',
  max_rerolls: 'No rerolls left on this item',
  max_rank: 'Talent is maxed',
  no_points: 'No talent points available',
  prerequisite_missing: 'Requires the previous talent',
  garage_full: 'Garage is full (one more slot per 10 levels)',
  already_owned: 'Already owned',
  wrong_slot_type: 'Does not fit this slot',
  not_identical: 'Fusion needs 3 identical items (same item and rarity)',
  need_three_distinct: 'Select 3 different items',
  max_capacity: 'Inventory is at its maximum size',
  nothing_to_reset: 'No talents to reset',
};
export const errorText = (code: string): string => ERRORS[code] || code.replace(/_/g, ' ');

const FAMILY_NAME: Record<string, string> = {
  cannon: 'Cannon', rapid_fire: 'Rapid-Fire Gun', rocket: 'Rocket Launcher', mortar: 'Mortar', railgun: 'Railgun', flamethrower: 'Flamethrower',
  machine_gun: 'Machine Gun', flak: 'Flak Gun', mine_layer: 'Mine Layer', arc_coil: 'Arc Coil',
  reactive_armor: 'Reactive Armor', composite_armor: 'Composite Armor', sloped_armor: 'Sloped Armor', cage_armor: 'Cage Armor',
  speed_engine: 'Speed Engine', torque_engine: 'Torque Engine', efficiency_engine: 'Efficiency Engine',
};

export function itemName(def: ItemDefinition): string {
  if (def.family === 'module') return def.id.replace('mod_', '').split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  if (def.family === 'drone') return def.id.replace('drn_', '').replace(/_t\d+$/, '').split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') + ' Drone';
  return `${FAMILY_NAME[def.family] || def.family} T${def.tier}`;
}

export function describeItem(item: ItemInstance): { name: string; color: string; def: ItemDefinition } {
  const def = ITEM_BY_ID.get(item.defId)!;
  return { name: `${itemName(def)}${item.upgrade > 0 ? ` +${item.upgrade}` : ''}`, color: RARITY_CONFIGS[item.rarity].color, def };
}
