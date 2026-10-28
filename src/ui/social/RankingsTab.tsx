import React, { useEffect, useState } from 'react';
import { tr } from '../../i18n.ts';
import type { OnlineGameClient } from '../../net/onlineClient.ts';
import { ClanEmblemBadge } from '../GameIcon.tsx';
import { EmptyState, SkeletonRows } from '../kit/States.tsx';
import { SegmentedControl } from '../kit/Tabs.tsx';
import { windows } from '../wm/windowStore.ts';
import { profileIntent } from './chat.ts';

type Kind = 'level' | 'clans' | 'honor' | 'arena_1v1' | 'arena_3v3' | 'arena_5v5';
const KINDS: Array<[Kind, string]> = [['level', 'Level'], ['clans', 'Clans'], ['honor', 'Honor'], ['arena_1v1', 'Arena 1v1'], ['arena_3v3', 'Arena 3v3'], ['arena_5v5', 'Arena 5v5']];
const valueOf = (kind: Kind, r: any): string => (kind === 'level' ? `Lv ${r.level}` : kind === 'clans' ? `${r.members} · Σ Lv ${r.totalLevel}` : kind === 'honor' ? `${r.honor?.toLocaleString()}` : `${r.rating} · ${r.wins}W/${r.losses}L`);
const myValue = (kind: Kind, v: number): string => (kind === 'level' ? `Lv ${v}` : kind === 'clans' ? `Σ Lv ${v}` : String(v));

/** Leaderboards (top 20) with your own position row underneath and season notes. */
export const RankingsTab: React.FC<{ client: OnlineGameClient; myName: string }> = ({ client, myName }) => {
  const [kind, setKind] = useState<Kind>('level'); const [rows, setRows] = useState<any[] | null>(null); const [me, setMe] = useState<{ rank: number; total: number; value: number } | null>(null);
  useEffect(() => {
    let dead = false; setRows(null); setMe(null);
    void Promise.all([client.social({ op: 'ranking', kind }), client.social({ op: 'ranking_me', kind })]).then(([r, m]) => { if (dead) return; setRows(r.ok && Array.isArray(r.data) ? r.data : []); setMe(m.ok ? m.data : null); });
    return () => { dead = true; };
  }, [client, kind]);
  const inTop = (rows ?? []).some((r) => r.name === myName);
  return (
    <div className="grid gap-2" data-testid="rankings">
      <div className="overflow-x-auto"><SegmentedControl label={tr('Ranking')} value={kind} onChange={(v) => setKind(v as Kind)} options={KINDS.map(([k, l]) => ({ id: k, label: tr(l) }))} /></div>
      {(kind === 'honor' || kind.startsWith('arena')) && <div className="text-[12px]" style={{ color: 'var(--c-text-3)' }}>{kind === 'honor' ? tr('Honor is earned in PvP on the war maps and never resets.') : tr('Arena season {n}: ratings start at 1000; a new season starts from scratch.', { n: 1 })}</div>}
      {rows === null ? <SkeletonRows rows={6} h={40} /> : rows.length === 0 ? <EmptyState icon="🏁" title={tr('Nobody is ranked yet')} /> : (
        <ol className="grid gap-1" aria-label={tr('Ranking')}>
          {rows.map((r, i) => { const mine = r.name === myName; return (
            <li key={i} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: mine ? 'var(--accent-soft)' : 'var(--c-bg-1)', border: `1px solid ${mine ? 'var(--accent-line)' : 'var(--c-line)'}` }}>
              <b className="w-8 tabular-nums" style={{ color: i < 3 ? 'var(--r-legendary)' : 'var(--c-text-2)' }}>#{i + 1}</b>
              {r.emblem && <ClanEmblemBadge emblem={r.emblem} size={18} />}
              {kind === 'clans' ? <b className="flex-1 truncate">{r.name} [{r.tag}]</b> : <button type="button" className="flex-1 text-left font-semibold truncate min-h-[28px]" data-compact onClick={() => { profileIntent.set(r.name); windows.open('profile'); }}>{r.name}</button>}
              <span className="text-[12px] tabular-nums" style={{ color: 'var(--c-text-2)' }}>{valueOf(kind, r)}</span>
            </li>); })}
        </ol>
      )}
      {rows !== null && (me
        ? <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-line)' }} data-testid="my-rank"><b className="w-12 tabular-nums">#{me.rank}</b><b className="flex-1">{inTop ? tr('You are in the top 20') : tr('Your position')}</b><span className="text-[12px] tabular-nums">{myValue(kind, me.value)} · {tr('of {n}', { n: me.total })}</span></div>
        : <div className="text-[12px]" data-testid="my-rank" style={{ color: 'var(--c-text-3)' }}>{kind === 'clans' ? tr('You are not in a clan.') : kind === 'honor' ? tr('Earn honor in PvP to appear here.') : kind.startsWith('arena') ? tr('Play a match to get a rating.') : tr('Not ranked yet.')}</div>)}
    </div>
  );
};
