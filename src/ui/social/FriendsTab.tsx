import React, { useCallback, useEffect, useState } from 'react';
import { tr } from '../../i18n.ts';
import type { OnlineGameClient } from '../../net/onlineClient.ts';
import { errorText } from '../../game/actions.ts';
import { Button } from '../kit/Button.tsx';
import { EmptyState, SkeletonRows } from '../kit/States.tsx';
import { Badge } from '../kit/Indicators.tsx';
import { windows } from '../wm/windowStore.ts';
import { chatIntent, profileIntent } from './chat.ts';

export interface Friend { id: string; name: string; status: 'accepted' | 'incoming' | 'outgoing' | string; online?: boolean }
type Say = (m: string) => void;

/** Friends: requests first, online friends before offline ones, presence dot, quick actions (whisper, invite, profile, more). */
export const FriendsTab: React.FC<{ client: OnlineGameClient; say: Say }> = ({ client, say }) => {
  const [list, setList] = useState<Friend[] | null>(null); const [blocked, setBlocked] = useState<string[]>([]); const [name, setName] = useState('');
  const load = useCallback(async () => {
    const [f, b] = await Promise.all([client.social({ op: 'friend_list' }), client.social({ op: 'block_list' })]);
    setList(f.ok && Array.isArray(f.data) ? f.data : []); setBlocked(b.ok && Array.isArray(b.data) ? b.data.map((x: string | { name: string }) => (typeof x === 'string' ? x : x.name)) : []);
  }, [client]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 15000); return () => clearInterval(t); }, [load]);
  const call = async (req: Parameters<OnlineGameClient['social']>[0], ok?: string) => { const r = await client.social(req); say(r.ok ? (ok ? tr(ok) : '') : errorText(r.error || 'failed')); void load(); return r; };
  const incoming = (list ?? []).filter((f) => f.status === 'incoming'); const outgoing = (list ?? []).filter((f) => f.status === 'outgoing');
  const friends = (list ?? []).filter((f) => f.status === 'accepted').sort((a, b) => Number(!!b.online) - Number(!!a.online) || a.name.localeCompare(b.name));
  const section = (title: string, n: number, children: React.ReactNode) => n > 0 && <div className="grid gap-1"><div className="text-[12px] font-semibold" style={{ color: 'var(--c-text-2)' }}>{title} ({n})</div>{children}</div>;
  const row = 'flex items-center gap-2 p-2 rounded-lg flex-wrap';
  const rowStyle = { background: 'var(--c-bg-1)', border: '1px solid var(--c-line)' };
  return (
    <div className="grid gap-3" data-testid="friends">
      <div className="flex gap-2"><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { void call({ op: 'friend_request', name: name.trim() }, 'Friend request sent'); setName(''); } }} placeholder={tr('Player name')} aria-label={tr('Player name')} className="k-field flex-1" /><Button variant="primary" disabled={!name.trim()} onClick={() => { void call({ op: 'friend_request', name: name.trim() }, 'Friend request sent'); setName(''); }}>{tr('Add friend')}</Button></div>
      {list === null ? <SkeletonRows rows={3} h={52} /> : list.length === 0 && blocked.length === 0 ? <EmptyState icon="👥" title={tr('No friends yet')} text={tr('Add players by name, or use the sender menu in the chat.')} /> : (
        <>
          {section(tr('Requests'), incoming.length, incoming.map((f) => <div key={f.id} className={row} style={rowStyle}><b className="flex-1">{f.name}</b><Button variant="primary" onClick={() => void call({ op: 'friend_accept', name: f.name }, 'Friend added')}>{tr('Accept')}</Button><Button variant="ghost" onClick={() => void call({ op: 'friend_remove', name: f.name })}>{tr('Decline')}</Button></div>))}
          {section(tr('Friends'), friends.length, friends.map((f) => (
            <div key={f.id} className={row} style={rowStyle} data-presence={f.online ? 'online' : 'offline'}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 99, background: f.online ? 'var(--c-good)' : 'var(--c-line-strong)' }} /><b className="flex-1 min-w-[6rem] truncate">{f.name}</b><span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>{f.online ? tr('online') : tr('offline')}</span>
              <Button onClick={() => { chatIntent.set('W', f.name); }} disabled={!f.online}>{tr('Whisper')}</Button>
              <Button onClick={() => void call({ op: 'party_invite', name: f.name }, 'Party invite sent')} disabled={!f.online}>{tr('Invite')}</Button>
              <Button onClick={() => { profileIntent.set(f.name); windows.open('profile'); }}>{tr('Profile')}</Button>
              <details className="relative"><summary className="k-btn k-btn--ghost list-none" style={{ cursor: 'pointer' }} aria-label={tr('More')}>⋯</summary><div className="absolute right-0 z-10 grid p-1 rounded-lg" style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-line-strong)', minWidth: 130 }}><Button variant="ghost" onClick={() => void call({ op: 'friend_remove', name: f.name })}>{tr('Remove')}</Button><Button variant="ghost" onClick={() => void call({ op: 'block', name: f.name })}>{tr('Block')}</Button></div></details>
            </div>
          )))}
          {section(tr('Sent requests'), outgoing.length, outgoing.map((f) => <div key={f.id} className={row} style={rowStyle}><b className="flex-1">{f.name}</b><Badge>{tr('pending')}</Badge><Button variant="ghost" onClick={() => void call({ op: 'friend_remove', name: f.name })}>{tr('Cancel')}</Button></div>))}
          {section(tr('Blocked'), blocked.length, blocked.map((n) => <div key={n} className={row} style={rowStyle}><b className="flex-1">{n}</b><Button variant="ghost" onClick={() => void call({ op: 'unblock', name: n }, 'Unblocked')}>{tr('Unblock')}</Button></div>))}
        </>
      )}
    </div>
  );
};
