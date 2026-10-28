/**
 * Player actions (workshop, garage, talents, quests, season) as data, plus one executor used by BOTH the
 * authoritative server and the offline/local client, so the rules cannot drift apart.
 */
import { SimRNG } from '../prng.ts';
import type { AmmoType } from '../types.ts';
import * as C from './character.ts';
import { bump } from './achievements.ts';
import * as Q from './quests.ts';

export type ClientAction =
  | { kind: 'equip'; vehicleId: string; slot: string; uid: string }
  | { kind: 'unequip'; vehicleId: string; slot: string }
  | { kind: 'upgrade'; uid: string; safe?: boolean }
  | { kind: 'dismantle'; uid: string }
  | { kind: 'craft'; recipeId: string }
  | { kind: 'reroll'; uid: string; index: number }
  | { kind: 'fuse'; uids: string[] }
  | { kind: 'expand_inventory' }
  | { kind: 'buy_vehicle'; vehicleId: string }
  | { kind: 'set_vehicle'; vehicleId: string }
  | { kind: 'rank_talent'; talentId: string }
  | { kind: 'respec' }
  | { kind: 'accept_quest'; questId: string }
  | { kind: 'claim_quest'; questId: string }
  | { kind: 'abandon_quest'; questId: string }
  | { kind: 'claim_season_tier'; tier: number }
  | { kind: 'buy_ammo'; ammo: AmmoType; packs: number }
  | { kind: 'tutorial'; step: string }
  | { kind: 'set_skin'; skin: string | null }
  | { kind: 'change_faction'; faction: C.PlayerFaction }
  | { kind: 'sell_item'; uid: string };

export interface ActionContext {
  inSafeZone: boolean;
  nowSeconds: number;
  buyAmmo: (ammo: AmmoType, packs: number) => C.Result;
}

const SAFE_ONLY = new Set(['sell_item', 'change_faction', 'equip', 'unequip', 'upgrade', 'dismantle', 'craft', 'reroll', 'fuse', 'buy_vehicle', 'set_vehicle']);

export const AMMO_PRICES: Record<string, { pack: number; cost: number }> = {
  REINFORCED: { pack: 20, cost: 45 }, ARMOR_PIERCING: { pack: 20, cost: 65 }, SHAPED_CHARGE: { pack: 10, cost: 120 }, EXPLOSIVE: { pack: 20, cost: 75 },
};

export const reputationLevel = C.reputationLevel;

export function ammoCost(ch: C.CharacterState, ammo: string, packs: number): number | undefined {
  const price = AMMO_PRICES[ammo];
  if (!price) return undefined;
  return Math.max(1, Math.round(price.cost * packs * (1 - 0.03 * reputationLevel(ch))));
}

export function executeAction(ch: C.CharacterState, a: ClientAction, rng: SimRNG, ctx: ActionContext): C.Result<any> {
  if (SAFE_ONLY.has(a.kind) && !ctx.inSafeZone) return { ok: false, error: 'safe_zone_only' };
  switch (a.kind) {
    case 'equip': { C.unequipItem(ch, a.vehicleId, a.slot); return C.equipItem(ch, a.vehicleId, a.slot, a.uid); }
    case 'unequip': return C.unequipItem(ch, a.vehicleId, a.slot);
    case 'upgrade': { const r = C.upgradeItem(ch, a.uid, rng, !!a.safe); if (r.ok) { Q.onQuestEvent(ch, { type: 'upgrade' }); bump(ch, 'upgrades'); } return r; }
    case 'dismantle': { const r = C.dismantleItem(ch, a.uid); if (r.ok) bump(ch, 'dismantled'); return r; }
    case 'craft': { const r = C.craftItem(ch, a.recipeId, rng); if (r.ok) { Q.onQuestEvent(ch, { type: 'craft' }); bump(ch, 'crafted'); } return r; }
    case 'reroll': { const r = C.rerollAffix(ch, a.uid, a.index, rng); if (r.ok) bump(ch, 'rerolls'); return r; }
    case 'fuse': { const r = C.fuseItems(ch, a.uids, rng); if (r.ok && r.upgraded) bump(ch, 'fusions'); return r; }
    case 'expand_inventory': return C.expandInventory(ch);
    case 'buy_vehicle': return C.buyVehicle(ch, a.vehicleId);
    case 'set_vehicle':
      if (!ch.garage.some((g) => g.vehicleId === a.vehicleId)) return { ok: false, error: 'vehicle_not_owned' };
      ch.activeVehicle = a.vehicleId;
      return { ok: true };
    case 'rank_talent': return C.rankUpTalent(ch, a.talentId);
    case 'respec': return C.respecTalents(ch);
    case 'accept_quest': return Q.acceptQuest(ch, a.questId);
    case 'claim_quest': return Q.claimQuest(ch, a.questId, rng, ctx.nowSeconds);
    case 'abandon_quest': return Q.abandonQuest(ch, a.questId);
    case 'claim_season_tier': return Q.claimSeasonTier(ch, a.tier, ctx.nowSeconds);
    case 'buy_ammo': return ctx.buyAmmo(a.ammo, a.packs);
    case 'set_skin': {
      if (a.skin !== null && !ch.season.skins.includes(a.skin)) return { ok: false, error: 'skin_not_owned' };
      ch.activeSkin = a.skin ?? undefined;
      return { ok: true, value: undefined };
    }
    case 'change_faction': return C.changeFaction(ch, a.faction, ctx.nowSeconds);
    case 'sell_item': return C.sellItemToNpc(ch, a.uid);
    case 'tutorial': Q.onQuestEvent(ch, { type: 'tutorial', step: a.step }); return { ok: true };
    default: return { ok: false, error: 'unknown_action' };
  }
}
