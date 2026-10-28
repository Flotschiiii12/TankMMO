import React, { useCallback, useEffect, useState } from 'react';
import { tr } from '../../i18n.ts';
import type { OnlineGameClient } from '../../net/onlineClient.ts';
import { errorText } from '../../game/actions.ts';
import { FactionCrest } from '../GameIcon.tsx';
import { Button } from '../kit/Button.tsx';
import { Badge } from '../kit/Indicators.tsx';
import { EmptyState, SkeletonRows } from '../kit/States.tsx';
import { windows } from '../wm/windowStore.ts';
import { profileIntent } from './chat.ts';

interface Nearby { name: string; level: number; faction: string; clanTag: string | null; inParty: boolean; sameParty: boolean; friend: boolean }
type Say = (m: string) => void;

/** Party panel (members, leader actions, invites you received) and the party finder: players on your map who are not in a party yet. */
export const PartyTab: React.FC<{ client: OnlineGameClient; say: Say; myName: string }> = ({ client, say, myName }) => {
  const [party, setParty] = useState<{ leader: string; members: Array<{ name: string; level: number }> } | null | undefined>(undefined); const [near, setNear] = useState<Nearby[] | null>(null);
  const [invites, setInvites] = useState<string[]>([]); const [levelWindow, setLevelWindow] = useState(false);
  const load = useCallback(async () => { const [p, n] = await Promise.all([client.social({ op: 'party_info' }), client.social({ op: 'players_nearby' })]); setParty(p.ok ? p.data : null); setNear(n.ok && Array.isArray(n.data) ? n.data : []); }, [client]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 8000); return () => clearInterval(t); }, [load]);
  useEffect(() => client.onSocialEvent((kind, d) => { if (kind === 'party_invite' && d?.from) setInvites((l) => [...new Set([...l, d.from])]); if (kind === 'party_update') void load(); }), [client, load]);
  const call = async (req: Parameters<OnlineGameClient['social']>[0], ok?: string) => { const r = await client.social(req); say(r.ok ? (ok ? tr(ok) : '') : errorText(r.error || 'failed')); void load(); return r; };
  const leader = party?.leader === myName; const me = party?.members.find((m) => m.name === myName);
  const finder = (near ?? []).filter((p) => !p.inParty && (!levelWindow || !me || Math.abs(p.level - me.level) <= 5)).sort((a, b) => Number(b.friend) - Number(a.friend) || b.level - a.level);
  const rowStyle = { background: 'var(--c-bg-1)', border: '1px solid var(--c-line)' };
  return (
    <div className="grid gap-3" data-testid="party">
      {invites.map((from) => <div key={from} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-line)' }}><b className="flex-1">{tr('{from} invited you to a party', { from })}</b><Button variant="primary" onClick={async () => { await call({ op: 'party_accept', name: from }, 'Joined the party'); setInvites((l) => l.filter((x) => x !== from)); }}>{tr('Join')}</Button><Button variant="ghost" onClick={() => setInvites((l) => l.filter((x) => x !== from))}>{tr('Ignore')}</Button></div>)}
      <section className="grid gap-1.5" aria-label={tr('Your party')}>
        <div className="flex items-center justify-between"><b>{tr('Your party')}</b>{party && <span className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{party.members.length}/5 · {tr('shared XP +10 % per extra member')}</span>}</div>
        {party === undefined ? <SkeletonRows rows={2} h={44} /> : !party ? <EmptyState icon="🛡" title={tr('Not in a party')} text={tr('Invite someone from the finder below or from your friends (up to 5 players).')} /> : (
          <>
            {party.members.map((m) => <div key={m.name} className="flex items-center gap-2 p-2 rounded-lg" style={rowStyle}><b className="flex-1 truncate">{m.name === party.leader ? '👑 ' : ''}{m.name}</b><span className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>Lv {m.level}</span>{leader && m.name !== myName && <Button variant="ghost" onClick={() => void call({ op: 'party_kick', name: m.name })}>{tr('Kick')}</Button>}</div>)}
            <Button variant="danger" onClick={() => void call({ op: 'party_leave' })}>{tr('Leave party')}</Button>
          </>
        )}
      </section>
      <section className="grid gap-1.5" aria-label={tr('Party finder')}>
        <div className="flex items-center justify-between gap-2 flex-wrap"><b>{tr('Party finder')} <span className="text-[12px] font-normal" style={{ color: 'var(--c-text-3)' }}>{tr('players on your map without a party')}</span></b><div className="flex gap-2"><Button pressed={levelWindow} onClick={() => setLevelWindow((v) => !v)}>{tr('Similar level')}</Button><Button variant="ghost" onClick={() => void load()}>{tr('Refresh')}</Button></div></div>
        {near === null ? <SkeletonRows rows={3} h={44} /> : finder.length === 0 ? <EmptyState icon="🔎" title={tr('Nobody to invite right now')} text={tr('Try again later or change the map.')} /> : finder.map((p) => (
          <div key={p.name} className="flex items-center gap-2 p-2 rounded-lg flex-wrap" style={rowStyle}>
            <FactionCrest faction={p.faction} size={18} /><b className="flex-1 min-w-[6rem] truncate">{p.name}</b>{p.clanTag && <Badge>[{p.clanTag}]</Badge>}{p.friend && <Badge tone="good">{tr('friend')}</Badge>}<span className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>Lv {p.level}</span>
            <Button onClick={() => { profileIntent.set(p.name); windows.open('profile'); }}>{tr('Profile')}</Button><Button variant="primary" disabled={!!party && !leader} onClick={() => void call({ op: 'party_invite', name: p.name }, 'Party invite sent')}>{tr('Invite')}</Button>
          </div>
        ))}
      </section>
    </div>
  );
};
