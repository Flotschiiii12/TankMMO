/** Bonus affix pool (rolled on Uncommon+ items, rerollable). Values are +% (or flat for flat_reduction). */
import type { ItemAffix, ItemRarity } from './items.ts';

type AffixStat = ItemAffix['stat'];

export const AFFIX_POOL: Array<{ stat: AffixStat; nameKey: string; min: number; max: number }> = [
  { stat: 'dps', nameKey: 'affix.dps', min: 3, max: 8 },
  { stat: 'hull', nameKey: 'affix.hull', min: 4, max: 10 },
  { stat: 'armor', nameKey: 'affix.armor', min: 4, max: 10 },
  { stat: 'speed', nameKey: 'affix.speed', min: 2, max: 6 },
  { stat: 'crit_chance', nameKey: 'affix.crit_chance', min: 1, max: 4 },
  { stat: 'flat_reduction', nameKey: 'affix.flat_reduction', min: 2, max: 6 },
  { stat: 'reload_speed', nameKey: 'affix.reload_speed', min: 2, max: 6 },
  { stat: 'range', nameKey: 'affix.range', min: 3, max: 8 },
];

/** Higher rarities roll closer to the top of the range. */
export const AFFIX_ROLL_BIAS: Record<ItemRarity, number> = { Common: 0, Uncommon: 0.0, Rare: 0.25, Epic: 0.5, Legendary: 0.8 };
