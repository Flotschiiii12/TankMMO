/** Clan emblem ids: single source of truth. Sprites live in public/assets/badges/emblem_<id>.png. */
export const CLAN_EMBLEMS = [
  'eagle', 'wolf', 'bear_paw', 'lion', 'bull', 'fox', 'boar', 'owl', 'raven', 'snake',
  'cannons', 'tank', 'anvil', 'gear', 'tools', 'bolt', 'anchor', 'star', 'crown', 'flame',
  'mountain', 'wave', 'sun', 'moon', 'lightning', 'tree', 'wheat', 'windmill', 'lighthouse', 'bridge',
  'tower', 'shield_sword', 'compass', 'key', 'diamond', 'wing', 'horse', 'stag', 'bee', 'clover',
] as const;
export type ClanEmblem = (typeof CLAN_EMBLEMS)[number];

export const isClanEmblem = (v: unknown): v is ClanEmblem => typeof v === 'string' && (CLAN_EMBLEMS as readonly string[]).includes(v);
