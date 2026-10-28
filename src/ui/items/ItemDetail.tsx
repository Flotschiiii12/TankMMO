import React, { useState } from 'react';
import { tr, nm } from '../../i18n.ts';
import * as C from '../../../shared/rules/character.ts';
import { ITEM_BY_ID } from '../../../shared/data/items.ts';
import type { ClientAction } from '../../../shared/rules/actions.ts';
import { describeItem } from '../../game/actions.ts';
import { FamilyIcon, SlotIcon, CurrencyIcon } from '../GameIcon.tsx';
import { Button } from '../kit/Button.tsx';
import { Modal } from '../kit/Modal.tsx';
import { ItemCard, AffixList } from '../kit/ItemCard.tsx';
import { StatRow } from '../kit/Currency.tsx';
import { Badge } from '../kit/Indicators.tsx';
import { previewEquip, canEquip } from '../hangar/hangarLogic.ts';
import { windows } from '../wm/windowStore.ts';
import { marketIntent } from './marketIntent.ts';

export const iconForDef = (d: { family: string; slotType: string }, size = 28): React.ReactNode => ['cannon', 'rapid_fire', 'rocket', 'mortar', 'railgun', 'flamethrower'].includes(d.family) ? <FamilyIcon family={d.family} size={size} /> : <SlotIcon slot={d.slotType} size={size - 2} />;
export const iconFor = (it: C.ItemInstance, size = 28): React.ReactNode => iconForDef(ITEM_BY_ID.get(it.defId)!, size);
type Run = (a: ClientAction, ok?: string) => Promise<{ ok: boolean; error?: string }>;

/** Detail panel of one item: stats, affixes, comparison with what is equipped, and the quick actions. */
export const ItemDetail: React.FC<{ ch: C.CharacterState; item: C.ItemInstance; run: Run; onWorkshop: () => void; onDone: () => void }> = ({ ch, item, run, onWorkshop, onDone }) => {
  const info = describeItem(item); const d = info.def; const m = C.itemStatMultiplier(item);
  const vehicleId = ch.activeVehicle; const equipped = C.isEquipped(ch, item.uid);
  const slots = C.slotKeysFor(vehicleId).filter((s) => s.type === d.slotType);
  const g = ch.garage.find((x) => x.vehicleId === vehicleId); const slotKey = (slots.find((s) => !g?.loadout[s.key]) ?? slots[0])?.key;
  const preview = !equipped && slotKey && canEquip(ch, vehicleId, d.slotType, item) ? previewEquip(ch, vehicleId, slotKey, item.uid) : undefined;
  const [confirm, setConfirm] = useState<'dismantle' | 'sell' | null>(null);
  const equippedSlot = Object.entries(g?.loadout ?? {}).find(([, u]) => u === item.uid)?.[0];
  const y = C.dismantleYieldOf(item);
  return (
    <div className="grid gap-3 text-sm" data-testid="item-detail">
      <div className="flex items-center gap-3">
        <ItemCard rarity={item.rarity} name={info.name} icon={iconFor(item, 34)} upgrade={item.upgrade} tier={d.tier} />
        <div className="min-w-0">
          <b className="block truncate" style={{ color: info.color }}>{info.name}</b>
          <div className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>{tr(item.rarity)} · {tr(d.slotType)} · {tr('needs level')} {d.minLevel}</div>
          <div className="flex gap-1 mt-1">{equipped && <Badge tone="good">{tr('equipped')}</Badge>}{item.bound && <Badge tone="warn">{tr('bound')}</Badge>}</div>
        </div>
      </div>
      {nm(d.descriptionKey, '') && <p className="text-[11px] italic" style={{ color: 'var(--c-text-3)' }}>{nm(d.descriptionKey, '')}</p>}
      <div>
        {d.baseDPS ? <StatRow label={d.slotType === 'drone' ? tr('Drone power') : tr('Damage')} value={Math.round(d.baseDPS * m)} /> : null}
        {d.baseHullBonus ? <StatRow label={tr('Hull')} value={Math.round(d.baseHullBonus * m)} /> : null}
        {d.baseArmorBonus ? <StatRow label={tr('Armor')} value={Math.round(d.baseArmorBonus * m)} /> : null}
        {d.baseSpeedBonus ? <StatRow label={tr('Speed')} value={Math.round(d.baseSpeedBonus * m)} /> : null}
        {d.baseFlatReduction ? <StatRow label={tr('Flat reduction')} value={Math.round(d.baseFlatReduction * m)} /> : null}
        <AffixList affixes={item.affixes.map((a) => ({ text: `${tr(a.stat.replace('_', ' '))} +${a.value}${a.stat === 'flat_reduction' ? '' : '%'}` }))} />
      </div>
      {preview && (
        <div className="rounded-lg p-2" style={{ background: 'var(--c-bg-0)', border: '1px solid var(--c-line)' }} data-testid="compare">
          <div className="text-[11px] mb-1" style={{ color: 'var(--c-text-2)' }}>{tr('Compared with your current loadout')} · {tr('Power rating')} {preview.powerBefore} → <b style={{ color: preview.powerAfter >= preview.powerBefore ? 'var(--c-good)' : 'var(--c-bad)' }}>{preview.powerAfter}</b></div>
          {preview.rows.filter((r) => r.before !== r.after).map((r) => <StatRow key={r.key} label={tr(r.label)} value={r.after} compareTo={r.before} unit={r.unit} percent={r.percent} lowerIsBetter={r.lowerIsBetter} digits={r.digits} />)}
          {preview.rows.every((r) => r.before === r.after) && <div className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>{tr('No change in stats')}</div>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {equipped ? <Button onClick={() => void run({ kind: 'unequip', vehicleId, slot: equippedSlot! }, 'Unequipped')}>{tr('Unequip')}</Button> : slotKey && <Button variant="primary" disabled={!canEquip(ch, vehicleId, d.slotType, item)} onClick={() => void run({ kind: 'equip', vehicleId, slot: slotKey, uid: item.uid }, 'Equipped')}>{tr('Equip')}</Button>}
        <Button onClick={onWorkshop}>{tr('Workshop')}</Button>
        {!equipped && !item.bound && <Button onClick={() => { marketIntent.set(item.uid); windows.open('market'); }}>{tr('List on market')}</Button>}
        {!equipped && <Button onClick={() => setConfirm('sell')}>{tr('Sell')} ({C.npcSellValue(item, ch)})</Button>}
        {!equipped && <Button variant="danger" onClick={() => setConfirm('dismantle')}>{tr('Dismantle')}</Button>}
      </div>
      <Modal open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === 'sell' ? tr('Sell to the vendor?') : tr('Dismantle this item?')} closeLabel={tr('Close')}
        footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>{tr('Cancel')}</Button><Button variant={confirm === 'sell' ? 'primary' : 'danger'} onClick={async () => { const k = confirm; setConfirm(null); if (k === 'sell') await run({ kind: 'sell_item', uid: item.uid }, 'Sold to vendor'); else await run({ kind: 'dismantle', uid: item.uid }, 'Dismantled'); onDone(); }}>{tr('Confirm')}</Button></>}>
        <b style={{ color: info.color }}>{info.name}</b>
        <p className="text-sm mt-2" style={{ color: 'var(--c-text-2)' }}>{confirm === 'sell' ? <>{tr('You get')} <CurrencyIcon kind="scrap" size={14} /> {C.npcSellValue(item, ch).toLocaleString()} {tr('scrap')}.</> : <>{tr('You get')} {y.oreAmount} {tr(y.ore)} {tr('ore')} + {y.fragments} {tr('fragments')}.</>} {(item.rarity !== 'Common' && item.rarity !== 'Uncommon') || item.upgrade > 0 ? <b style={{ color: 'var(--c-warn)' }}>{tr('This item is valuable. It cannot be restored.')}</b> : tr('It cannot be restored.')}</p>
      </Modal>
    </div>
  );
};
