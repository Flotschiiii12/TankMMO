import React, { useEffect, useState } from 'react';
import { tr } from '../../i18n.ts';
import * as C from '../../../shared/rules/character.ts';
import type { OnlineGameClient } from '../../net/onlineClient.ts';
import { describeItem, errorText } from '../../game/actions.ts';
import { Button } from '../kit/Button.tsx';
import { CurrencyChip } from '../kit/Currency.tsx';
import { EmptyState } from '../kit/States.tsx';
import { ItemCard } from '../kit/ItemCard.tsx';
import { VirtualGrid } from '../kit/Virtual.tsx';
import { notifications } from '../hud/notify.ts';
import { iconFor } from './ItemDetail.tsx';

interface TradeView { with: string; mine: { items: C.ItemInstance[]; scrap: number }; theirs: { items: C.ItemInstance[]; scrap: number }; iConfirmed: boolean; theyConfirmed: boolean }
const ENDED: Record<string, string> = { completed: 'Trade completed', cancelled: 'Trade cancelled', partner_left: 'Your partner left', item_invalid: 'An item is no longer valid', not_enough_scrap: 'Not enough scrap', inventory_full: 'Inventory full' };

/**
 * Direct trade: friends or clan mates, both near each other. Two columns (you offer / they offer), every change resets both
 * confirmations (the server does that), the trade only happens when both have confirmed the same offer.
 */
export const TradePanel: React.FC<{ client: OnlineGameClient; ch: C.CharacterState }> = ({ client, ch }) => {
  const [trade, setTrade] = useState<TradeView | null | undefined>(undefined);
  const [friends, setFriends] = useState<Array<{ name: string; status: string; online?: boolean }>>([]);
  const [items, setItems] = useState<Set<string>>(new Set()); const [scrap, setScrap] = useState('0'); const [msg, setMsg] = useState('');
  const adopt = (v: TradeView | null) => { setTrade(v); if (v) { setItems(new Set(v.mine.items.map((i) => i.uid))); setScrap(String(v.mine.scrap)); } };
  useEffect(() => {
    void client.social({ op: 'trade_info' }).then((r) => adopt(r.ok ? r.data : null));
    void client.social({ op: 'friend_list' }).then((r) => setFriends(r.ok && Array.isArray(r.data) ? r.data.filter((f: { status: string; online?: boolean }) => f.status === 'accepted' && f.online) : []));
    return client.onSocialEvent((kind, d) => {
      if (kind !== 'trade_update') return;
      if (d?.ended) { setTrade(null); setItems(new Set()); const t = tr(ENDED[d.ended] ?? 'Trade ended'); setMsg(t); notifications.push({ group: 'system', title: t, kind: d.ended === 'completed' ? 'success' : 'warn' }); } else adopt(d);
    });
  }, [client]);
  const call = async (req: Parameters<OnlineGameClient['social']>[0]) => { const r = await client.social(req); if (!r.ok) setMsg(errorText(r.error || 'failed')); else { setMsg(''); if (r.data && typeof r.data === 'object' && 'mine' in r.data) adopt(r.data); } return r; };
  const tradable = ch.inventory.filter((i) => !i.bound && !C.isEquipped(ch, i.uid));

  if (trade === undefined) return <EmptyState icon="…" title={tr('Loading')} />;
  if (!trade) return (
    <div className="grid gap-2" data-testid="trade-start">
      <p className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{tr('Trade directly with an online friend or clan mate who stands close to you.')}</p>
      {msg && <div className="text-sm" style={{ color: 'var(--c-warn)' }}>{msg}</div>}
      {friends.length === 0 ? <EmptyState icon="👥" title={tr('No friend online')} text={tr('Add friends in the Social window.')} /> : friends.map((f) => <div key={f.name} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--c-bg-1)', border: '1px solid var(--c-line)' }}><b className="flex-1">{f.name}</b><Button variant="primary" onClick={() => void call({ op: 'trade_open', name: f.name })}>{tr('Start trade')}</Button></div>)}
    </div>
  );
  const dirty = JSON.stringify([...items].sort()) !== JSON.stringify(trade.mine.items.map((i) => i.uid).sort()) || Number(scrap) !== trade.mine.scrap;
  const col = (title: string, who: TradeView['mine'], confirmed: boolean, children?: React.ReactNode) => (
    <div className="rounded-lg p-2 grid gap-2 content-start" style={{ background: 'var(--c-bg-0)', border: `1px solid ${confirmed ? 'var(--c-good)' : 'var(--c-line)'}` }}>
      <div className="flex items-center justify-between"><b>{title}</b><span className="k-badge" style={{ color: confirmed ? 'var(--c-good)' : 'var(--c-text-3)' }}>{confirmed ? `✓ ${tr('confirmed')}` : tr('not confirmed')}</span></div>
      {children ?? <div className="flex gap-1.5 flex-wrap">{who.items.length === 0 && who.scrap === 0 ? <span className="text-[12px]" style={{ color: 'var(--c-text-3)' }}>{tr('Nothing offered yet')}</span> : null}{who.items.map((i) => <ItemCard key={i.uid} rarity={i.rarity} name={describeItem(i).name} icon={iconFor(i, 24)} upgrade={i.upgrade} />)}{who.scrap > 0 && <CurrencyChip kind="scrap" value={who.scrap} />}</div>}
    </div>
  );
  return (
    <div className="grid gap-3" data-testid="trade-view">
      <div className="flex items-center justify-between"><b>{tr('Trade with {name}', { name: trade.with })}</b><Button variant="ghost" onClick={() => void call({ op: 'trade_cancel' })}>{tr('Cancel trade')}</Button></div>
      {msg && <div className="text-sm" style={{ color: 'var(--c-warn)' }} role="alert">{msg}</div>}
      <div className="grid gap-3 md:grid-cols-2">
        {col(tr('You offer'), trade.mine, trade.iConfirmed, (
          <>
            <VirtualGrid items={tradable} cell={52} gap={6} height={112} renderCell={(it) => <ItemCard rarity={it.rarity} name={describeItem(it).name} icon={iconFor(it, 22)} upgrade={it.upgrade} selected={items.has(it.uid)} onClick={() => setItems((s) => { const n = new Set(s); if (n.has(it.uid)) n.delete(it.uid); else if (n.size < 20) n.add(it.uid); return n; })} />} />
            <div className="flex items-center gap-2"><label className="text-[12px]" htmlFor="trade-scrap" style={{ color: 'var(--c-text-2)' }}>{tr('Scrap')}</label><input id="trade-scrap" value={scrap} inputMode="numeric" onChange={(e) => setScrap(e.target.value.replace(/\D/g, ''))} className="w-28 k-field"  /><span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>/ {ch.wallet.scrap.toLocaleString()}</span></div>
            <Button disabled={!dirty} onClick={() => void call({ op: 'trade_set', items: [...items], scrap: Number(scrap) || 0 })}>{tr('Update offer')}</Button>
          </>
        ))}
        {col(tr('{name} offers', { name: trade.with }), trade.theirs, trade.theyConfirmed)}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="primary" disabled={trade.iConfirmed || dirty} onClick={() => void call({ op: 'trade_confirm' })}>{trade.iConfirmed ? tr('Waiting for {name}…', { name: trade.with }) : tr('Confirm trade')}</Button>
        <span className="text-[12px]" style={{ color: 'var(--c-text-3)' }}>{dirty ? tr('Update your offer first.') : tr('Any change resets both confirmations.')}</span>
      </div>
    </div>
  );
};
