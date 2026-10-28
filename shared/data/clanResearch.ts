/** Clan research table (convenience and cosmetics only, never combat power). Shared so the clan screen shows the same costs the server charges. */
export const CLAN_RESEARCH: Array<{ id: string; name: string; maxLevel: number; costPerLevel: number; effect: string }> = [
  { id: 'banner', name: 'Clan banner styles', maxLevel: 5, costPerLevel: 20_000, effect: 'cosmetic' },
  { id: 'storage', name: 'Storage space', maxLevel: 5, costPerLevel: 30_000, effect: 'convenience: +10 storage slots per level' },
  { id: 'xpshare', name: 'Shared XP', maxLevel: 3, costPerLevel: 50_000, effect: 'convenience: +2% party XP per level' },
];
