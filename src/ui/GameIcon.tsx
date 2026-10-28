import React from 'react';

/** Painted pictogram from /assets/icons/{name}.png (see docs/bildprompts-phase3.md, prompts 32-34). */
export function GameIcon({ name, size = 24, className = '' }: { name: string; size?: number; className?: string }) {
  return <img src={`/assets/icons/${name}.png`} width={size} height={size} alt="" draggable={false} className={`pointer-events-none select-none ${className}`} />;
}

/** Ammo type (as used by the sim) -> icon name. */
export const AMMO_ICON: Record<string, string> = {
  STANDARD: 'ammo_standard', REINFORCED: 'ammo_reinforced', ARMOR_PIERCING: 'ammo_ap', SHAPED_CHARGE: 'ammo_shaped', EXPLOSIVE: 'ammo_explosive',
};
