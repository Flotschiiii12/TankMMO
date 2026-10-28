import React from 'react';
import { tr } from '../i18n.ts';
import type { SimEntity } from '../sim/types.ts';

/** Center-top announcement (events, waves, arena rounds). */
export const Banner: React.FC<{ text: string | null }> = ({ text }) =>
  text ? (
    <div data-hud="banner" className="absolute top-14 left-1/2 -translate-x-1/2 z-30 pointer-events-none px-5 py-2 rounded-lg bg-slate-950/85 border border-orange-500/60 text-orange-200 text-sm font-semibold tracking-wide shadow-lg">{text}</div>
  ) : null;

/** Health bar of the nearest boss within 1600 units. */
export const BossBar: React.FC<{ player: SimEntity | null; entities: SimEntity[] }> = ({ player, entities }) => {
  if (!player) return null;
  let boss: SimEntity | undefined;
  let best = 1600;
  for (const e of entities) {
    if (e.kind !== 'boss' || e.hull <= 0) continue;
    const d = Math.hypot(e.pos.x - player.pos.x, e.pos.y - player.pos.y);
    if (d < best) { best = d; boss = e; }
  }
  if (!boss) return null;
  const pct = Math.max(0, Math.min(100, (boss.hull / boss.maxHull) * 100));
  const armorPct = boss.maxArmor > 0 ? Math.max(0, Math.min(100, (boss.armor / boss.maxArmor) * 100)) : 0;
  return (
    <div data-hud="banner" className="absolute top-24 left-1/2 -translate-x-1/2 z-20 pointer-events-none w-[min(520px,60vw)]">
      <div className="text-center text-xs font-semibold text-rose-200 mb-0.5">{boss.name}{boss.isWorldBoss ? ` · ${tr('World Boss')}` : ''} {boss.bossPhase ? `· ${tr('Phase')} ${boss.bossPhase}` : ''}</div>
      <div className="h-3 rounded bg-slate-900/80 border border-slate-700 overflow-hidden"><div className="h-full bg-rose-600" style={{ width: `${pct}%` }} /></div>
      <div className="h-1 mt-0.5 rounded bg-slate-900/80 overflow-hidden"><div className="h-full bg-sky-500" style={{ width: `${armorPct}%` }} /></div>
    </div>
  );
};

/** Persistent gate-wave / arena-round indicator under the top bar. */
export const ProgressChip: React.FC<{ text: string | null }> = ({ text }) =>
  text ? (
    <div data-hud="banner" className="absolute top-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none px-3 py-1 rounded bg-slate-950/80 border border-slate-600 text-slate-200 text-xs font-semibold">{text}</div>
  ) : null;
