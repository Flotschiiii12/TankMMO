import React, { useCallback, useEffect, useState } from 'react';
import { X, Users } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine.ts';
import type { OnlineGameClient } from '../net/onlineClient.ts';
import type { SocialOp } from '../../shared/protocol.ts';
import { errorText } from '../game/actions.ts';

type Tab = 'friends' | 'party' | 'clan' | 'ranking';

export const SocialModal: React.FC<{ client: OnlineGameClient; isOpen: boolean; onClose: () => void; notices: string[] }> = ({ client, isOpen, onClose, notices }) => {
  const [tab, setTab] = useState<Tab>('friends');
  const [msg, setMsg] = useState('');
  const [name, setName] = useState('');
  const [data, setData] = useState<any>(null);
  const [clanName, setClanName] = useState('');
  const [clanTag, setClanTag] = useState('');
  const [rankKind, setRankKind] = useState<'level' | 'clans'>('level');

  const call = useCallback(async (req: SocialOp, refresh = true) => {
    soundEngine.playUIClick();
    const r = await client.social(req);
    setMsg(r.ok ? '' : errorText(r.error || 'failed'));
    if (r.ok && refresh) void load();
    return r;
  }, [client]);

  const load = useCallback(async () => {
    const req: SocialOp = tab === 'friends' ? { op: 'friend_list' } : tab === 'party' ? { op: 'party_info' } : tab === 'clan' ? { op: 'clan_info' } : { op: 'ranking', kind: rankKind };
    const r = await client.social(req);
    setData(r.ok ? r.data : tab === 'clan' ? { none: true, invites: (await client.social({ op: 'clan_invites' })).data ?? [] } : null);
  }, [client, tab, rankKind]);

  useEffect(() => { if (isOpen) void load(); }, [isOpen, load, notices.length]);
  if (!isOpen) return null;

  const row = 'flex items-center justify-between p-2 rounded border border-slate-800 bg-slate-950/40 text-xs';
  const btn = 'px-2 py-1 rounded bg-orange-600/80 text-white text-xs';
  const ghost = 'px-2 py-1 rounded border border-slate-700 text-slate-300 text-xs';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl max-h-[94vh] flex flex-col p-4 text-slate-200 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2"><Users className="text-orange-500" size={18} /><h3 className="font-semibold text-white text-sm">Social</h3></div>
          <button onClick={() => { soundEngine.playUIClick(); onClose(); }} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="flex gap-2 mt-2 text-xs items-center">
          {(['friends', 'party', 'clan', 'ranking'] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 rounded capitalize ${tab === t ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>{t}</button>)}
          {msg && <span className="ml-auto text-[11px] text-orange-300">{msg}</span>}
        </div>
        {notices.length > 0 && <div className="mt-2 text-[11px] text-emerald-300">{notices.slice(-2).join(' · ')}</div>}

        <div className="mt-2 overflow-y-auto space-y-1.5 pr-1">
          {tab === 'friends' && (
            <>
              <div className="flex gap-1.5"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player name" className="flex-1 px-2 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs" /><button className={btn} onClick={() => call({ op: 'friend_request', name })}>Add friend</button><button className={ghost} onClick={() => call({ op: 'party_invite', name }, false)}>Invite to party</button></div>
              {(data ?? []).map((f: any) => (
                <div key={f.id} className={row}>
                  <span><b className="text-white">{f.name}</b> <span className="text-slate-500">{f.status === 'accepted' ? (f.online ? 'online' : 'offline') : f.status}</span></span>
                  <span className="flex gap-1">
                    {f.status === 'incoming' && <button className={btn} onClick={() => call({ op: 'friend_accept', name: f.name })}>Accept</button>}
                    <button className={ghost} onClick={() => call({ op: 'friend_remove', name: f.name })}>Remove</button>
                    <button className={ghost} onClick={() => call({ op: 'block', name: f.name })}>Block</button>
                  </span>
                </div>
              ))}
              {(data ?? []).length === 0 && <div className="text-xs text-slate-500 p-2">No friends yet.</div>}
            </>
          )}

          {tab === 'party' && (
            data ? (
              <>
                <div className="text-xs text-slate-400">Leader: <b className="text-white">{data.leader}</b> · shared XP +10 % per extra member</div>
                {data.members.map((m: any) => <div key={m.name} className={row}><span><b className="text-white">{m.name}</b> Lv {m.level}</span><span className="flex gap-1"><button className={ghost} onClick={() => call({ op: 'party_kick', name: m.name })}>Kick</button></span></div>)}
                <button className={ghost} onClick={() => call({ op: 'party_leave' })}>Leave party</button>
              </>
            ) : <div className="text-xs text-slate-500 p-2">Not in a party. Invite someone from the Friends tab (up to 5 players).</div>
          )}

          {tab === 'clan' && (
            data && !data.none ? (
              <>
                <div className="text-sm text-white font-semibold">[{data.tag}] {data.name} <span className="text-xs text-slate-400">storage {data.scrap?.toLocaleString()} scrap · you are {data.myRole}</span></div>
                <div className="flex gap-1.5"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Invite player" className="flex-1 px-2 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs" /><button className={btn} onClick={() => call({ op: 'clan_invite', name })}>Invite</button><button className={ghost} onClick={() => call({ op: 'clan_donate', amount: 1000 })}>Donate 1,000</button></div>
                {data.members.map((m: any) => (
                  <div key={m.id} className={row}><span><b className="text-white">{m.name}</b> Lv {m.level} <span className="text-slate-500">{m.role}</span></span>
                    <span className="flex gap-1">{m.role === 'member' && <button className={ghost} onClick={() => call({ op: 'clan_role', name: m.name, role: 'officer' })}>Promote</button>}<button className={ghost} onClick={() => call({ op: 'clan_kick', name: m.name })}>Kick</button></span></div>
                ))}
                <div className="text-[11px] text-slate-500">Log: {(data.log ?? []).slice(0, 5).map((l: any) => `${l.actor}: ${l.text}`).join(' | ')}</div>
                <button className={ghost} onClick={() => call({ op: 'clan_leave' })}>Leave clan</button>
              </>
            ) : (
              <>
                <div className="text-xs text-slate-400">Create a clan (10,000 scrap) or accept an invite.</div>
                <div className="flex gap-1.5"><input value={clanName} onChange={(e) => setClanName(e.target.value)} placeholder="Clan name" className="flex-1 px-2 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs" /><input value={clanTag} onChange={(e) => setClanTag(e.target.value)} placeholder="TAG" className="w-16 px-2 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs" /><button className={btn} onClick={() => call({ op: 'clan_create', name: clanName, tag: clanTag })}>Create</button></div>
                {(data?.invites ?? []).map((i: any) => <div key={i.clanId} className={row}><span>[{i.tag}] {i.name}</span><button className={btn} onClick={() => call({ op: 'clan_accept', clanId: i.clanId })}>Join</button></div>)}
              </>
            )
          )}

          {tab === 'ranking' && (
            <>
              <div className="flex gap-1.5">{(['level', 'clans'] as const).map((k) => <button key={k} onClick={() => setRankKind(k)} className={`px-2 py-1 rounded text-xs ${rankKind === k ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>{k}</button>)}</div>
              {(data ?? []).map((r: any, i: number) => <div key={i} className={row}><span>#{i + 1} <b className="text-white">{r.name}{r.tag ? ` [${r.tag}]` : ''}</b></span><span className="text-slate-400">{r.level ? `Lv ${r.level}` : `${r.members} members · ${r.totalLevel} levels`}</span></div>)}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
