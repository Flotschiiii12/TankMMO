import React, { useMemo, useState } from 'react';
import { tr } from '../../i18n.ts';
import * as C from '../../../shared/rules/character.ts';
import { CRAFTING_RECIPES, ITEM_BY_ID, UPGRADE_LEVEL_STATS } from '../../../shared/data/items.ts';
import type { ClientAction } from '../../../shared/rules/actions.ts';
import { describeItem, itemName } from '../../game/actions.ts';
import { Button } from '../kit/Button.tsx';
import { EmptyState } from '../kit/States.tsx';
import { ItemCard } from '../kit/ItemCard.tsx';
import { ProgressBar } from '../kit/Indicators.tsx';
import { Tabs } from '../kit/Tabs.tsx';
import { VirtualGrid } from '../kit/Virtual.tsx';
import { CurrencyIcon } from '../GameIcon.tsx';
import { iconFor, iconForDef } from './ItemDetail.tsx';
import { CostLine, craftStatus, fusionCandidates, fusionPreview, upgradePreview } from './itemsLogic.ts';

type Run = (a: ClientAction, ok?: string) => Promise<{ ok: boolean; error?: string }>;
const KIND_ICON: Record<string, string> = { scrap: 'scrap', fragments: 'fragments', iron: 'iron', copper: 'copper', titanium: 'titanium', crystal: 'crystal' };

/** One cost line: icon, need, and have when something is missing (red). */
const Cost: React.FC<{ line: CostLine }> = ({ line }) => (
  <span className="inline-flex items-center gap-1 text-[12px] tabular-nums" style={{ color: line.ok ? 'var(--c-text-2)' : 'var(--c-bad)', fontWeight: line.ok ? 400 : 700 }} data-ok={line.ok}>
    <CurrencyIcon kind={KIND_ICON[line.kind]} size={14} />{line.need.toLocaleString()}{!line.ok && <span> ({tr('you have')} {line.have.toLocaleString()})</span>}
  </span>
);
const costLines = (ch: C.CharacterState, c: { scrap: number; ore: number; fragments: number }): CostLine[] => {
  const ore = ch.wallet.ore.iron + ch.wallet.ore.copper + ch.wallet.ore.titanium + ch.wallet.ore.crystal;
  return [{ kind: 'scrap', need: c.scrap, have: ch.wallet.scrap, ok: ch.wallet.scrap >= c.scrap }, { kind: 'iron', need: c.ore, have: ore, ok: ore >= c.ore }, { kind: 'fragments', need: c.fragments, have: ch.wallet.fragments, ok: ch.wallet.fragments >= c.fragments }];
};

/** Workshop: upgrade (chance, costs, what a failure does), reroll, fusion, and the crafting browser. */
export const WorkshopTab: React.FC<{ ch: C.CharacterState; selected: string | null; onSelect: (uid: string | null) => void; run: Run }> = ({ ch, selected, onSelect, run }) => {
  const [sub, setSub] = useState<'upgrade' | 'reroll' | 'fusion' | 'craft'>(selected ? 'upgrade' : 'craft');
  const sel = selected ? C.findItem(ch, selected) : undefined;
  const picker = (
    <div className="rounded-lg p-1.5" style={{ background: 'var(--c-bg-0)', border: '1px solid var(--c-line)' }}>
      {ch.inventory.length === 0 ? <EmptyState icon="🔧" title={tr('Nothing to work on')} text={tr('Enemies drop gear, or craft it in the Craft tab.')} /> : <VirtualGrid items={ch.inventory} cell={56} gap={6} height={132} renderCell={(it) => <ItemCard rarity={it.rarity} name={describeItem(it).name} icon={iconFor(it, 24)} upgrade={it.upgrade} tier={ITEM_BY_ID.get(it.defId)?.tier} selected={selected === it.uid} onClick={() => onSelect(it.uid)} />} />}
    </div>
  );
  const needItem = <div className="grid gap-2"><p className="text-sm" style={{ color: 'var(--c-text-2)' }}>{tr('Choose an item to work on:')}</p>{picker}</div>;

  const upgrade = sel && (() => {
    const p = upgradePreview(ch, sel); const info = describeItem(sel); const cur = UPGRADE_LEVEL_STATS[sel.upgrade].statMult; const nxt = p.maxed ? cur : UPGRADE_LEVEL_STATS[p.next].statMult;
    return (
      <div className="grid gap-3" data-testid="upgrade-panel">
        <div className="flex items-center gap-3"><ItemCard rarity={sel.rarity} name={info.name} icon={iconFor(sel, 30)} upgrade={sel.upgrade} /><div><b style={{ color: info.color }}>{info.name}</b><div className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{p.maxed ? tr('Maximum level reached') : `+${sel.upgrade} → +${p.next} · ${tr('stats')} ×${cur.toFixed(2)} → ×${nxt.toFixed(2)}`}</div></div></div>
        {!p.maxed && (<>
          <div><div className="flex justify-between text-[12px]" style={{ color: 'var(--c-text-2)' }}><span>{tr('Success chance')}</span><b style={{ color: p.chance >= 1 ? 'var(--c-good)' : 'var(--c-warn)' }}>{Math.round(p.chance * 100)} %</b></div><ProgressBar kind={p.chance >= 1 ? 'hull' : 'warn'} value={p.chance} max={1} ariaLabel={tr('Success chance')} /></div>
          <div className="text-[12px]" style={{ color: p.failure === 'drop' ? 'var(--c-bad)' : 'var(--c-good)' }} data-testid="failure-note">{p.failure === 'drop' ? tr('If it fails you lose the materials and the item drops one level (never below +9).') : tr('This step cannot fail.')}</div>
          <div className="flex flex-wrap gap-3 items-center"><span className="text-[12px]" style={{ color: 'var(--c-text-3)' }}>{tr('Cost')}:</span>{costLines(ch, p.normal).map((l) => <Cost key={l.kind} line={l} />)}</div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="primary" disabled={!p.normal.canPay} onClick={() => void run({ kind: 'upgrade', uid: sel.uid }, 'Upgrade attempted')}>{tr('Upgrade')} +{p.next}</Button>
            {p.safe && <div className="grid gap-1"><Button disabled={!p.safe.canPay} onClick={() => void run({ kind: 'upgrade', uid: sel.uid, safe: true }, 'Safe upgrade attempted')}>{tr('Safe upgrade')}</Button><div className="flex gap-2">{costLines(ch, p.safe).map((l) => <Cost key={l.kind} line={l} />)}</div><span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>{tr('Costs more, never drops a level.')}</span></div>}
          </div>
        </>)}
      </div>
    );
  })();

  const reroll = sel && (() => {
    const cost = C.rerollCost(sel); const left = C.MAX_REROLLS - sel.rerolls; const lines: CostLine[] = [{ kind: 'scrap', need: cost.scrap, have: ch.wallet.scrap, ok: ch.wallet.scrap >= cost.scrap }, { kind: 'fragments', need: cost.fragments, have: ch.wallet.fragments, ok: ch.wallet.fragments >= cost.fragments }];
    return (
      <div className="grid gap-3" data-testid="reroll-panel">
        <div className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{tr('Replaces ONE affix with a new random one. Rerolls used')} {sel.rerolls}/{C.MAX_REROLLS}</div>
        <ProgressBar kind="accent" value={sel.rerolls} max={C.MAX_REROLLS} ariaLabel={tr('Rerolls used')} />
        {sel.affixes.length === 0 ? <EmptyState icon="∅" title={tr('This item has no affixes')} /> : sel.affixes.map((a, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg p-2" style={{ background: 'var(--c-bg-0)', border: '1px solid var(--c-line)' }}>
            <span className="flex-1" style={{ color: 'var(--c-info)' }}>{tr(a.stat.replace('_', ' '))} +{a.value}{a.stat === 'flat_reduction' ? '' : '%'}</span>
            <Button disabled={left <= 0 || !lines.every((l) => l.ok)} onClick={() => void run({ kind: 'reroll', uid: sel.uid, index: i }, 'Affix rerolled')}>{tr('Reroll')}</Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-3 items-center"><span className="text-[12px]" style={{ color: 'var(--c-text-3)' }}>{tr('Cost')}:</span>{lines.map((l) => <Cost key={l.kind} line={l} />)}</div>
        {left <= 0 && <div className="text-[12px]" style={{ color: 'var(--c-bad)' }}>{tr('No rerolls left on this item.')}</div>}
      </div>
    );
  })();

  const fusion = sel && (() => {
    const cand = fusionCandidates(ch, sel); const f = fusionPreview(sel);
    return (
      <div className="grid gap-3" data-testid="fusion-panel">
        <div className="flex gap-2 items-center">{[0, 1, 2].map((i) => cand[i] ? <ItemCard key={i} rarity={cand[i].rarity} name={describeItem(cand[i]).name} icon={iconFor(cand[i], 26)} /> : <ItemCard key={i} rarity="Common" name={tr('missing')} empty />)}<span aria-hidden>→</span><ItemCard rarity={f.nextRarity && cand.length >= 3 ? f.nextRarity : sel.rarity} name={describeItem(sel).name} icon={iconFor(sel, 26)} /></div>
        <p className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{tr('3 identical items (same item and rarity) become 1 item. Chance for the next rarity:')} <b style={{ color: f.chance > 0 ? 'var(--c-good)' : 'var(--c-text-3)' }}>{Math.round(f.chance * 100)} %</b>{f.nextRarity ? ` (${tr(f.nextRarity)})` : ` (${tr('already the highest rarity')})`}</p>
        <p className="text-[12px]" style={{ color: 'var(--c-warn)' }}>{tr('The 3 items are used up either way.')}</p>
        <Button variant="primary" disabled={cand.length < C.FUSION_INPUT_COUNT} onClick={() => void run({ kind: 'fuse', uids: cand.slice(0, 3).map((i) => i.uid) }, 'Fusion done').then(() => onSelect(null))}>{tr('Fuse 3 identical')} ({cand.length}/{C.FUSION_INPUT_COUNT})</Button>
      </div>
    );
  })();

  const craft = <CraftBrowser ch={ch} run={run} />;
  const body = sub === 'craft' ? craft : !sel ? needItem : sub === 'upgrade' ? upgrade : sub === 'reroll' ? reroll : fusion;
  return (
    <div className="grid gap-3">
      <Tabs label={tr('Workshop')} value={sub} onChange={(v) => setSub(v as typeof sub)} tabs={[{ id: 'upgrade', label: tr('Upgrade') }, { id: 'reroll', label: tr('Reroll') }, { id: 'fusion', label: tr('Fusion') }, { id: 'craft', label: tr('Craft') }]} />
      {sub !== 'craft' && sel && <details><summary className="text-[12px] cursor-pointer" style={{ color: 'var(--c-text-2)' }}>{tr('Change item')}</summary>{picker}</details>}
      {body}
    </div>
  );
};

const CraftBrowser: React.FC<{ ch: C.CharacterState; run: Run }> = ({ ch, run }) => {
  const [onlyCraftable, setOnly] = useState(false); const [search, setSearch] = useState('');
  const rows = useMemo(() => CRAFTING_RECIPES.filter((r) => r.minLevel <= ch.level + 10).map((r) => ({ r, def: ITEM_BY_ID.get(r.outputItemId)!, st: craftStatus(ch, r) })).filter((x) => (!onlyCraftable || x.st.canCraft) && (!search || itemName(x.def).toLowerCase().includes(search.toLowerCase()))).sort((a, b) => Number(b.st.canCraft) - Number(a.st.canCraft) || a.st.missing - b.st.missing || a.r.minLevel - b.r.minLevel), [ch, onlyCraftable, search]);
  return (
    <div className="grid gap-2" data-testid="craft-browser">
      <div className="flex gap-2 flex-wrap items-center">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr('Search recipes')} aria-label={tr('Search recipes')} className="flex-1 min-w-[8rem] k-field" />
        <Button pressed={onlyCraftable} onClick={() => setOnly((v) => !v)}>{tr('Can craft now')}</Button>
      </div>
      {rows.length === 0 ? <EmptyState icon="🔨" title={tr('No recipes match')} text={onlyCraftable ? tr('Collect more materials or switch the filter off.') : undefined} /> : (
        <div className="grid gap-1.5 md:grid-cols-2">
          {rows.map(({ r, def, st }) => (
            <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--c-bg-1)', border: `1px solid ${st.canCraft ? 'var(--accent-line)' : 'var(--c-line)'}` }}>
              <ItemCard rarity={def.baseRarity} name={itemName(def)} icon={iconForDef(def, 28)} tier={def.tier} />
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[13px]">{itemName(def)}</b>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5"><span className="text-[11px]" style={{ color: st.levelOk ? 'var(--c-text-3)' : 'var(--c-bad)' }}>Lv {r.minLevel}</span>{st.lines.map((l) => <Cost key={l.kind} line={l} />)}</div>
              </div>
              <Button variant={st.canCraft ? 'primary' : 'secondary'} disabled={!st.canCraft} title={!st.levelOk ? tr('Level too low') : st.inventoryFull ? tr('Inventory full') : st.missing ? tr('Missing materials') : undefined} onClick={() => void run({ kind: 'craft', recipeId: r.id }, 'Crafted')}>{tr('Craft')}</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
