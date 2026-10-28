import React from 'react';
import { tr, nm, localizeEntityName } from '../i18n.ts';
import type { SimEntity } from '../../shared/types.ts';
import { bestAmmoAgainst, isLowHealth, killsToGo, type KillFeedEntry } from './combatLogic.ts';
import { AMMO_CONFIGS } from '../../shared/rules/ammo.ts';
import { TRANSLATIONS } from '../../shared/data/i18n.ts';

const CLASS_LABEL: Record<string, string> = { scout: 'Scout', medium: 'Medium', heavy: 'Heavy', artillery: 'Artillery', support: 'Support' };
const STATUS_GLYPH: Record<string, string> = { slowed: '🧊', burning: '🔥', stunned: '💫', marked: '🎯', smoked: '☁', boosted: '⚡', repairing: '✚', invulnerable: '🛡', fortified: '⛨' };

/** Red pulsing edge while the own hull is low. */
export const LowHealthVignette: React.FC<{ me: SimEntity | null }> = ({ me }) => {
  if (!me || !isLowHealth(me)) return null;
  return <div className="pointer-events-none absolute inset-0 z-10 low-health-pulse" data-testid="low-health" />;
};

export const KillFeed: React.FC<{ entries: KillFeedEntry[] }> = ({ entries }) => {
  if (!entries.length) return null;
  return (
    <div className="hud-scale pointer-events-none flex flex-col items-center gap-1 max-w-full" data-testid="kill-feed" data-hud="killfeed">
      {entries.slice(-4).map((e) => <div key={`${e.id}-${e.until}`} className={`rounded px-2 py-0.5 text-[11px] bg-slate-950/75 border whitespace-nowrap overflow-hidden text-ellipsis max-w-full ${e.boss ? 'border-amber-500 text-amber-300' : 'border-slate-700 text-slate-200'}`}>{e.text}</div>)}
    </div>
  );
};
