import React, { useCallback, useEffect, useState } from 'react';
import { tr } from '../../i18n.ts';
import type { OnlineGameClient } from '../../net/onlineClient.ts';
import { CLAN_EMBLEMS } from '../../../shared/data/emblems.ts';
import { CLAN_RESEARCH } from '../../../shared/data/clanResearch.ts';
import * as C from '../../../shared/rules/character.ts';
import { describeItem, errorText } from '../../game/actions.ts';
import { ClanEmblemBadge, CurrencyIcon } from '../GameIcon.tsx';
import { Button } from '../kit/Button.tsx';
import { Badge, ProgressBar } from '../kit/Indicators.tsx';
import { Modal } from '../kit/Modal.tsx';
import { EmptyState, SkeletonRows } from '../kit/States.tsx';
import { Tabs } from '../kit/Tabs.tsx';
import { ItemCard } from '../kit/ItemCard.tsx';
import { windows } from '../wm/windowStore.ts';
import { iconFor } from '../items/ItemDetail.tsx';
import { profileIntent } from './chat.ts';

type Role = 'leader' | 'officer' | 'member';
type Say = (m: string) => void;
type Op = Parameters<OnlineGameClient['social']>[0];
const CREATE_COST = 10_000;
const rowStyle = { background: 'var(--c-bg-1)', border: '1px solid var(--c-line)' };

export const EmblemGrid: React.FC<{ value: string; onPick: (id: string) => void }> = ({ value, onPick }) => (
  <div className="grid grid-cols-8 sm:grid-cols-10 gap-1 max-h-28 overflow-y-auto" role="listbox" aria-label={tr('Emblem')}>
    {CLAN_EMBLEMS.map((id) => <button key={id} type="button" role="option" aria-selected={value === id} aria-label={id.replace(/_/g, ' ')} title={id.replace(/_/g, ' ')} onClick={() => onPick(id)} className="rounded-lg flex items-center justify-center min-h-[44px]" style={{ border: `1px solid ${value === id ? 'var(--accent)' : 'var(--c-line)'}`, background: value === id ? 'var(--accent-soft)' : 'var(--c-bg-1)' }}><ClanEmblemBadge emblem={id} size={26} /></button>)}
  </div>
);

const Storage: React.FC<{ client: OnlineGameClient; ch: C.CharacterState; role: Role; call: (r: Op) => Promise<void> }> = ({ client, ch, role, call }) => {
  const [s, setS] = useState<any>(null);
  const load = useCallback(async () => { const r = await client.social({ op: 'clan_storage' }); if (r.ok) setS(r.data); }, [client]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 5000); return () => clearInterval(t); }, [load]);
  if (!s) return <SkeletonRows rows={3} h={52} />;
  const canWithdraw = s.minRole === 'member' || (s.minRole === 'officer' && role !== 'member') || role === 'leader';
  const deposable = ch.inventory.filter((i) => !i.bound && !C.isEquipped(ch, i.uid));
  const act = async (r: Op) => { await call(r); void load(); };
  return (
    <div className="grid gap-2" data-testid="clan-storage">
      <div className="flex items-center gap-2 flex-wrap text-[12px]" style={{ color: 'var(--c-text-2)' }}><span>{tr('Items')} {s.items.length}/{s.capacity}</span><span>· {tr('Withdrawals left today')}: <b>{s.withdrawalsLeft}</b></span><span>· {tr('Withdraw from role')}: <b>{tr(s.minRole)}</b></span>
        {role === 'leader' && (['member', 'officer', 'leader'] as const).map((r) => <Button key={r} variant="ghost" disabled={s.minRole === r} onClick={() => void act({ op: 'clan_storage_policy', minRole: r })}>{tr(r)}</Button>)}</div>
      <ProgressBar kind="accent" value={s.items.length} max={s.capacity} ariaLabel={tr('Storage space')} />
      {s.items.length === 0 ? <EmptyState icon="📦" title={tr('The storage is empty')} /> : s.items.map((x: any) => { const d = describeItem(x.item); return <div key={x.id} className="flex items-center gap-2 p-2 rounded-lg" style={rowStyle}><ItemCard rarity={x.item.rarity} name={d.name} icon={iconFor(x.item, 24)} upgrade={x.item.upgrade} /><div className="flex-1 min-w-0"><b className="block truncate" style={{ color: d.color }}>{d.name}</b><span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>{tr('from')} {x.by}</span></div><Button disabled={!canWithdraw} onClick={() => void act({ op: 'clan_withdraw', id: x.id })}>{tr('Withdraw')}</Button></div>; })}
      <div className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{tr('Deposit from your inventory (safe zone only)')}:</div>
      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">{deposable.length === 0 ? <span className="text-[12px]" style={{ color: 'var(--c-text-3)' }}>{tr('Nothing to deposit.')}</span> : deposable.map((i) => <ItemCard key={i.uid} rarity={i.rarity} name={describeItem(i).name} icon={iconFor(i, 22)} upgrade={i.upgrade} onClick={() => void act({ op: 'clan_deposit', uid: i.uid })} />)}</div>
    </div>
  );
};

const Allies: React.FC<{ client: OnlineGameClient; role: Role; call: (r: Op) => Promise<void> }> = ({ client, role, call }) => {
  const [allies, setAllies] = useState<any[] | null>(null); const [tag, setTag] = useState('');
  const load = useCallback(async () => { const r = await client.social({ op: 'clan_allies' }); if (r.ok) setAllies(r.data ?? []); }, [client]);
  useEffect(() => { void load(); }, [load]);
  const act = async (r: Op) => { await call(r); void load(); };
  if (!allies) return <SkeletonRows rows={2} h={48} />;
  return (
    <div className="grid gap-2" data-testid="clan-allies">
      <p className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{tr('Allied clans cannot hurt each other on war control points and share the ally chat channel. Maximum 2 alliances.')}</p>
      {allies.length === 0 && <EmptyState icon="🤝" title={tr('No alliances')} />}
      {allies.map((a) => <div key={a.clanId} className="flex items-center gap-2 p-2 rounded-lg flex-wrap" style={rowStyle}><ClanEmblemBadge emblem={a.emblem} size={20} /><b className="flex-1 truncate">[{a.tag}] {a.name}</b><Badge tone={a.status === 'active' ? 'good' : 'neutral'}>{tr(a.status)}</Badge>
        {a.status === 'incoming' && role === 'leader' && <Button variant="primary" onClick={() => void act({ op: 'clan_ally_accept', clanId: a.clanId })}>{tr('Accept')}</Button>}
        {a.status !== 'active' && role !== 'member' && <Button variant="ghost" onClick={() => void act({ op: 'clan_ally_decline', clanId: a.clanId })}>{tr('Decline')}</Button>}
        {a.status === 'active' && role === 'leader' && <Button variant="danger" onClick={() => void act({ op: 'clan_ally_break', clanId: a.clanId })}>{tr('Break alliance')}</Button>}</div>)}
      {role !== 'member' && <div className="flex gap-2"><input value={tag} onChange={(e) => setTag(e.target.value)} placeholder={tr('Clan TAG')} aria-label={tr('Clan TAG')} className="k-field w-28" /><Button variant="primary" disabled={!tag.trim()} onClick={() => { void act({ op: 'clan_ally_propose', tag: tag.trim() }); setTag(''); }}>{tr('Propose alliance')}</Button></div>}
    </div>
  );
};

/** Clan hub: overview with emblem and bank, roster with roles, storage, alliances, research and the log. Without a clan: create form and invites. */
export const ClanTab: React.FC<{ client: OnlineGameClient; ch: C.CharacterState; say: Say }> = ({ client, ch, say }) => {
  const [data, setData] = useState<any | undefined>(undefined); const [sub, setSub] = useState('roster'); const [name, setName] = useState(''); const [tag, setTag] = useState(''); const [emblem, setEmblem] = useState('');
  const [invName, setInvName] = useState(''); const [pick, setPick] = useState(false); const [leave, setLeave] = useState(false); const [donate, setDonate] = useState('1000');
  const load = useCallback(async () => { const r = await client.social({ op: 'clan_info' }); if (r.ok) setData(r.data); else setData({ none: true, invites: (await client.social({ op: 'clan_invites' })).data ?? [] }); }, [client]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 10000); return () => clearInterval(t); }, [load]);
  const call = async (req: Op, ok?: string) => { const r = await client.social(req); say(r.ok ? (ok ? tr(ok) : '') : errorText(r.error || 'failed')); void load(); };
  if (data === undefined) return <SkeletonRows rows={4} h={48} />;
  if (data.none) return (
    <div className="grid gap-3" data-testid="clan-create">
      <p className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{tr('Create a clan (10,000 scrap) or accept an invite.')}</p>
      <div className="flex gap-2 flex-wrap"><input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('Clan name')} aria-label={tr('Clan name')} className="k-field flex-1 min-w-[10rem]" /><input value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} placeholder={tr('TAG')} aria-label={tr('TAG')} maxLength={5} className="k-field w-24" /></div>
      <EmblemGrid value={emblem} onPick={(id) => setEmblem(emblem === id ? '' : id)} />
      <Button variant="primary" disabled={!name.trim() || !tag.trim() || ch.wallet.scrap < CREATE_COST} onClick={() => void call({ op: 'clan_create', name: name.trim(), tag: tag.trim(), ...(emblem ? { emblem } : {}) }, 'Clan created')}><CurrencyIcon kind="scrap" size={14} /> {tr('Create clan')} ({CREATE_COST.toLocaleString()})</Button>
      {(data.invites ?? []).map((i: any) => <div key={i.clanId} className="flex items-center gap-2 p-2 rounded-lg" style={rowStyle}><ClanEmblemBadge emblem={i.emblem} size={20} /><b className="flex-1">[{i.tag}] {i.name}</b><Button variant="primary" onClick={() => void call({ op: 'clan_accept', clanId: i.clanId }, 'Joined the clan')}>{tr('Join')}</Button></div>)}
    </div>
  );
  const role = data.myRole as Role; const staff = role !== 'member';
  return (
    <div className="grid gap-3" data-testid="clan-hub">
      <div className="flex items-center gap-3 flex-wrap"><ClanEmblemBadge emblem={data.emblem} size={44} /><div className="min-w-0 flex-1"><b className="text-lg">[{data.tag}] {data.name}</b><div className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{tr('you are')} {tr(role)} · {data.members.length} {tr('members')} · <CurrencyIcon kind="scrap" size={13} /> {data.scrap?.toLocaleString()}</div></div>
        {role !== 'member' && <Button onClick={() => setPick((v) => !v)}>{tr('Change emblem')}</Button>}<Button variant="danger" onClick={() => setLeave(true)}>{tr('Leave clan')}</Button></div>
      {pick && <EmblemGrid value={data.emblem ?? ''} onPick={(id) => { setPick(false); void call({ op: 'clan_emblem', emblem: id }); }} />}
      <Tabs label={tr('Clan')} value={sub} onChange={setSub} tabs={[{ id: 'roster', label: tr('Roster') }, { id: 'storage', label: tr('Storage') }, { id: 'allies', label: tr('Allies') }, { id: 'research', label: tr('Research') }, { id: 'log', label: tr('Log') }]} />
      {sub === 'roster' && (
        <div className="grid gap-1.5">
          {staff && <div className="flex gap-2"><input value={invName} onChange={(e) => setInvName(e.target.value)} placeholder={tr('Invite player')} aria-label={tr('Invite player')} className="k-field flex-1" /><Button variant="primary" disabled={!invName.trim()} onClick={() => { void call({ op: 'clan_invite', name: invName.trim() }, 'Invite sent'); setInvName(''); }}>{tr('Invite')}</Button></div>}
          {[...data.members].sort((a: any, b: any) => ['leader', 'officer', 'member'].indexOf(a.role) - ['leader', 'officer', 'member'].indexOf(b.role) || b.level - a.level).map((m: any) => (
            <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg flex-wrap" style={rowStyle}><b className="flex-1 min-w-[6rem] truncate">{m.role === 'leader' ? '👑 ' : ''}{m.name}</b><Badge tone={m.role === 'member' ? 'neutral' : 'accent'}>{tr(m.role)}</Badge><span className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>Lv {m.level}</span>
              <Button variant="ghost" onClick={() => { profileIntent.set(m.name); windows.open('profile'); }}>{tr('Profile')}</Button>
              {role === 'leader' && m.role === 'member' && <Button onClick={() => void call({ op: 'clan_role', name: m.name, role: 'officer' })}>{tr('Promote')}</Button>}
              {staff && m.role !== 'leader' && <Button variant="danger" onClick={() => void call({ op: 'clan_kick', name: m.name })}>{tr('Kick')}</Button>}</div>
          ))}
        </div>
      )}
      {sub === 'storage' && <Storage client={client} ch={ch} role={role} call={async (r) => call(r)} />}
      {sub === 'allies' && <Allies client={client} role={role} call={async (r) => call(r)} />}
      {sub === 'research' && (
        <div className="grid gap-2" data-testid="clan-research">
          <div className="flex gap-2 items-center flex-wrap"><span className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{tr('Clan bank')}: <b>{data.scrap?.toLocaleString()}</b></span><input value={donate} inputMode="numeric" onChange={(e) => setDonate(e.target.value.replace(/\D/g, ''))} aria-label={tr('Amount')} className="k-field w-28" /><Button onClick={() => void call({ op: 'clan_donate', amount: Number(donate) || 0 }, 'Donated')}>{tr('Donate')}</Button></div>
          {CLAN_RESEARCH.map((r) => { const lv = data.research?.[r.id] ?? 0; const cost = r.costPerLevel * (lv + 1); return (
            <div key={r.id} className="p-2 rounded-lg grid gap-1" style={rowStyle}><div className="flex items-center gap-2"><b className="flex-1">{tr(r.name)}</b><span className="text-[12px] tabular-nums">{lv}/{r.maxLevel}</span><Button variant="primary" disabled={!staff || lv >= r.maxLevel || (data.scrap ?? 0) < cost} onClick={() => void call({ op: 'clan_research', id: r.id }, 'Researched')}>{lv >= r.maxLevel ? tr('Maxed') : `${tr('Research')} (${cost.toLocaleString()})`}</Button></div><ProgressBar kind="xp" value={lv} max={r.maxLevel} ariaLabel={tr(r.name)} /><span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>{r.effect}</span></div>); })}
        </div>
      )}
      {sub === 'log' && (<div className="grid gap-1">{(data.log ?? []).length === 0 ? <EmptyState icon="📜" title={tr('Nothing logged yet')} /> : data.log.map((l: any, i: number) => <div key={i} className="text-[12px] flex gap-2" style={{ color: 'var(--c-text-2)' }}><span className="tabular-nums" style={{ color: 'var(--c-text-3)' }}>{new Date(l.ts).toLocaleDateString()}</span><span><b>{l.actor}</b>: {l.text}</span></div>)}</div>)}
      <Modal open={leave} onClose={() => setLeave(false)} title={tr('Leave the clan?')} closeLabel={tr('Close')} footer={<><Button variant="ghost" onClick={() => setLeave(false)}>{tr('Cancel')}</Button><Button variant="danger" onClick={() => { setLeave(false); void call({ op: 'clan_leave' }); }}>{tr('Leave clan')}</Button></>}><p>{role === 'leader' ? tr('You are the leader: leaving hands the clan over or dissolves it.') : tr('You can join another clan or be invited back later.')}</p></Modal>
    </div>
  );
};
