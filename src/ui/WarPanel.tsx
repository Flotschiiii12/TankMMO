import React, { useCallback, useEffect, useState } from 'react';
import { tr } from '../i18n.ts';
import type { OnlineGameClient } from '../net/onlineClient.ts';
import { errorText } from '../game/actions.ts';
import { FactionCrest } from './GameIcon.tsx';

const FACTIONS = ['coastal', 'highland', 'steppe'] as const;
const NAME: Record<string, string> = { coastal: 'Coastal Union', highland: 'Highland Union', steppe: 'Steppe Caravan' };
export const FACTION_COLOR: Record<string, string> = { coastal: '#38bdf8', highland: '#4ade80', steppe: '#fbbf24' };
const fmtLeft = (sec: number): string => { const d = Math.floor(sec / 86400); const h = Math.floor((sec % 86400) / 3600); return d > 0 ? `${d} d ${h} h` : `${h} h ${Math.floor((sec % 3600) / 60)} min`; };

/** Faction war screen: weekly scores, time left, last winner and its reward, control points on this map, and the PvP rules in plain language. */
export const WarPanel: React.FC<{ client: OnlineGameClient }> = ({ client }) => {
  const [d, setD] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => { const r = await client.social({ op: 'war_status' }); if (r.ok) setD(r.data); }, [client]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 3000); return () => clearInterval(t); }, [load]);
  if (!d) return null;
  const max = Math.max(1, ...FACTIONS.map((f) => d.scores[f] ?? 0));
  const claim = async () => { const r = await client.social({ op: 'war_claim' }); setMsg(r.ok ? tr('Reward claimed: +{scrap} scrap, +{marks} season marks', { scrap: r.data.scrap, marks: r.data.seasonMarks }) : errorText(r.error || 'failed')); void load(); };
  const last = d.last;
  return (
    <div className="space-y-2" data-testid="war-panel">
      <div className="text-xs text-slate-300">{tr('War week ends in')} <b className="text-white">{fmtLeft(d.weekEndsInSeconds)}</b>. {tr('Hold control points on the war maps (zones 21 - 24); every second a point is owned scores for its faction.')}</div>
      {FACTIONS.map((f) => (
        <div key={f} className="flex items-center gap-2 text-xs">
          <FactionCrest faction={f} size={24} />
          <span className="w-28 truncate" style={{ color: FACTION_COLOR[f] }}>{tr(NAME[f])}{d.myFaction === f ? ` (${tr('you')})` : ''}</span>
          <div className="flex-1 h-2.5 rounded bg-slate-800 overflow-hidden"><div className="h-full" style={{ width: `${((d.scores[f] ?? 0) / max) * 100}%`, background: FACTION_COLOR[f] }} /></div>
          <span className="tabular-nums w-14 text-right text-slate-300">{Math.round(d.scores[f] ?? 0)}</span>
        </div>
      ))}
      {d.points?.length > 0 && (
        <div className="rounded-lg border border-slate-800 p-2 space-y-1">
          <div className="text-[11px] font-semibold text-amber-300">{tr('Control points on this map')}</div>
          {d.points.map((p: any, i: number) => (
            <div key={p.id} className="flex items-center gap-2 text-[11px]">
              <span className="w-16">{tr('Point')} {i + 1}</span>
              <span className="w-24" style={{ color: p.owner ? FACTION_COLOR[p.owner] : '#94a3b8' }}>{p.owner ? tr(NAME[p.owner]) : tr('neutral')}</span>
              <div className="flex-1 h-1.5 rounded bg-slate-800 overflow-hidden flex">{FACTIONS.map((f) => <div key={f} style={{ width: `${p.progress[f] / 3}%`, background: FACTION_COLOR[f] }} />)}</div>
              {p.contested && <span className="text-rose-300">{tr('contested')}</span>}
            </div>
          ))}
        </div>
      )}
      <div className="rounded-lg border border-slate-800 p-2 text-xs">
        <div className="font-semibold text-white">{tr('Last week')}: {last.winner ? <span style={{ color: FACTION_COLOR[last.winner] }}>{tr(NAME[last.winner])}</span> : tr('no winner')}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">{tr('The winning faction gets {pct} % cheaper market tax for a week, and everyone who fought for it for {min} minutes can claim {scrap} scrap, {marks} season marks and the title "{title}" once.', { pct: Math.round(d.reward.marketDiscount * 100), min: Math.round(last.neededSeconds / 60), scrap: d.reward.scrap, marks: d.reward.seasonMarks, title: d.reward.title })}</div>
        {last.winner === d.myFaction && <div className="mt-1 text-[11px] text-slate-300">{tr('Your contribution')}: {Math.floor(last.mySeconds / 60)} / {Math.round(last.neededSeconds / 60)} min</div>}
        <div className="mt-1 flex items-center gap-2">
          <button disabled={!last.canClaim} onClick={claim} className={`px-3 py-1 rounded text-xs font-semibold ${last.canClaim ? 'bg-orange-600/90 text-white' : 'bg-slate-800 text-slate-500'}`}>{last.claimed ? tr('Claimed') : tr('Claim reward')}</button>
          {msg && <span className="text-[11px] text-orange-300">{msg}</span>}
        </div>
      </div>
      <div className="rounded-lg border border-slate-800 p-2 text-[11px] text-slate-300 space-y-0.5" data-testid="pvp-rules">
        <div className="font-semibold text-white">{tr('Fair fight rules')}</div>
        <div>• {tr('PvP starts at level {n}.', { n: d.rules.minLevel })}</div>
        <div>• {tr('You can only fight players up to {n} levels above or below you.', { n: d.rules.levelWindow })}</div>
        <div>• {tr('Player damage is reduced to {n} % so fights last longer.', { n: d.rules.damagePercent })}</div>
        <div>• {tr('After {n} kills of the same player within {m} minutes you cannot hit them for {h} minutes.', { n: d.rules.killCap, m: d.rules.killCapWindowMin, h: d.rules.immunityMin })}</div>
        <div>• {tr('Honor for the same player is paid once every {n} minutes.', { n: d.rules.honorRepeatMin })}</div>
        <div>• {tr('A point takes about {n} seconds to capture with nobody contesting.', { n: d.rules.captureSeconds })}</div>
      </div>
    </div>
  );
};
