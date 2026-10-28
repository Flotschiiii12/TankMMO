import { tr, T } from '../i18n.ts';
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
  not_enough_materials: T('Not enough scrap, ore or fragments'),
  not_enough_scrap: T('Not enough scrap'),
  not_enough_ore: T('Not enough ore'),
  inventory_full: T('Inventory full'),
  level_too_low: T('Level too low'),
  item_equipped: T('Unequip the item first'),
  max_upgrade: T('Already at +15'),
  max_rerolls: T('No rerolls left on this item'),
  max_rank: T('Talent is maxed'),
  no_points: T('No talent points available'),
  prerequisite_missing: T('Requires the previous talent'),
  garage_full: T('Garage is full (one more slot per 10 levels)'),
  already_owned: T('Already owned'),
  wrong_slot_type: T('Does not fit this slot'),
  not_identical: T('Fusion needs 3 identical items (same item and rarity)'),
  need_three_distinct: T('Select 3 different items'),
  max_capacity: T('Inventory is at its maximum size'),
  nothing_to_reset: T('No talents to reset'),
  // server / social / market error codes
  account_too_new: T('Your account is too new for the auction house'),
  already_claimed: T('Already claimed'),
  already_equipped: T('Already equipped'),
  already_friends: T('You are already friends'),
  already_in_clan: T('You are already in a clan'),
  already_queued: T('Already in the queue'),
  already_requested: T('Request already sent'),
  already_there: T('You are already there'),
  already_trading: T('Already trading'),
  arena_ban: T('You are banned from the arena queue for a while'),
  bad_amount: T('Invalid amount'),
  bad_tier: T('Invalid tier'),
  blocked: T('Blocked'),
  clan_full: T('The clan is full'),
  clan_scrap_too_low: T('The clan storage has too little scrap'),
  daily_trade_cap: T('Daily trade limit reached'),
  disabled: T('Not available right now'),
  duplicate_item: T('Each item can only be offered once'),
  faction_cooldown: T('You changed faction recently'),
  friend_list_full: T('Friend list is full'),
  friends_or_clan_only: T('Only friends or clan members can trade'),
  hub_only: T('Only in the hub'),
  in_match: T('You are in a match'),
  invalid_clan_name: T('Clan name must be 3-20 letters, digits, spaces, - or _'),
  invalid_emblem: T('Unknown emblem'),
  invalid_name: T('Invalid name'),
  invalid_tag: T('Clan tag must be 2-5 letters or digits'),
  item_bound: T('Bound items cannot be traded'),
  item_not_found: T('Item not found'),
  max_level: T('Already at the maximum level'),
  name_not_allowed: T('That name is not allowed'),
  name_or_tag_taken: T('Clan name or tag is already taken'),
  name_taken: T('That name is taken'),
  no_clan: T('You are not in a clan'),
  no_invite: T('No invitation found'),
  no_keys: T('No gate keys left'),
  no_permission: T('You do not have permission'),
  no_request: T('No request found'),
  no_such_slot: T('This vehicle has no such slot'),
  no_trade: T('No active trade'),
  not_found: T('Not found'),
  not_friends: T('Not friends'),
  not_in_party: T('You are not in a party'),
  not_in_same_clan: T('Not in the same clan'),
  not_leader: T('Only the leader can do that'),
  not_visited: T('You have not visited that map yet'),
  nothing_equipped: T('Nothing equipped there'),
  own_listing: T('You cannot buy your own listing'),
  party_full: T('The party is full'),
  player_offline: T('That player is not online'),
  price_out_of_range: T('Price is outside the allowed range'),
  rate_limited: T('Too many requests, try again later'),
  safe_zone_only: T('Only in a safe zone'),
  same_faction: T('You already belong to that faction'),
  self: T('That does not work on yourself'),
  seller_trade_cap: T('The seller reached the daily trade limit'),
  skin_not_owned: T('You do not own that skin'),
  target_in_clan: T('That player is already in a clan'),
  target_in_party: T('That player is already in a party'),
  tier_not_reached: T('Tier not reached yet'),
  too_many_listings: T('Too many active listings'),
  unknown_player: T('Unknown player'),
  unreachable: T('Not reachable from here'),
  vehicle_not_owned: T('You do not own that vehicle'),
  failed: T('Failed'),
  too_far: T('You are too far apart to trade'),
  storage_full: T('The clan storage is full'),
  daily_limit: T('Daily withdrawal limit reached'),
  unknown_clan: T('No clan with that tag'),
  already_allied: T('Already allied'),
  already_proposed: T('Proposal already sent'),
  ally_limit: T('Your clan already has 2 alliances'),
  target_ally_limit: T('That clan already has 2 alliances'),
  ally_cooldown: T('These clans broke up recently (7 day cooldown)'),
  no_proposal: T('No such proposal'),
  not_allied: T('Not allied'),
};
export const errorText = (code: string): string => tr(ERRORS[code] || code.replace(/_/g, ' '));

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
