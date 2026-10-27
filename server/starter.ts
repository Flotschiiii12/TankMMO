import { SimRNG } from '../shared/prng.ts';
import { CharacterState, createCharacter, createItem, equipItem, PlayerFaction } from '../shared/rules/character.ts';

export const DEFAULT_AMMO: Record<string, number> = { STANDARD: -1, REINFORCED: 0, ARMOR_PIERCING: 20, SHAPED_CHARGE: 0, EXPLOSIVE: 10 };

/** New server characters start with a common cannon, armor plating and engine fitted. */
export function createStarterCharacterForServer(name: string, faction: PlayerFaction = 'coastal'): CharacterState {
  const ch = createCharacter(name);
  ch.faction = faction;
  ch.wallet.scrap = 400;
  const rng = new SimRNG(1);
  for (const [defId, slot] of [['wpn_cannon_t1', 'main0'], ['arm_reactive_armor_t1', 'armor0'], ['eng_speed_engine_t1', 'engine0']] as const) {
    const made = createItem(ch, defId, 'Common', rng);
    if (made.ok) equipItem(ch, ch.activeVehicle, slot, made.item.uid);
  }
  return ch;
}
