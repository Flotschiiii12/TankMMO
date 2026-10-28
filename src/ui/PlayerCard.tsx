import React from 'react';
import { tr } from '../i18n.ts';
import { getRankForHonor } from '../../shared/data/ranks.ts';
import { getXPForLevel, MAX_PLAYER_LEVEL } from '../../shared/rules/progression.ts';
import type { CharacterState } from '../../shared/rules/character.ts';
import { FactionCrest, RankBadge } from './GameIcon.tsx';
import { Ring } from './kit/Indicators.tsx';
import { CurrencyChip } from './kit/Currency.tsx';

/** Top-left player card: rank badge inside an XP ring, name, level, faction crest and the two wallet chips that matter in combat. */
export const PlayerCard: React.FC<{ character: CharacterState; name: string; compact?: boolean }> = ({ character: ch, name, compact }) => {
  const need = ch.level >= MAX_PLAYER_LEVEL ? 1 : getXPForLevel(ch.level + 1);
  const xp = ch.level >= MAX_PLAYER_LEVEL ? 1 : ch.xp;
  const rank = getRankForHonor(ch.wallet.honor);
  const size = compact ? 48 : 56;
  return (
    <div className="flex items-center gap-2" data-testid="player-card">
      <Ring kind="xp" value={xp} max={need} size={size} stroke={4} ariaLabel={tr('Experience')}>
        <RankBadge level={rank.level} size={size - 14} />
      </Ring>
      <div className="min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 text-sm font-bold leading-none">
          <FactionCrest faction={ch.faction} size={16} />
          <span className="truncate max-w-[9rem]">{name}</span>
        </div>
        <div className="text-[11px] leading-none" style={{ color: 'var(--c-text-2)' }}>
          <span style={{ color: 'var(--accent-2)', fontWeight: 700 }}>{tr('Level')} {ch.level}</span>
          {ch.level < MAX_PLAYER_LEVEL && <span> · {Math.floor((xp / need) * 100)} %</span>}
        </div>
        <div className="flex gap-1 flex-wrap">
          <CurrencyChip kind="scrap" value={ch.wallet.scrap} compact title={tr('Scrap')} />
          <CurrencyChip kind="fragments" value={ch.wallet.fragments} compact title={tr('Fragments')} />
        </div>
      </div>
    </div>
  );
};
