import React, { useCallback, useEffect, useState } from 'react';
import { tr } from '../i18n.ts';
import { X, Users } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine.ts';
import type { OnlineGameClient } from '../net/onlineClient.ts';
import type { SocialOp } from '../../shared/protocol.ts';
import { describeItem, errorText } from '../game/actions.ts';
import { ITEM_BY_ID } from '../../shared/data/items.ts';
import { priceBandClient } from '../game/priceBand.ts';
import { ACHIEVEMENTS_CATALOG } from '../../shared/data/achievements.ts';
import { RankBadge, FactionCrest, ClanEmblemBadge, CurrencyIcon } from './GameIcon.tsx';
import { CLAN_EMBLEMS } from '../../shared/data/emblems.ts';
import { getRankForHonor } from '../../shared/data/ranks.ts';
import { codexProgress, progressOf } from '../../shared/rules/achievements.ts';

type Tab = 'friends' | 'party' | 'clan' | 'ranking' | 'market' | 'arena' | 'gates' | 'career';

export const SocialModal: React.FC<{ client: OnlineGameClient; isOpen: boolean; onClose: () => void; notices: string[]; character: import('../../shared/rules/character.ts').CharacterState }> = ({ client, isOpen, onClose, notices, character }) => {
  const [sellUid, setSellUid] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [mode, setMode] = useState<'1v1' | '3v3' | '5v5'>('1v1');
  const [tab, setTab] = useState<Tab>('friends');
  const [msg, setMsg] = useState('');
  const [name, setName] = useState('');
  const [rankKind, setRankKind] = useState<'level' | 'clans'>('level');
  const [rawData, setRawData] = useState<{ key: string; value: any } | null>(null);
  const tabKey = `${tab}:${rankKind}`;
  const data = rawData && rawData.key === tabKey ? rawData.value : null; // never render another tab's data
  const setData = (value: any) => setRawData({ key: tabKey, value });
  const [clanName, setClanName] = useState('');
  const [clanTag, setClanTag] = useState('');
  const [clanEmblem, setClanEmblem] = useState('');
  const [pickEmblem, setPickEmblem] = useState(false);

  const call = async (req: SocialOp, refresh = true) => {
    soundEngine.playUIClick();
    const r = await client.social(req);
    setMsg(r.ok ? '' : errorText(r.error || 'failed'));
    if (r.ok && refresh) void load();
    return r;
  };

  const load = useCallback(async () => {
    const req: SocialOp = tab === 'gates' ? { op: 'dungeon_list' } : tab === 'career' ? { op: 'friend_list' } : tab === 'market' ? { op: 'ah_search' } : tab === 'arena' ? { op: 'arena_status' } : tab === 'friends' ? { op: 'friend_list' } : tab === 'party' ? { op: 'party_info' } : tab === 'clan' ? { op: 'clan_info' } : { op: 'ranking', kind: rankKind };
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
          <div className="flex items-center gap-2"><Users className="text-orange-500" size={18} /><h3 className="font-semibold text-white text-sm">{tr('Social')}</h3></div>
          <button onClick={() => { soundEngine.playUIClick(); onClose(); }} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="flex gap-2 mt-2 text-xs items-center">
          {(['friends', 'party', 'clan', 'ranking', 'market', 'arena', 'gates', 'career'] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 rounded capitalize ${tab === t ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>{tr(t)}</button>)}
          {msg && <span className="ml-auto text-[11px] text-orange-300">{msg}</span>}
        </div>
        {notices.length > 0 && <div className="mt-2 text-[11px] text-emerald-300">{notices.slice(-2).join(' · ')}</div>}

        <div className="mt-2 overflow-y-auto space-y-1.5 pr-1">
          {tab === 'friends' && (
            <>
              <div className="flex gap-1.5"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player name" className="flex-1 px-2 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs" /><button className={btn} onClick={() => call({ op: 'friend_request', name })}>{tr('Add friend')}</button><button className={ghost} onClick={() => call({ op: 'party_invite', name }, false)}>{tr('Invite to party')}</button></div>
              {(data ?? []).map((f: any) => (
                <div key={f.id} className={row}>
                  <span><b className="text-white">{f.name}</b> <span className="text-slate-500">{f.status === 'accepted' ? (f.online ? 'online' : 'offline') : f.status}</span></span>
                  <span className="flex gap-1">
                    {f.status === 'incoming' && <button className={btn} onClick={() => call({ op: 'friend_accept', name: f.name })}>{tr('Accept')}</button>}
                    <button className={ghost} onClick={() => call({ op: 'friend_remove', name: f.name })}>{tr('Remove')}</button>
                    <button className={ghost} onClick={() => call({ op: 'block', name: f.name })}>{tr('Block')}</button>
                  </span>
                </div>
              ))}
              {(data ?? []).length === 0 && <div className="text-xs text-slate-500 p-2">{tr('No friends yet.')}</div>}
            </>
          )}

          {tab === 'party' && (
            data ? (
              <>
                <div className="text-xs text-slate-400">Leader: <b className="text-white">{data.leader}</b> · shared XP +10 % per extra member</div>
                {data.members.map((m: any) => <div key={m.name} className={row}><span><b className="text-white">{m.name}</b> Lv {m.level}</span><span className="flex gap-1"><button className={ghost} onClick={() => call({ op: 'party_kick', name: m.name })}>{tr('Kick')}</button></span></div>)}
                <button className={ghost} onClick={() => call({ op: 'party_leave' })}>{tr('Leave party')}</button>
              </>
            ) : <div className="text-xs text-slate-500 p-2">Not in a party. Invite someone from the Friends tab (up to 5 players).</div>
          )}

          {tab === 'clan' && (
            data && !data.none ? (
              <>
                <div className="text-sm text-white font-semibold flex items-center gap-1.5"><ClanEmblemBadge emblem={data.emblem} size={28} />[{data.tag}] {data.name} <span className="text-xs text-slate-400">storage {data.scrap?.toLocaleString()} scrap · you are {data.myRole}</span>{data.myRole !== 'member' && <button className={ghost} onClick={() => setPickEmblem(!pickEmblem)}>{tr('Emblem')}</button>}</div>
                {pickEmblem && <EmblemGrid value={data.emblem ?? ''} onPick={(id) => { setPickEmblem(false); void call({ op: 'clan_emblem', emblem: id }); }} />}
                <div className="flex gap-1.5"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Invite player" className="flex-1 px-2 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs" /><button className={btn} onClick={() => call({ op: 'clan_invite', name })}>{tr('Invite')}</button><button className={ghost} onClick={() => call({ op: 'clan_donate', amount: 1000 })}>{tr('Donate 1,000')}</button></div>
                {data.members.map((m: any) => (
                  <div key={m.id} className={row}><span><b className="text-white">{m.name}</b> Lv {m.level} <span className="text-slate-500">{m.role}</span></span>
                    <span className="flex gap-1">{m.role === 'member' && <button className={ghost} onClick={() => call({ op: 'clan_role', name: m.name, role: 'officer' })}>{tr('Promote')}</button>}<button className={ghost} onClick={() => call({ op: 'clan_kick', name: m.name })}>{tr('Kick')}</button></span></div>
                ))}
                <div className="text-[11px] text-slate-500">Log: {(data.log ?? []).slice(0, 5).map((l: any) => `${l.actor}: ${l.text}`).join(' | ')}</div>
                <button className={ghost} onClick={() => call({ op: 'clan_leave' })}>{tr('Leave clan')}</button>
              </>
            ) : (
              <>
                <div className="text-xs text-slate-400">{tr('Create a clan (10,000 scrap) or accept an invite.')}</div>
                <div className="flex gap-1.5"><input value={clanName} onChange={(e) => setClanName(e.target.value)} placeholder="Clan name" className="flex-1 px-2 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs" /><input value={clanTag} onChange={(e) => setClanTag(e.target.value)} placeholder="TAG" className="w-16 px-2 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs" /><button className={btn} onClick={() => call({ op: 'clan_create', name: clanName, tag: clanTag, emblem: clanEmblem || undefined })}>{tr('Create')}</button></div>
                <EmblemGrid value={clanEmblem} onPick={(id) => setClanEmblem(clanEmblem === id ? '' : id)} />
                {(data?.invites ?? []).map((i: any) => <div key={i.clanId} className={row}><span className="flex items-center gap-1"><ClanEmblemBadge emblem={i.emblem} size={18} />[{i.tag}] {i.name}</span><button className={btn} onClick={() => call({ op: 'clan_accept', clanId: i.clanId })}>{tr('Join')}</button></div>)}
              </>
            )
          )}

          {tab === 'gates' && data && (
            <>
              <div className="text-xs text-slate-300">Free keys left today: <b className="text-orange-400">{data.freeKeysLeft}</b> · Gate keys: <b className="text-white">{data.gateKeys}</b>. Parties (up to 5) enter together; enemies scale with party size. 15 minute limit.</div>
              {data.dungeons.map((d: any) => (
                <div key={d.id} className={row}><span><b className="text-white">{d.name}</b> <span className="text-slate-500">Lv {d.minLevel}+ · {d.waves} waves + boss {d.cleared ? '· cleared' : ''}</span></span>
                  <button className={btn} onClick={() => call({ op: 'dungeon_enter', dungeonId: d.id })}>{tr('Enter')}</button></div>
              ))}
              <button className={ghost} onClick={() => call({ op: 'dungeon_leave' })}>{tr('Leave current gate')}</button>
            </>
          )}

          {tab === 'career' && (() => {
            const prog = codexProgress(character);
            const rank = getRankForHonor(character.wallet.honor);
            return (
              <>
                <div className="flex items-center gap-2">
                  <RankBadge level={rank.level} size={48} />
                  <FactionCrest faction={character.faction} size={40} />
                  <div className="text-xs text-slate-300"><CurrencyIcon kind="honor" /> Honor <b className="text-white">{character.wallet.honor}</b> · rank {rank.level} / 21 · <CurrencyIcon kind="marks" /> season marks {character.wallet.seasonMarks} · faction <b className="capitalize text-white">{character.faction}</b></div>
                </div>
                <div className="text-xs text-slate-400">Titles: {character.season.titles.join(', ') || 'none yet'}</div>
                <div className="text-[11px] text-slate-400">Codex: {Object.entries(prog).map(([k, v]) => `${k} ${v.have}/${v.total}`).join(' · ')}</div>
                {ACHIEVEMENTS_CATALOG.map((a) => {
                  const p = Math.min(a.targetValue, progressOf(character, a.id));
                  const done = character.achievements.includes(a.id);
                  return <div key={a.id} className={row}><span className={done ? 'text-emerald-400' : 'text-slate-200'}>{a.id.replace('ach_', '').replace(/_/g, ' ')}</span><span className="text-slate-400 tabular-nums">{done ? 'done' : `${p} / ${a.targetValue}`}</span></div>;
                })}
              </>
            );
          })()}

          {tab === 'market' && (
            <>
              <div className="text-[11px] text-slate-400">Auction house works in the hub (map 13). 5 % tax on sales, listings last 12/24/48 h.</div>
              <div className="flex gap-1.5 items-center">
                <select value={sellUid} onChange={(e) => setSellUid(e.target.value)} className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs">
                  <option value="">Item to sell…</option>
                  {character.inventory.map((i) => <option key={i.uid} value={i.uid}>{describeItem(i).name} ({i.rarity})</option>)}
                </select>
                <input value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} placeholder={(() => { const it = character.inventory.find((i) => i.uid === sellUid); const b = it && priceBandClient(it.defId); return b ? `${b.min}-${b.max}` : 'price'; })()} className="w-28 px-2 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs" />
                <button className={btn} onClick={() => call({ op: 'ah_sell', uid: sellUid, price: Number(sellPrice), hours: 24 })}>{tr('List 24h')}</button>
              </div>
              {(data ?? []).map((l: any) => (
                <div key={l.id} className={row}><span><b className="text-white">{describeItem(l.item).name}</b> <span className="text-slate-500">{l.item.rarity} · {l.sellerName}</span></span>
                  <span className="flex gap-2 items-center"><b className="text-amber-300 tabular-nums">{l.price.toLocaleString()}</b><button className={btn} onClick={() => call({ op: 'ah_buy', id: l.id })}>{tr('Buy')}</button></span></div>
              ))}
              {(data ?? []).length === 0 && <div className="text-xs text-slate-500 p-2">{tr('No listings.')}</div>}
              <button className={ghost} onClick={async () => { const r = await call({ op: 'mail_list' }, false); for (const m of r.data ?? []) await call({ op: 'mail_claim', id: m.id }, false); void load(); }}>{tr('Collect mail')}</button>
              <button className={ghost} onClick={async () => { const mine = await client.social({ op: 'ah_mine' }); setMsg(`${mine.data?.length ?? 0} of your listings are active`); }}>{tr('My listings')}</button>
            </>
          )}

          {tab === 'arena' && data && (
            <>
              <div className="text-xs text-slate-300">Your vehicle power <b className="text-orange-400">{data.power}</b> → league <b className="text-white capitalize">{data.league}</b>. Everyone fights with their own vehicle and gear.</div>
              {Object.entries(data.ratings).map(([m, r]: any) => <div key={m} className={row}><span className="text-white">{m}</span><span className="text-slate-400">rating {r.rating} · {r.wins}W/{r.losses}L</span></div>)}
              {data.banMinutes > 0 && <div className="text-xs text-rose-300">Queue ban: {data.banMinutes} min (left a match early)</div>}
              <div className="flex gap-1.5 items-center">
                {(['1v1', '3v3', '5v5'] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`px-2 py-1 rounded text-xs ${mode === m ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>{m}</button>)}
                {data.queued ? <button className={ghost} onClick={() => call({ op: 'arena_leave' })}>Leave queue ({data.queued})</button> : <button className={btn} onClick={() => call({ op: 'arena_queue', mode })}>{tr('Queue')}</button>}
              </div>
              <button className={ghost} onClick={async () => { const r = await client.social({ op: 'war_status' }); setMsg(r.ok ? `War week ${r.data.week}: ${Object.entries(r.data.scores).map(([f, v]) => `${f} ${v}`).join(' · ')}` : ''); }}>{tr('Faction war scores')}</button>
            </>
          )}

          {tab === 'ranking' && (
            <>
              <div className="flex gap-1.5">{(['level', 'clans'] as const).map((k) => <button key={k} onClick={() => setRankKind(k)} className={`px-2 py-1 rounded text-xs ${rankKind === k ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>{k}</button>)}</div>
              {(data ?? []).map((r: any, i: number) => <div key={i} className={row}><span>#{i + 1} <b className="text-white inline-flex items-center gap-1">{r.emblem && <ClanEmblemBadge emblem={r.emblem} size={16} />}{r.name}{r.tag ? ` [${r.tag}]` : ''}</b></span><span className="text-slate-400">{r.level ? `Lv ${r.level}` : `${r.members} members · ${r.totalLevel} levels`}</span></div>)}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const EmblemGrid: React.FC<{ value: string; onPick: (id: string) => void }> = ({ value, onPick }) => (
  <div className="grid grid-cols-10 gap-1 max-h-24 overflow-y-auto" role="listbox" aria-label="Emblem">
    {CLAN_EMBLEMS.map((id) => (
      <button key={id} type="button" role="option" aria-selected={value === id} aria-label={id.replace(/_/g, ' ')} title={id.replace(/_/g, ' ')} onClick={() => onPick(id)} className={`p-0.5 rounded border ${value === id ? 'border-amber-400 bg-slate-800' : 'border-slate-800'}`}>
        <ClanEmblemBadge emblem={id} size={24} />
      </button>
    ))}
  </div>
);
