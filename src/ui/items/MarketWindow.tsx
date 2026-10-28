import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { tr } from '../../i18n.ts';
import * as C from '../../../shared/rules/character.ts';
import { ITEM_BY_ID } from '../../../shared/data/items.ts';
import type { OnlineGameClient } from '../../net/onlineClient.ts';
import { describeItem } from '../../game/actions.ts';
import { priceBandClient } from '../../game/priceBand.ts';
import { errorText } from '../../game/actions.ts';
import { UserProfile } from '../../save/profile.ts';
import { CurrencyChip } from '../kit/Currency.tsx';
import { Button } from '../kit/Button.tsx';
import { EmptyState, SkeletonRows } from '../kit/States.tsx';
import { ItemCard } from '../kit/ItemCard.tsx';
import { Modal } from '../kit/Modal.tsx';
import { SegmentedControl, Tabs } from '../kit/Tabs.tsx';
import { VirtualGrid } from '../kit/Virtual.tsx';
import { notifications } from '../hud/notify.ts';
import { WindowFrame } from '../wm/WindowFrame.tsx';
import { iconFor } from './ItemDetail.tsx';
import { marketIntent } from './marketIntent.ts';
import { suggestPrice, timeLeft } from './itemsLogic.ts';
import { TradePanel } from './TradePanel.tsx';

/** Auction tax of the server (AUCTION_TAX, lowered by talents / war discount): the preview says "about". */
const TAX = 0.05;
type Tab = 'browse' | 'sell' | 'mine' | 'trade' | 'mail';
interface Listing { id: number; sellerName: string; item: C.ItemInstance; price: number; expiresAt: number }
interface Mail { id: number; kind: 'item' | 'scrap'; payload: string; note: string; ts: number }

/** Fetches one social op; reload() refetches. */
function useOp<T>(client: OnlineGameClient | null, req: Parameters<OnlineGameClient['social']>[0] | null, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error?: string }>({ data: null, loading: !!req });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!client || !req) { setState({ data: null, loading: false }); return; }
    let dead = false; setState((s) => ({ ...s, loading: true }));
    void client.social(req).then((r) => { if (!dead) setState(r.ok ? { data: r.data as T, loading: false } : { data: null, loading: false, error: r.error }); });
    return () => { dead = true; };
  }, [client, n, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: useCallback(() => setN((v) => v + 1), []) };
}

const ListingRow: React.FC<{ l: Listing; action?: React.ReactNode; now: number }> = ({ l, action, now }) => {
  const info = describeItem(l.item);
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--c-bg-1)', border: '1px solid var(--c-line)' }} data-testid="listing">
      <ItemCard rarity={l.item.rarity} name={info.name} icon={iconFor(l.item, 26)} upgrade={l.item.upgrade} tier={info.def.tier} />
      <div className="min-w-0 flex-1"><b className="block truncate text-[13px]" style={{ color: info.color }}>{info.name}</b><div className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>{tr(l.item.rarity)}{l.sellerName ? ` · ${l.sellerName}` : ''} · {timeLeft(l.expiresAt, now) === 'expired' ? tr('expired') : timeLeft(l.expiresAt, now)}</div></div>
      <CurrencyChip kind="scrap" value={l.price} />
      {action}
    </div>
  );
};

export const MarketWindow: React.FC<{ client: OnlineGameClient | null; profile: UserProfile }> = ({ client, profile }) => {
  const ch = profile.character; const [tab, setTab] = useState<Tab>('browse'); const [msg, setMsg] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);
  useEffect(() => marketIntent.subscribe(() => { if (marketIntent.peek()) setTab('sell'); }), []);
  const mail = useOp<Mail[]>(client, { op: 'mail_list' }, []);
  const say = (ok: boolean, text: string, err?: string) => { setMsg(ok ? '' : errorText(err || 'failed')); if (ok) notifications.push({ group: 'system', title: text, kind: 'success' }); };

  // ---------------------------------------------------------------- browse
  const [slot, setSlot] = useState('all'); const [maxPrice, setMax] = useState(''); const [q, setQ] = useState(''); const [buy, setBuy] = useState<Listing | null>(null); const [busy, setBusy] = useState(false);
  const search = useOp<Listing[]>(client, tab === 'browse' ? { op: 'ah_search', ...(slot !== 'all' ? { slot } : {}), ...(Number(maxPrice) > 0 ? { maxPrice: Number(maxPrice) } : {}) } as never : null, [tab, slot, maxPrice]);
  const shown = useMemo(() => (search.data ?? []).filter((l) => !q || describeItem(l.item).name.toLowerCase().includes(q.toLowerCase())), [search.data, q]);
  const browse = (
    <div className="grid gap-2">
      <div className="flex gap-2 flex-wrap items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search items')} aria-label={tr('Search items')} className="flex-1 min-w-[8rem] k-field" />
        <input value={maxPrice} inputMode="numeric" onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} placeholder={tr('Max price')} aria-label={tr('Max price')} className="w-28 k-field" />
      </div>
      <div className="overflow-x-auto"><SegmentedControl label={tr('Slot')} value={slot} onChange={setSlot} options={['all', 'main', 'secondary', 'armor', 'engine', 'module', 'drone'].map((s) => ({ id: s, label: s === 'all' ? tr('All') : tr(s) }))} /></div>
      {search.loading ? <SkeletonRows rows={4} h={64} /> : search.error ? <EmptyState icon="⚠" title={errorText(search.error)} action={<Button onClick={search.reload}>{tr('Try again')}</Button>} /> : shown.length === 0 ? <EmptyState icon="🏷" title={tr('No listings')} text={tr('Nobody sells this right now. Try other filters, or list your own items.')} /> : (
        <div className="grid gap-1.5">{shown.map((l) => <ListingRow key={l.id} l={l} now={now} action={<Button variant="primary" onClick={() => setBuy(l)}>{tr('Buy')}</Button>} />)}</div>
      )}
      <Modal open={!!buy} onClose={() => setBuy(null)} title={tr('Buy this item?')} closeLabel={tr('Close')} footer={<><Button variant="ghost" onClick={() => setBuy(null)}>{tr('Cancel')}</Button><Button variant="primary" loading={busy} disabled={!buy || ch.wallet.scrap < buy.price} onClick={async () => { if (!buy || !client) return; setBusy(true); const r = await client.social({ op: 'ah_buy', id: buy.id }); setBusy(false); setBuy(null); say(r.ok, tr('Bought {name}', { name: describeItem(buy.item).name }), r.error); search.reload(); }}>{tr('Buy')}</Button></>}>
        {buy && <><ListingRow l={buy} now={now} /><p className="text-sm mt-2" style={{ color: 'var(--c-text-2)' }}>{tr('You have')} {ch.wallet.scrap.toLocaleString()} {tr('scrap')} → <b style={{ color: ch.wallet.scrap >= buy.price ? 'var(--c-text)' : 'var(--c-bad)' }}>{(ch.wallet.scrap - buy.price).toLocaleString()}</b> {tr('after buying')}.</p></>}
      </Modal>
    </div>
  );

  // ---------------------------------------------------------------- sell wizard
  const sellable = useMemo(() => ch.inventory.filter((i) => !C.isEquipped(ch, i.uid) && !i.bound), [ch]);
  const [uid, setUid] = useState<string | null>(null); const [price, setPrice] = useState(''); const [hours, setHours] = useState('24');
  useEffect(() => { const t = marketIntent.take(); if (t) { setUid(t); setTab('sell'); } }, [tab]);
  const item = uid ? C.findItem(ch, uid) : undefined; const band = item ? priceBandClient(item.defId) : undefined;
  const recent = useOp<Array<{ price: number; at: number }>>(client, item ? { op: 'ah_recent', defId: item.defId } as never : null, [item?.defId]);
  const same = useOp<Listing[]>(client, item ? { op: 'ah_search', defId: item.defId } as never : null, [item?.defId]);
  const advice = item && band ? suggestPrice(band, (recent.data ?? []).map((s) => s.price), same.data?.[0]?.price, ITEM_BY_ID.get(item.defId)?.scrapValue ?? 1) : undefined;
  useEffect(() => { if (advice) setPrice(String(advice.suggested)); }, [item?.uid, advice?.suggested]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = Number(price); const priceOk = !!band && Number.isInteger(p) && p >= band.min && p <= band.max;
  const sell = (
    <div className="grid gap-3">
      <p className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{tr('1. Choose an item  2. Set the price  3. Confirm. The market works in the hub; the tax is about {n} %.', { n: TAX * 100 })}</p>
      {sellable.length === 0 ? <EmptyState icon="🎒" title={tr('Nothing to sell')} text={tr('Equipped and bound items cannot be listed.')} /> : <div className="rounded-lg p-1.5" style={{ background: 'var(--c-bg-0)', border: '1px solid var(--c-line)' }}><VirtualGrid items={sellable} cell={56} gap={6} height={124} renderCell={(it) => <ItemCard rarity={it.rarity} name={describeItem(it).name} icon={iconFor(it, 24)} upgrade={it.upgrade} selected={uid === it.uid} onClick={() => setUid(it.uid)} />} /></div>}
      {item && band && advice && (
        <div className="grid gap-2 rounded-lg p-3" style={{ background: 'var(--c-bg-1)', border: '1px solid var(--c-line)' }} data-testid="sell-form">
          <b style={{ color: describeItem(item).color }}>{describeItem(item).name}</b>
          <div className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{tr('Allowed price')}: {band.min.toLocaleString()} – {band.max.toLocaleString()} · {advice.basis === 'recent' ? tr('Suggested from recent sales') : advice.basis === 'listings' ? tr('Suggested just under the cheapest listing') : tr('Suggested from the vendor value')}: <b style={{ color: 'var(--accent-2)' }}>{advice.suggested.toLocaleString()}</b></div>
          {(recent.data?.length ?? 0) > 0 && <div className="text-[12px]" style={{ color: 'var(--c-text-3)' }}>{tr('Recent sales')}: {recent.data!.map((s) => s.price.toLocaleString()).join(' · ')}</div>}
          {same.data?.length ? <div className="text-[12px]" style={{ color: 'var(--c-text-3)' }}>{tr('Cheapest listing now')}: {same.data[0].price.toLocaleString()}</div> : null}
          <div className="flex gap-2 items-center flex-wrap">
            <input value={price} inputMode="numeric" onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} aria-label={tr('Price')} className="w-32 k-field" aria-invalid={!priceOk && !!price} />
            <SegmentedControl label={tr('Duration')} value={hours} onChange={setHours} options={[{ id: '12', label: '12 h' }, { id: '24', label: '24 h' }, { id: '48', label: '48 h' }]} />
          </div>
          <div className="text-[12px]" style={{ color: priceOk ? 'var(--c-text-2)' : 'var(--c-bad)' }}>{priceOk ? <>{tr('You receive about')} <b>{Math.floor(p * (1 - TAX)).toLocaleString()}</b> {tr('scrap after tax')}.</> : tr('Price must be a whole number inside the allowed range.')}</div>
          <Button variant="primary" disabled={!priceOk} loading={busy} onClick={async () => { if (!client) return; setBusy(true); const r = await client.social({ op: 'ah_sell', uid: item.uid, price: p, hours: Number(hours) }); setBusy(false); say(r.ok, tr('Listed {name}', { name: describeItem(item).name }), r.error); if (r.ok) { setUid(null); setPrice(''); } }}>{tr('List for {n} h', { n: hours })}</Button>
        </div>
      )}
    </div>
  );

  // ---------------------------------------------------------------- my listings, mail
  const mine = useOp<Listing[]>(client, tab === 'mine' ? { op: 'ah_mine' } : null, [tab]);
  const mineView = mine.loading ? <SkeletonRows rows={3} h={64} /> : (mine.data ?? []).length === 0 ? <EmptyState icon="📦" title={tr('You have no active listings')} action={<Button onClick={() => setTab('sell')}>{tr('Sell an item')}</Button>} /> : (
    <div className="grid gap-1.5">{mine.data!.map((l) => <ListingRow key={l.id} l={l} now={now} action={<Button variant="danger" onClick={async () => { const r = await client!.social({ op: 'ah_cancel', id: l.id }); say(r.ok, tr('Listing cancelled, the item is in your mail'), r.error); mine.reload(); mail.reload(); }}>{tr('Cancel')}</Button>} />)}</div>
  );
  const claim = async (id: number) => { const r = await client!.social({ op: 'mail_claim', id }); say(r.ok, tr('Mail collected'), r.error); mail.reload(); };
  const mailView = mail.loading ? <SkeletonRows rows={3} h={56} /> : (mail.data ?? []).length === 0 ? <EmptyState icon="✉" title={tr('Your mailbox is empty')} text={tr('Sold items, returned listings and rewards arrive here.')} /> : (
    <div className="grid gap-1.5">
      <div className="flex justify-between items-center"><span className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{tr('{n} messages', { n: mail.data!.length })}</span><Button variant="primary" onClick={async () => { for (const m of mail.data!) { const r = await client!.social({ op: 'mail_claim', id: m.id }); if (!r.ok) { say(false, '', r.error); break; } } mail.reload(); }}>{tr('Claim all')}</Button></div>
      {mail.data!.map((m) => { const it = m.kind === 'item' ? (JSON.parse(m.payload) as C.ItemInstance) : undefined; return (
        <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--c-bg-1)', border: '1px solid var(--c-line)' }} data-testid="mail-row">
          {it ? <ItemCard rarity={it.rarity} name={describeItem(it).name} icon={iconFor(it, 24)} upgrade={it.upgrade} /> : <CurrencyChip kind="scrap" value={Number(m.payload)} />}
          <div className="min-w-0 flex-1"><b className="block truncate text-[13px]">{it ? describeItem(it).name : `${Number(m.payload).toLocaleString()} ${tr('scrap')}`}</b><div className="text-[11px] truncate" style={{ color: 'var(--c-text-3)' }}>{m.note} · {new Date(m.ts).toLocaleDateString()}</div></div>
          <Button onClick={() => void claim(m.id)}>{tr('Claim')}</Button>
        </div>); })}
    </div>
  );

  const body = !client ? <EmptyState icon="🔌" title={tr('The market needs an online connection')} /> : tab === 'browse' ? browse : tab === 'sell' ? sell : tab === 'mine' ? mineView : tab === 'trade' ? <TradePanel client={client} ch={ch} /> : mailView;
  return (
    <WindowFrame id="market" title="Market & Mail" width="min(960px, 98vw)" height="min(700px, 95vh)" headerExtra={<span className="max-[900px]:hidden"><CurrencyChip kind="scrap" value={ch.wallet.scrap} /></span>}>
      <div className="flex flex-col h-full min-h-0 gap-2">
        <Tabs label={tr('Market & Mail')} value={tab} onChange={(v) => setTab(v as Tab)} tabs={[{ id: 'browse', label: tr('Browse') }, { id: 'sell', label: tr('Sell') }, { id: 'mine', label: tr('My listings') }, { id: 'trade', label: tr('Trade') }, { id: 'mail', label: tr('Mail'), pip: mail.data?.length ?? 0 }]} />
        {msg && <div className="text-xs" style={{ color: 'var(--c-warn)' }} role="alert">{msg}</div>}
        <div className="flex-1 min-h-0 overflow-y-auto" data-testid={`market-${tab}`}>{body}</div>
      </div>
    </WindowFrame>
  );
};
