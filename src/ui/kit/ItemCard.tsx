import React from 'react';
import { RarityGem, SlotIcon } from '../GameIcon.tsx';
import { ART, ArtSlot } from './art.tsx';
import { rarityStyle } from './logic.ts';

export interface ItemCardProps {
  rarity: string; name: string; icon?: React.ReactNode; slot?: string; upgrade?: number; tier?: number;
  affixes?: Array<{ text: string; tone?: 'good' | 'bad' | 'neutral' }>;
  selected?: boolean; empty?: boolean; locked?: boolean; onClick?: () => void; compact?: boolean;
}

/**
 * Item tile with rarity frame (painted frame when art exists, CSS border otherwise), upgrade level and tier.
 * The accessible name always contains rarity and name; affixes show in the tooltip/detail, not inside the 64 px tile.
 */
export const ItemCard = React.forwardRef<HTMLButtonElement, ItemCardProps>(({ rarity, name, icon, slot, upgrade = 0, tier, selected, empty, locked, onClick }, ref) => {
  const st = rarityStyle(rarity);
  return (
    <button ref={ref} type="button" className="k-item" data-rarity={rarity} data-empty={empty ? 'true' : undefined} aria-pressed={selected} disabled={locked}
      aria-label={empty ? name : `${rarity} ${name}${upgrade ? ` +${upgrade}` : ''}`} onClick={onClick} style={{ ['--rc' as string]: empty ? undefined : `var(${st.cssVar})` }}>
      {!empty && <ArtSlot src={ART.rarityFrame(rarity)} className="k-item__frame" />}
      {empty ? (slot ? <SlotIcon slot={slot} size={22} /> : null) : <>{icon}{!icon && <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>}</>}
      {!empty && upgrade > 0 && <span className="k-item__lvl">+{upgrade}</span>}
      {!empty && tier !== undefined && <span className="k-item__tag">T{tier}</span>}
      {!empty && <span style={{ position: 'absolute', bottom: 2, right: 3 }}><RarityGem rarity={rarity.toLowerCase()} size={12} /></span>}
    </button>
  );
});
ItemCard.displayName = 'ItemCard';

/** The affix lines of an item for tooltips and detail panels, coloured by rarity of the line's value. */
export const AffixList: React.FC<{ affixes: NonNullable<ItemCardProps['affixes']> }> = ({ affixes }) => (
  <>{affixes.map((a, i) => <span key={i} className="k-item__affix" style={{ color: a.tone === 'bad' ? 'var(--c-bad)' : a.tone === 'neutral' ? 'var(--c-text-2)' : 'var(--c-good)' }}>{a.text}</span>)}</>
);
