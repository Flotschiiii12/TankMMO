import { ITEM_BY_ID } from '../../shared/data/items.ts';

/** Same band as the server (PRICE_FLOOR_MULT / PRICE_CEILING_MULT in server/market.ts), shown as a hint in the UI. */
export function priceBandClient(defId: string): { min: number; max: number } | undefined {
  const def = ITEM_BY_ID.get(defId);
  return def ? { min: Math.max(1, Math.round(def.scrapValue * 0.5)), max: Math.round(def.scrapValue * 60) } : undefined;
}
