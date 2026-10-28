import React from 'react';
import { tr } from '../../i18n.ts';
import type { SimEntity } from '../../../shared/types.ts';
import { ProgressBar } from '../kit/Indicators.tsx';
import { useGhost } from './useGhost.ts';
import { useShortScreen } from '../useShortScreen.ts';

export const STATUS_GLYPH: Record<string, string> = { slowed: '🧊', burning: '🔥', stunned: '💫', marked: '🎯', smoked: '☁', boosted: '⚡', repairing: '✚', invulnerable: '🛡', fortified: '⛨' };
const STATUS_NAME: Record<string, string> = { slowed: 'Slowed', burning: 'Burning', stunned: 'Stunned', marked: 'Marked', smoked: 'Smoke', boosted: 'Boost', repairing: 'Repairing', invulnerable: 'Invulnerable', fortified: 'Fortified' };

/** Row of status chips (own buffs/debuffs or the target's) with the remaining seconds where the effect has a timer. */
export const StatusChips: React.FC<{ effects: SimEntity['statusEffects']; max?: number }> = ({ effects, max = 5 }) => (
  <div className="flex gap-1 flex-wrap" aria-label={tr('Status effects')}>
    {effects.slice(0, max).map((s, i) => {
      const left = (s as { remaining?: number; duration?: number }).remaining ?? (s as { duration?: number }).duration;
      return <span key={`${s.type}-${i}`} className="k-status-chip" title={tr(STATUS_NAME[s.type] ?? s.type)}><span aria-hidden>{STATUS_GLYPH[s.type] ?? '•'}</span>{typeof left === 'number' && left > 0 && left < 600 ? <span>{Math.ceil(left)}</span> : null}</span>;
    })}
  </div>
);

/** Own hull and armor bars with trailing damage chunk and the active status chips. */
export const StatusCluster: React.FC<{ player: SimEntity | null; hideChips?: boolean }> = ({ player, hideChips }) => {
  const hull = player?.hull ?? 0; const armor = player?.armor ?? 0;
  const short = useShortScreen();
  const hullGhost = useGhost(hull); const armorGhost = useGhost(armor);
  if (!player) return null;
  return (
    <div className="flex flex-col gap-1" data-testid="status-bars">
      <ProgressBar kind="hull" value={hull} max={player.maxHull} ghost={hullGhost} large={!short} label={`${Math.ceil(hull)} / ${Math.ceil(player.maxHull)}`} ariaLabel={tr('Hull')} />
      <ProgressBar kind="armor" value={armor} max={player.maxArmor} ghost={armorGhost} label={undefined} ariaLabel={tr('Armor')} />
      {!hideChips && player.statusEffects.length > 0 && <StatusChips effects={player.statusEffects} />}
    </div>
  );
};

/** Party members (other than you) with name and a thin hull bar. */
export const PartyFrames: React.FC<{ names?: string[]; entities: SimEntity[]; meId?: number }> = ({ names, entities, meId }) => {
  if (!names?.length) return null;
  const members = entities.filter((e) => e.kind === 'player' && e.id !== meId && names.includes(e.name)).slice(0, 4);
  if (!members.length) return null;
  return (
    <div className="flex flex-col gap-1" data-testid="party-frames">
      {members.map((m) => (
        <div key={m.id} className="flex items-center gap-2 text-[11px]">
          <span className="truncate max-w-[6.5rem] font-semibold">{m.name}</span>
          <div className="flex-1 min-w-[3rem]"><ProgressBar kind="hull" value={m.hull} max={m.maxHull} ariaLabel={`${m.name} ${tr('Hull')}`} /></div>
        </div>
      ))}
    </div>
  );
};
