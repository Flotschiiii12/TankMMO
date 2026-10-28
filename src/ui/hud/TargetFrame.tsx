import React from 'react';
import { tr, nm, localizeEntityName } from '../../i18n.ts';
import type { SimEntity } from '../../../shared/types.ts';
import { AMMO_CONFIGS } from '../../../shared/rules/ammo.ts';
import { TRANSLATIONS } from '../../../shared/data/i18n.ts';
import { bestAmmoAgainst, killsToGo } from '../combatLogic.ts';
import { ProgressBar } from '../kit/Indicators.tsx';
import { Badge } from '../kit/Indicators.tsx';
import { StatusChips } from './StatusCluster.tsx';
import { useShortScreen } from '../useShortScreen.ts';

const CLASS_LABEL: Record<string, string> = { scout: 'Scout', medium: 'Medium', heavy: 'Heavy', artillery: 'Artillery', support: 'Support' };

/**
 * Frame for the locked target, top centre: name, level, class, armor/hull bars, statuses, best ammo with its multiplier and an
 * estimate of the kill. On short screens it shrinks to name, bars and statuses so it fits the gap between status block and menu.
 */
export const TargetFrame: React.FC<{ target: SimEntity | null; me: SimEntity | null; ammo: Record<string, number>; colorBlind?: boolean }> = ({ target, me, ammo, colorBlind }) => {
  const short = useShortScreen();
  if (!target || !me || target.hull <= 0) return null;
  const best = bestAmmoAgainst(target, ammo as never);
  const ttk = killsToGo(target, me);
  const label = target.vehicleClass ? tr(CLASS_LABEL[target.vehicleClass] ?? target.vehicleClass) : tr(String(target.kind).replace(/_/g, ' '));
  const hostile = target.isHostile;
  const ammoKey = AMMO_CONFIGS[best.ammo]?.nameKey ?? '';
  const ammoName = nm(ammoKey, TRANSLATIONS.en[ammoKey] ?? String(best.ammo));
  return (
    <div className="hud-surface hud-scale px-2 py-1.5 min-w-0 w-full max-w-[17rem] pointer-events-none" data-testid="target-panel" data-hud="target" style={{ borderColor: hostile ? (colorBlind ? 'rgba(245,158,11,0.6)' : 'rgba(239,68,68,0.6)') : 'rgba(34,197,94,0.5)' }}>
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <b className="truncate text-[13px] text-white">{target.kind === 'player' ? target.name : localizeEntityName(target.name)}</b>
        <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--c-text-2)' }}>Lv {target.level}{target.isElite ? ` · ${tr('Elite')}` : ''}</span>
      </div>
      {!short && <div className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>{label}</div>}
      <div className="mt-1 grid gap-1">
        <ProgressBar kind="armor" value={target.armor} max={target.maxArmor} ariaLabel={tr('Armor')} />
        <ProgressBar kind={hostile ? 'bad' : 'hull'} value={target.hull} max={target.maxHull} ariaLabel={tr('Hull')} />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 min-w-0">
        <StatusChips effects={target.statusEffects} max={short ? 3 : 5} />
        {!short && <span className="text-[11px] truncate" style={{ color: 'var(--c-text-2)' }}>{tr('best ammo')}: <b style={{ color: 'var(--c-text)' }}>{ammoName}</b>{best.multiplier !== 1 && <Badge tone={best.multiplier > 1 ? 'good' : 'warn'}>×{best.multiplier}</Badge>}</span>}
      </div>
      {!short && <div className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>{tr('about {n} shots (~{s} s)', { n: ttk.shots, s: ttk.seconds })}</div>}
    </div>
  );
};
