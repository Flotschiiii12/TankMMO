import React from 'react';
import { tr, nm, localizeEntityName } from '../i18n.ts';
import type { SimEntity } from '../../shared/types.ts';
import { bestAmmoAgainst, isLowHealth, killsToGo, type KillFeedEntry } from './combatLogic.ts';
import { AMMO_CONFIGS } from '../../shared/rules/ammo.ts';
import { TRANSLATIONS } from '../../shared/data/i18n.ts';

const CLASS_LABEL: Record<string, string> = { scout: 'Scout', medium: 'Medium', heavy: 'Heavy', artillery: 'Artillery', support: 'Support' };
const STATUS_GLYPH: Record<string, string> = { slowed: '🧊', burning: '🔥', stunned: '💫', marked: '🎯', smoked: '☁', boosted: '⚡', repairing: '✚', invulnerable: '🛡', fortified: '⛨' };

/** Compact panel for the locked target: name, level, class, bars, statuses, best ammo and an estimate of the kill. */
export const TargetPanel: React.FC<{ target: SimEntity | null; me: SimEntity | null; ammo: Record<string, number>; colorBlind?: boolean }> = ({ target, me, ammo, colorBlind }) => {
  if (!target || !me || target.hull <= 0) return null;
  const best = bestAmmoAgainst(target, ammo as any);
  const ttk = killsToGo(target, me);
  const label = target.vehicleClass ? tr(CLASS_LABEL[target.vehicleClass] ?? target.vehicleClass) : target.archetypeId ? tr(String(target.kind).replace(/_/g, ' ')) : tr(String(target.kind).replace(/_/g, ' '));
  const hostile = target.isHostile;
  const hullColor = hostile ? (colorBlind ? '#f59e0b' : '#ef4444') : (colorBlind ? '#38bdf8' : '#22c55e');
  const pct = (v: number, m: number) => `${Math.max(0, Math.min(100, (v / Math.max(1, m)) * 100))}%`;
  const ammoKey = AMMO_CONFIGS[best.ammo]?.nameKey ?? '';
  const ammoName = nm(ammoKey, TRANSLATIONS.en[ammoKey] ?? String(best.ammo));
  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 hud-scale pointer-events-none" data-testid="target-panel">
      <div className="min-w-[210px] max-w-[260px] rounded-lg border border-slate-700 bg-slate-950/80 px-2.5 py-1.5 text-[11px] text-slate-200">
        <div className="flex items-baseline justify-between gap-2">
          <b className="truncate text-white">{target.kind === 'player' ? target.name : localizeEntityName(target.name)}</b>
          <span className="text-slate-400 whitespace-nowrap">Lv {target.level}{target.isElite ? ` · ${tr('Elite')}` : ''}</span>
        </div>
        <div className="text-[11px] text-slate-400">{label}</div>
        <div className="mt-1 h-1.5 rounded bg-slate-800 overflow-hidden"><div className="h-full" style={{ width: pct(target.armor, target.maxArmor), background: '#38bdf8' }} /></div>
        <div className="mt-0.5 h-1.5 rounded bg-slate-800 overflow-hidden"><div className="h-full" style={{ width: pct(target.hull, target.maxHull), background: hullColor }} /></div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
          <span>{target.statusEffects.map((s) => STATUS_GLYPH[s.type] ?? '•').join(' ') || ' '}</span>
          <span>{tr('best ammo')}: <b className="text-slate-200">{ammoName}</b>{best.multiplier !== 1 ? ` ×${best.multiplier}` : ''}</span>
        </div>
        <div className="text-[11px] text-slate-400">{tr('about {n} shots (~{s} s)', { n: ttk.shots, s: ttk.seconds })}</div>
      </div>
    </div>
  );
};

/** Red pulsing edge while the own hull is low. */
export const LowHealthVignette: React.FC<{ me: SimEntity | null }> = ({ me }) => {
  if (!me || !isLowHealth(me)) return null;
  return <div className="pointer-events-none absolute inset-0 z-10 low-health-pulse" data-testid="low-health" />;
};

export const KillFeed: React.FC<{ entries: KillFeedEntry[] }> = ({ entries }) => {
  if (!entries.length) return null;
  return (
    <div className="absolute top-24 right-3 z-20 hud-scale pointer-events-none flex flex-col items-end gap-1" data-testid="kill-feed">
      {entries.slice(-4).map((e) => <div key={`${e.id}-${e.until}`} className={`rounded px-2 py-0.5 text-[11px] bg-slate-950/75 border ${e.boss ? 'border-amber-500 text-amber-300' : 'border-slate-700 text-slate-200'}`}>{e.text}</div>)}
    </div>
  );
};
