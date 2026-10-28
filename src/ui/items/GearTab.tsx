import React, { useMemo, useState } from 'react';
import { tr } from '../../i18n.ts';
import * as C from '../../../shared/rules/character.ts';
import type { ClientAction } from '../../../shared/rules/actions.ts';
import { describeItem } from '../../game/actions.ts';
import { Button } from '../kit/Button.tsx';
import { Modal } from '../kit/Modal.tsx';
import { EmptyState } from '../kit/States.tsx';
import { ItemCard } from '../kit/ItemCard.tsx';
import { ProgressBar } from '../kit/Indicators.tsx';
import { SegmentedControl } from '../kit/Tabs.tsx';
import { Tooltip } from '../kit/Tooltip.tsx';
import { VirtualGrid } from '../kit/Virtual.tsx';
import { RARITIES, rarityStyle } from '../kit/logic.ts';
import { useWindowMode } from '../wm/useWindows.ts';
import { CurrencyIcon } from '../GameIcon.tsx';
import { ItemDetail, iconFor } from './ItemDetail.tsx';
import { SortKey, dismantleReview, filterItems, sortItems, suggestDismantle } from './itemsLogic.ts';

type Run = (a: ClientAction, ok?: string) => Promise<{ ok: boolean; error?: string }>;
const SLOTS = ['all', 'main', 'secondary', 'armor', 'engine', 'module', 'drone'] as const;
const SORTS: SortKey[] = ['score', 'rarity', 'tier', 'upgrade', 'name'];
const SORT_LABEL: Record<SortKey, string> = { score: 'Best first', rarity: 'Rarity', tier: 'Tier', upgrade: 'Upgrade level', name: 'Name' };

/** Inventory grid with filters, sort, search, capacity bar, item detail with comparison, and bulk dismantle with a review list. */
export const GearTab: React.FC<{ ch: C.CharacterState; selected: string | null; onSelect: (uid: string | null) => void; run: Run; onWorkshop: () => void }> = ({ ch, selected, onSelect, run, onWorkshop }) => {
  const mode = useWindowMode();
  const [slot, setSlot] = useState<string>('all'); const [rar, setRar] = useState<Set<string>>(new Set()); const [search, setSearch] = useState(''); const [sort, setSort] = useState<SortKey>('score');
  const [multi, setMulti] = useState(false); const [picked, setPicked] = useState<Set<string>>(new Set()); const [review, setReview] = useState(false); const [busy, setBusy] = useState(false);
  const nameOf = (i: C.ItemInstance) => describeItem(i).name;
  const items = useMemo(() => sortItems(filterItems(ch, ch.inventory, { slot, rarities: rar, search }, nameOf), sort, nameOf), [ch, slot, rar, search, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const cap = C.inventoryCapacity(ch); const sel = selected ? C.findItem(ch, selected) : undefined;
  const rev = useMemo(() => dismantleReview(ch, [...picked]), [ch, picked]);
  const toggleRar = (r: string) => setRar((s) => { const n = new Set(s); if (n.has(r)) n.delete(r); else n.add(r); return n; });
  const click = (uid: string) => { if (multi) setPicked((p) => { const n = new Set(p); if (n.has(uid)) n.delete(uid); else n.add(uid); return n; }); else onSelect(selected === uid ? null : uid); };

  const toolbar = (
    <div className="grid gap-2">
      <div className="flex gap-2 flex-wrap items-center">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr('Search items')} aria-label={tr('Search items')} className="flex-1 min-w-[8rem] k-field" />
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label={tr('Sort')} className="k-field text-sm">{SORTS.map((s) => <option key={s} value={s}>{tr(SORT_LABEL[s])}</option>)}</select>
      </div>
      <div className="overflow-x-auto"><SegmentedControl label={tr('Slot')} value={slot} onChange={setSlot} options={SLOTS.map((s) => ({ id: s, label: s === 'all' ? tr('All') : tr(s) }))} /></div>
      <div className="flex gap-1.5 flex-wrap" role="group" aria-label={tr('Rarity')}>
        {RARITIES.map((r) => <button key={r} type="button" aria-pressed={rar.has(r)} onClick={() => toggleRar(r)} className="k-btn" style={{ padding: '0 10px', ['--b-line' as string]: rar.has(r) ? `var(${rarityStyle(r).cssVar})` : undefined, color: `var(${rarityStyle(r).cssVar})` }}>{tr(r)}</button>)}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1"><ProgressBar kind={ch.inventory.length >= cap ? 'bad' : 'accent'} value={ch.inventory.length} max={cap} label={`${ch.inventory.length} / ${cap}`} ariaLabel={tr('Inventory space')} /></div>
        <Button onClick={() => void run({ kind: 'expand_inventory' }, 'Inventory expanded')} disabled={ch.wallet.scrap < C.expansionCost(ch)}><CurrencyIcon kind="scrap" size={14} />{tr('Expand (+10)')} {C.expansionCost(ch).toLocaleString()}</Button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button pressed={multi} onClick={() => { setMulti((v) => !v); setPicked(new Set()); }}>{multi ? tr('Done selecting') : tr('Select several')}</Button>
        {multi && <><Button variant="ghost" onClick={() => setPicked(new Set(suggestDismantle(ch)))}>{tr('Select suggested')}</Button><Button variant="danger" disabled={picked.size === 0} onClick={() => setReview(true)}>{tr('Dismantle selected')} ({picked.size})</Button></>}
      </div>
    </div>
  );

  const grid = items.length === 0 ? <EmptyState icon="🎒" title={ch.inventory.length ? tr('No item matches the filters') : tr('Your inventory is empty')} text={ch.inventory.length ? tr('Change or clear the filters.') : tr('Nothing here yet. Enemies drop gear.')} /> : (
    <VirtualGrid items={items} cell={64} gap={6} height={mode === 'sheet' ? 170 : '100%'} className="min-h-[170px] flex-1" renderCell={(it) => {
      const info = describeItem(it);
      return (
        <Tooltip content={<><b style={{ color: info.color }}>{info.name}</b><div style={{ color: 'var(--c-text-3)' }}>{tr(it.rarity)}{C.isEquipped(ch, it.uid) ? ` · ${tr('equipped')}` : ''}</div></>}>
          <span style={{ opacity: multi && C.isEquipped(ch, it.uid) ? 0.4 : 1 }}><ItemCard rarity={it.rarity} name={info.name} icon={iconFor(it)} upgrade={it.upgrade} tier={info.def.tier} selected={multi ? picked.has(it.uid) : selected === it.uid || C.isEquipped(ch, it.uid)} locked={multi && C.isEquipped(ch, it.uid)} onClick={() => click(it.uid)} /></span>
        </Tooltip>
      );
    }} />
  );

  const detail = sel ? <ItemDetail ch={ch} item={sel} run={run} onWorkshop={onWorkshop} onDone={() => onSelect(null)} /> : <EmptyState icon="🔍" title={tr('Select an item')} text={tr('Stats, comparison and actions appear here.')} />;
  return (
    <div className={mode === 'sheet' ? 'grid gap-3' : 'grid gap-3 h-full min-h-0'} style={mode === 'sheet' ? undefined : { gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)' }}>
      <div className="flex flex-col gap-2 min-h-0 min-w-0">{toolbar}{grid}</div>
      {mode === 'sheet' ? <Modal open={!!sel} sheet onClose={() => onSelect(null)} title={sel ? describeItem(sel).name : ''} closeLabel={tr('Close')}>{detail}</Modal> : <div className="overflow-y-auto rounded-lg p-2" style={{ background: 'var(--c-bg-0)', border: '1px solid var(--c-line)' }}>{detail}</div>}
      <Modal open={review} onClose={() => setReview(false)} title={tr('Review before dismantling')} closeLabel={tr('Close')}
        footer={<><Button variant="ghost" onClick={() => setReview(false)}>{tr('Back')}</Button><Button variant="danger" loading={busy} disabled={rev.rows.length === 0} onClick={async () => { setBusy(true); for (const r of rev.rows) { const res = await run({ kind: 'dismantle', uid: r.uid }); if (!res.ok) break; } setBusy(false); setReview(false); setPicked(new Set()); setMulti(false); }}>{tr('Dismantle {n} items', { n: rev.rows.length })}</Button></>}>
        <div className="grid gap-1 max-h-60 overflow-y-auto" data-testid="dismantle-review">
          {rev.rows.map((r) => { const it = C.findItem(ch, r.uid)!; return (
            <label key={r.uid} className="flex items-center gap-2 text-sm py-1" style={{ borderBottom: '1px solid var(--c-line)' }}>
              <input type="checkbox" checked onChange={() => setPicked((p) => { const n = new Set(p); n.delete(r.uid); return n; })} aria-label={describeItem(it).name} />
              <span className="flex-1 min-w-0 truncate" style={{ color: describeItem(it).color }}>{describeItem(it).name}{r.upgrade ? ` +${r.upgrade}` : ''}</span>
              {r.risky && <span className="k-badge k-badge--warn">{tr('valuable')}</span>}
              <span className="text-[11px] tabular-nums" style={{ color: 'var(--c-text-2)' }}>{r.oreAmount} {tr(r.ore)} · {r.fragments} {tr('frag')}</span>
            </label>); })}
          {rev.rows.length === 0 && <EmptyState title={tr('Nothing selected')} />}
        </div>
        <p className="text-sm mt-2" style={{ color: 'var(--c-text-2)' }}>{tr('You get')}: {Object.entries(rev.totals).map(([k, n]) => `${n} ${tr(k)}`).join(', ')}{Object.keys(rev.totals).length ? ' + ' : ''}{rev.fragments} {tr('fragments')}. {tr('This cannot be undone.')}</p>
        {rev.rows.some((r) => r.risky) && <p className="text-sm" style={{ color: 'var(--c-warn)' }}>{tr('Some selected items are valuable (Rare or better, or upgraded). Untick them to keep them.')}</p>}
      </Modal>
    </div>
  );
};
