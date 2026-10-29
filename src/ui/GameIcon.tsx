import React from 'react';
import { isClanEmblem } from '../../shared/data/emblems';

/** Painted pictogram from /assets/icons/{name}.png (see docs/bildprompts-phase3.md, prompts 32-34). */
export function GameIcon({ name, size = 24, className = '' }: { name: string; size?: number; className?: string }) {
  return <img src={`/assets/icons/${name}.png`} width={size} height={size} alt="" draggable={false} className={`pointer-events-none select-none ${className}`} />;
}

/** Icon that falls back to nothing when the file is missing; the label stays as tooltip and aria-label. */
function SafeIcon({ name, size, label }: { name: string; size: number; label: string }) {
  return <img src={`/assets/icons/${name}.png`} width={size} height={size} alt="" title={label} aria-label={label} draggable={false} onError={(e) => { e.currentTarget.style.display = 'none'; }} className="inline-block align-middle shrink-0 pointer-events-none select-none" />;
}

/** Rarity gem (common | uncommon | rare | epic | legendary). */
export function RarityGem({ rarity, size = 14 }: { rarity: string; size?: number }) {
  return <SafeIcon name={`rarity_${rarity}`} size={size} label={rarity} />;
}

/** Wallet / currency pictogram: scrap, iron|copper|titanium|crystal (ore), honor, marks_faction, token_event, token_season, gate_key, fragments, cells. */
const CURRENCY_ICON: Record<string, string> = {
  scrap: 'scrap', iron: 'ore_iron', copper: 'ore_copper', titanium: 'ore_titanium', crystal: 'ore_crystal', ore: 'ore_iron',
  honor: 'honor', marks: 'marks_faction', event: 'token_event', season: 'token_season', gate_key: 'gate_key', fragments: 'fragments', cells: 'cells',
};
export function CurrencyIcon({ kind, size = 14, label }: { kind: keyof typeof CURRENCY_ICON | string; size?: number; label?: string }) {
  const name = CURRENCY_ICON[kind];
  return name ? <SafeIcon name={name} size={size} label={label ?? kind.replace(/_/g, ' ')} /> : null;
}

/** Equipment slot (main | secondary | armor | engine | module | drone). */
export function SlotIcon({ slot, size = 14 }: { slot: string; size?: number }) {
  return <SafeIcon name={`slot_${slot}`} size={size} label={slot} />;
}

/** Weapon family -> icon (only families that have a painted icon). */
const FAMILY_ICON: Record<string, string> = {
  cannon: 'fam_cannon', rapid_fire: 'fam_rapid', rocket: 'fam_rocket', mortar: 'fam_mortar', railgun: 'fam_railgun', flamethrower: 'fam_flame',
};
export function FamilyIcon({ family, size = 14 }: { family: string; size?: number }) {
  const name = FAMILY_ICON[family];
  return name ? <SafeIcon name={name} size={size} label={family.replace(/_/g, ' ')} /> : null;
}

const VEHICLE_CLASS_ICON: Record<string, string> = {
  scout: 'radar', medium: 'fam_cannon', heavy: 'shield', artillery: 'fam_mortar', support: 'repair',
};
export function VehicleClassIcon({ vehicleClass, size = 18 }: { vehicleClass: string; size?: number }) {
  const name = VEHICLE_CLASS_ICON[vehicleClass];
  return name ? <SafeIcon name={name} size={size} label={vehicleClass} /> : null;
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
