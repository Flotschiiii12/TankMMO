/**
 * Player actions (workshop, garage, talents, quests, season) as data, plus one executor used by BOTH the
 * authoritative server and the offline/local client, so the rules cannot drift apart.
 */
import { SimRNG } from '../prng.ts';
import type { AmmoType } from '../types.ts';
import * as C from './character.ts';
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
  | { kind: 'tutorial'; step: string };

export interface ActionContext {
  inSafeZone: boolean;
  nowSeconds: number;
  buyAmmo: (ammo: AmmoType, packs: number) => C.Result;
}

const SAFE_ONLY = new Set(['equip', 'unequip', 'upgrade', 'dismantle', 'craft', 'reroll', 'fuse', 'buy_vehicle', 'set_vehicle']);

export const AMMO_PRICES: Record<string, { pack: number; cost: number }> = {
  REINFORCED: { pack: 20, cost: 45 }, ARMOR_PIERCING: { pack: 20, cost: 65 }, SHAPED_CHARGE: { pack: 10, cost: 120 }, EXPLOSIVE: { pack: 20, cost: 75 },
};

export function executeAction(ch: C.CharacterState, a: ClientAction, rng: SimRNG, ctx: ActionContext): C.Result<any> {
  if (SAFE_ONLY.has(a.kind) && !ctx.inSafeZone) return { ok: false, error: 'safe_zone_only' };
  switch (a.kind) {
    case 'equip': { C.unequipItem(ch, a.vehicleId, a.slot); return C.equipItem(ch, a.vehicleId, a.slot, a.uid); }
    case 'unequip': return C.unequipItem(ch, a.vehicleId, a.slot);
    case 'upgrade': { const r = C.upgradeItem(ch, a.uid, rng, !!a.safe); if (r.ok) Q.onQuestEvent(ch, { type: 'upgrade' }); return r; }
    case 'dismantle': return C.dismantleItem(ch, a.uid);
    case 'craft': { const r = C.craftItem(ch, a.recipeId, rng); if (r.ok) Q.onQuestEvent(ch, { type: 'craft' }); return r; }
    case 'reroll': return C.rerollAffix(ch, a.uid, a.index, rng);
    case 'fuse': return C.fuseItems(ch, a.uids, rng);
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
    case 'tutorial': Q.onQuestEvent(ch, { type: 'tutorial', step: a.step }); return { ok: true };
    default: return { ok: false, error: 'unknown_action' };
  }
}
