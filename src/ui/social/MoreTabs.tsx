import React, { useCallback, useEffect, useState } from 'react';
import { tr, nm } from '../../i18n.ts';
import type { OnlineGameClient } from '../../net/onlineClient.ts';
import type { CharacterState } from '../../../shared/rules/character.ts';
import { DUNGEONS } from '../../../shared/data/dungeons.ts';
import { getRankForHonor } from '../../../shared/data/ranks.ts';
import { errorText } from '../../game/actions.ts';
import { CurrencyIcon, FactionCrest, RankBadge } from '../GameIcon.tsx';
import { SpectateList } from '../SpectateList.tsx';
import { Button } from '../kit/Button.tsx';
import { Badge } from '../kit/Indicators.tsx';
import { EmptyState, SkeletonRows } from '../kit/States.tsx';
import { SegmentedControl } from '../kit/Tabs.tsx';
import { windows } from '../wm/windowStore.ts';
import { careerIntent } from '../career/careerIntent.ts';
import { profileIntent } from './chat.ts';

type Say = (m: string) => void; type Op = Parameters<OnlineGameClient['social']>[0];
const rowStyle = { background: 'var(--c-bg-1)', border: '1px solid var(--c-line)' };
function useOp<T>(client: OnlineGameClient, req: Op, say: Say) {
  const [data, setData] = useState<T | null>(null);
  const load = useCallback(async () => { const r = await client.social(req); if (r.ok) setData(r.data as T); }, [client]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);
  const call = async (r: Op) => { const res = await client.social(r); say(res.ok ? '' : errorText(res.error || 'failed')); void load(); return res; };
  return { data, load, call };
}

export const ArenaTab: React.FC<{ client: OnlineGameClient; say: Say; onWatch: () => void }> = ({ client, say, onWatch }) => {
  const { data, call } = useOp<any>(client, { op: 'arena_status' }, say); const [mode, setMode] = useState<'1v1' | '3v3' | '5v5'>('1v1');
  if (!data) return <SkeletonRows rows={3} h={52} />;
  return (
    <div className="grid gap-2" data-testid="arena">
      <div className="text-[13px]">{tr('Your vehicle power')} <b style={{ color: 'var(--accent-2)' }}>{data.power}</b> → {tr('league')} <b className="capitalize">{data.league}</b>. <span style={{ color: 'var(--c-text-2)' }}>{tr('Everyone fights with their own vehicle and gear.')}</span></div>
      {Object.entries(data.ratings).map(([m, r]: any) => <div key={m} className="flex items-center gap-2 p-2 rounded-lg" style={rowStyle}><b className="flex-1">{m}</b><span className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{tr('rating')} {r.rating} · {r.wins}W/{r.losses}L</span></div>)}
      {data.banMinutes > 0 && <div className="text-[12px]" style={{ color: 'var(--c-bad)' }}>{tr('Queue ban')}: {data.banMinutes} min ({tr('left a match early')})</div>}
      <div className="flex gap-2 items-center flex-wrap"><SegmentedControl label={tr('Mode')} value={mode} onChange={(v) => setMode(v as typeof mode)} options={['1v1', '3v3', '5v5'].map((m) => ({ id: m, label: m }))} />{data.queued ? <Button onClick={() => void call({ op: 'arena_leave' })}>{tr('Leave queue')} ({data.queued})</Button> : <Button variant="primary" onClick={() => void call({ op: 'arena_queue', mode })}>{tr('Queue')}</Button>}</div>
      <SpectateList client={client} onWatch={onWatch} />
    </div>
  );
};

export const GatesTab: React.FC<{ client: OnlineGameClient; say: Say }> = ({ client, say }) => {
  const { data, call } = useOp<any>(client, { op: 'dungeon_list' }, say);
  if (!data) return <SkeletonRows rows={3} h={52} />;
  return (
    <div className="grid gap-2" data-testid="gates">
      <div className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{tr('Free keys left today')}: <b style={{ color: 'var(--accent-2)' }}>{data.freeKeysLeft}</b> · {tr('Gate keys')}: <b>{data.gateKeys}</b>. {tr('Parties (up to 5) enter together; enemies scale with party size. 15 minute limit.')}</div>
      {data.dungeons.map((d: any) => <div key={d.id} className="flex items-center gap-2 p-2 rounded-lg flex-wrap" style={rowStyle}><div className="flex-1 min-w-0"><b className="block truncate">{nm(DUNGEONS.find((x) => x.id === d.id)?.nameKey, d.name)}</b><span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>Lv {d.minLevel}+ · {d.waves} {tr('waves + boss')}</span></div>{d.cleared && <Badge tone="good">✓ {tr('cleared')}</Badge>}<Button variant="primary" onClick={() => void call({ op: 'dungeon_enter', dungeonId: d.id })}>{tr('Enter')}</Button></div>)}
      <Button variant="ghost" onClick={() => void call({ op: 'dungeon_leave' })}>{tr('Leave current gate')}</Button>
    </div>
  );
};

export const MeTab: React.FC<{ ch: CharacterState; myName: string }> = ({ ch, myName }) => {
  const rank = getRankForHonor(ch.wallet.honor);
  return (
    <div className="grid gap-3" data-testid="me">
      <div className="flex items-center gap-3"><RankBadge level={rank.level} size={64} /><FactionCrest faction={ch.faction} size={44} /><div><b className="text-lg">{myName}</b><div className="text-[12px]" style={{ color: 'var(--c-text-2)' }}><CurrencyIcon kind="honor" /> {tr('Honor')} <b>{ch.wallet.honor.toLocaleString()}</b> · {tr('rank')} {rank.level} / 21 ({nm(rank.nameKey, '')}) · <CurrencyIcon kind="marks" /> {tr('season marks')} <b>{ch.wallet.seasonMarks}</b></div></div></div>
      <div className="flex gap-2 flex-wrap"><Button variant="primary" onClick={() => { profileIntent.set(myName); windows.open('profile'); }}>{tr('My public profile')}</Button><Button onClick={() => { careerIntent.set('achievements'); windows.open('career'); }}>{tr('Achievements')}</Button><Button onClick={() => { careerIntent.set('codex'); windows.open('career'); }}>{tr('Codex')}</Button></div>
      {ch.season.titles.length === 0 ? <EmptyState icon="🎖" title={tr('No titles yet')} text={tr('Titles come from achievements and the season pass.')} /> : <div className="flex gap-1.5 flex-wrap">{ch.season.titles.map((t) => <Badge key={t} tone="accent">{t}</Badge>)}</div>}
    </div>
  );
};
