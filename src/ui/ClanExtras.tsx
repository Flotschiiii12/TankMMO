import React, { useCallback, useEffect, useState } from 'react';
import { tr } from '../i18n.ts';
import type { OnlineGameClient } from '../net/onlineClient.ts';
import type { SocialOp } from '../../shared/protocol.ts';
import type { CharacterState } from '../../shared/rules/character.ts';
import { describeItem, errorText } from '../game/actions.ts';
import { isEquipped } from '../../shared/rules/character.ts';
import { ClanEmblemBadge } from './GameIcon.tsx';

const btn = 'px-2 py-1 rounded bg-orange-600/80 text-white text-xs';
const ghost = 'px-2 py-1 rounded border border-slate-700 text-slate-300 text-xs';
const row = 'flex items-center justify-between p-2 rounded border border-slate-800 bg-slate-950/40 text-xs';

/** Clan item storage and alliances (shown under the clan tab). */
export const ClanExtras: React.FC<{ client: OnlineGameClient; character: CharacterState; myRole: 'leader' | 'officer' | 'member' }> = ({ client, character, myRole }) => {
  const [storage, setStorage] = useState<any>(null);
  const [allies, setAllies] = useState<any[]>([]);
  const [tag, setTag] = useState('');
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState<'storage' | 'allies' | null>(null);

  const load = useCallback(async () => {
    const [s, a] = await Promise.all([client.social({ op: 'clan_storage' }), client.social({ op: 'clan_allies' })]);
    if (s.ok) setStorage(s.data);
    if (a.ok) setAllies(a.data ?? []);
  }, [client]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 5000); return () => clearInterval(t); }, [load]);

  const call = async (req: SocialOp) => {
    const r = await client.social(req);
    setMsg(r.ok ? '' : errorText(r.error || 'failed'));
    void load();
  };

  const deposable = character.inventory.filter((i) => !i.bound && !isEquipped(character, i.uid));
  const canWithdraw = storage && (storage.minRole === 'member' || (storage.minRole === 'officer' && myRole !== 'member') || myRole === 'leader');
  const tab = (id: 'storage' | 'allies', label: string) => <button className={open === id ? btn : ghost} onClick={() => setOpen(open === id ? null : id)}>{label}</button>;

  return (
    <div className="space-y-1.5 border-t border-slate-800 pt-2">
      <div className="flex gap-1.5 items-center">
        {tab('storage', `${tr('Item storage')} ${storage ? `${storage.items.length}/${storage.capacity}` : ''}`)}
        {tab('allies', `${tr('Allies')} ${allies.filter((a) => a.status === 'active').length}/2`)}
        {msg && <span className="text-[11px] text-red-300">{msg}</span>}
      </div>

      {open === 'storage' && storage && (
        <div className="space-y-1.5">
          <div className="text-[11px] text-slate-400">
            {tr('Withdrawals left today')}: <b className="text-white">{storage.withdrawalsLeft}</b> · {tr('Withdraw from role')}: <b className="text-white">{tr(storage.minRole)}</b>
            {myRole === 'leader' && (['member', 'officer', 'leader'] as const).map((r) => <button key={r} className={`${ghost} ml-1`} disabled={storage.minRole === r} onClick={() => call({ op: 'clan_storage_policy', minRole: r })}>{tr(r)}</button>)}
          </div>
          {storage.items.map((x: any) => {
            const d = describeItem(x.item);
            return <div key={x.id} className={row}><span><b style={{ color: d.color }}>{d.name}</b> <span className="text-slate-500">{tr('from')} {x.by}</span></span><button className={ghost} disabled={!canWithdraw} onClick={() => call({ op: 'clan_withdraw', id: x.id })}>{tr('Withdraw')}</button></div>;
          })}
          {storage.items.length === 0 && <div className="text-xs text-slate-500">{tr('The storage is empty.')}</div>}
          <div className="text-[11px] text-slate-400 pt-1">{tr('Deposit from your inventory (safe zone only)')}:</div>
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
            {deposable.map((i) => { const d = describeItem(i); return <button key={i.uid} className={ghost} style={{ color: d.color }} onClick={() => call({ op: 'clan_deposit', uid: i.uid })}>{d.name}</button>; })}
            {deposable.length === 0 && <span className="text-xs text-slate-500">{tr('Nothing to deposit.')}</span>}
          </div>
          <div className="text-[11px] text-slate-500">{tr('Log')}: {(storage.log ?? []).slice(0, 5).map((l: any) => `${l.actor} ${tr(l.kind)} ${l.defId}`).join(' | ')}</div>
        </div>
      )}

      {open === 'allies' && (
        <div className="space-y-1.5">
          <div className="text-[11px] text-slate-400">{tr('Allied clans cannot hurt each other on war control points and share the ally chat channel. Maximum 2 alliances.')}</div>
          {allies.map((a) => (
            <div key={a.clanId} className={row}>
              <span className="flex items-center gap-1"><ClanEmblemBadge emblem={a.emblem} size={18} />[{a.tag}] {a.name} <span className="text-slate-500">{tr(a.status)}</span></span>
              <span className="flex gap-1">
                {a.status === 'incoming' && myRole === 'leader' && <button className={btn} onClick={() => call({ op: 'clan_ally_accept', clanId: a.clanId })}>{tr('Accept')}</button>}
                {a.status !== 'active' && myRole !== 'member' && <button className={ghost} onClick={() => call({ op: 'clan_ally_decline', clanId: a.clanId })}>{tr('Decline')}</button>}
                {a.status === 'active' && myRole === 'leader' && <button className={ghost} onClick={() => call({ op: 'clan_ally_break', clanId: a.clanId })}>{tr('Break alliance')}</button>}
              </span>
            </div>
          ))}
          {myRole !== 'member' && (
            <div className="flex gap-1.5"><input value={tag} onChange={(e) => setTag(e.target.value)} placeholder={tr('Clan TAG')} className="w-24 px-2 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs" /><button className={btn} onClick={() => { void call({ op: 'clan_ally_propose', tag }); setTag(''); }}>{tr('Propose alliance')}</button></div>
          )}
        </div>
      )}
    </div>
  );
};
