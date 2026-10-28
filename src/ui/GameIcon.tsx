import React from 'react';
import { isClanEmblem } from '../../shared/data/emblems';

/** Painted pictogram from /assets/icons/{name}.png (see docs/bildprompts-phase3.md, prompts 32-34). */
export function GameIcon({ name, size = 24, className = '' }: { name: string; size?: number; className?: string }) {
  return <img src={`/assets/icons/${name}.png`} width={size} height={size} alt="" draggable={false} className={`pointer-events-none select-none ${className}`} />;
}

/** Ammo type (as used by the sim) -> icon name. */
export const AMMO_ICON: Record<string, string> = {
  STANDARD: 'ammo_standard', REINFORCED: 'ammo_reinforced', ARMOR_PIERCING: 'ammo_ap', SHAPED_CHARGE: 'ammo_shaped', EXPLOSIVE: 'ammo_explosive',
};

/** Rank badge (rank level 1-21, see shared/data/ranks.ts). */
export function RankBadge({ level, size = 40 }: { level: number; size?: number }) {
  const n = String(Math.max(1, Math.min(21, level))).padStart(2, '0');
  return <img src={`/assets/badges/rank_${n}.png`} width={size} height={size} alt="" draggable={false} className="pointer-events-none select-none" />;
}

/** Clan emblem (id from shared/data/emblems.ts). Renders nothing when the clan has none or the sprite is missing. */
export function ClanEmblemBadge({ emblem, size = 16 }: { emblem?: string | null; size?: number }) {
  if (!emblem || !isClanEmblem(emblem)) return null;
  return <img src={`/assets/badges/emblem_${emblem}.png`} width={size} height={size} alt="" title={emblem.replace(/_/g, ' ')} draggable={false} onError={(e) => { e.currentTarget.style.display = 'none'; }} className="pointer-events-none select-none inline-block shrink-0" />;
}

/** Faction crest (coastal | highland | steppe). */
export function FactionCrest({ faction, size = 40 }: { faction: string; size?: number }) {
  return <img src={`/assets/badges/crest_${faction}.png`} width={size} height={size} alt="" draggable={false} className="pointer-events-none select-none" />;
}
