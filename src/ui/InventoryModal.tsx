import React, { useMemo, useState } from 'react';
import { tr, T, nm } from '../i18n.ts';
import { RarityGem, CurrencyIcon, SlotIcon, FamilyIcon } from './GameIcon.tsx';
import { X, Package } from 'lucide-react';
import { UserProfile } from '../save/profile.ts';
import { soundEngine } from '../audio/soundEngine.ts';
import { describeItem, errorText, itemName } from '../game/actions.ts';
import { ITEM_BY_ID, CRAFTING_RECIPES, UPGRADE_LEVEL_STATS } from '../../shared/data/items.ts';
import * as C from '../../shared/rules/character.ts';
import type { ClientAction } from '../../shared/rules/actions.ts';

interface InventoryModalProps {
  profile: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: ClientAction) => Promise<{ ok: boolean; error?: string }>;
}

const SLOT_FILTERS = ['all', 'main', 'secondary', 'armor', 'engine', 'module', 'drone'] as const;

export const InventoryModal: React.FC<InventoryModalProps> = ({ profile, isOpen, onClose, onAction }) => {
  const [tab, setTab] = useState<'gear' | 'craft'>('gear');
  const [filter, setFilter] = useState<(typeof SLOT_FILTERS)[number]>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const ch = profile.character;
  const vehicleId = ch.activeVehicle;
  const slots = useMemo(() => C.slotKeysFor(vehicleId), [vehicleId]);
  const stats = C.computeLoadoutStats(ch);
  if (!isOpen) return null;

  const run = async (action: ClientAction, ok?: string) => {
    soundEngine.playUIClick();
    const r = await onAction(action);
    setMsg(r.ok ? (ok ? tr(ok) : '') : errorText(r.error || 'failed'));
    return r;
  };

  const items = [...ch.inventory]
    .filter((i) => filter === 'all' || ITEM_BY_ID.get(i.defId)!.slotType === filter)
    .sort((a, b) => C.RARITIES.indexOf(b.rarity) - C.RARITIES.indexOf(a.rarity) || b.upgrade - a.upgrade);
  const sel = selected ? C.findItem(ch, selected) : undefined;
  const selInfo = sel ? describeItem(sel) : undefined;
  const equippedSlot = sel ? slots.find((s) => C.findItem(ch, ch.garage.find((g) => g.vehicleId === vehicleId)?.loadout[s.key] ?? '')?.uid === sel.uid) : undefined;

  const equipSel = () => {
    if (!sel || !selInfo) return;
    const candidates = slots.filter((s) => s.type === selInfo.def.slotType);
    const g = ch.garage.find((x) => x.vehicleId === vehicleId)!;
    const target = candidates.find((s) => !g.loadout[s.key]) || candidates[0];
    if (!target) return setMsg(tr('This vehicle has no matching slot'));
    void run({ kind: 'equip', vehicleId, slot: target.key, uid: sel.uid }, T('Equipped'));
  };

  const fusionCandidates = sel ? ch.inventory.filter((i) => i.defId === sel.defId && i.rarity === sel.rarity && !C.isEquipped(ch, i.uid)) : [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-5xl max-h-[96vh] flex flex-col p-4 text-slate-200 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Package className="text-orange-500" size={18} />
            <h3 className="font-semibold text-white text-sm">{tr('Loadout & Workshop')}</h3>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-400 tabular-nums">
            <span><CurrencyIcon kind="scrap" /> {tr('Scrap')} <b className="text-white">{ch.wallet.scrap.toLocaleString()}</b></span>
            <span><CurrencyIcon kind="iron" /> {tr('Iron')} <b className="text-white">{ch.wallet.ore.iron}</b></span>
            <span><CurrencyIcon kind="copper" /> {tr('Copper')} <b className="text-white">{ch.wallet.ore.copper}</b></span>
            <span><CurrencyIcon kind="titanium" /> {tr('Titanium')} <b className="text-white">{ch.wallet.ore.titanium}</b></span>
            <span><CurrencyIcon kind="crystal" /> {tr('Crystal')} <b className="text-white">{ch.wallet.ore.crystal}</b></span>
            <span><CurrencyIcon kind="fragments" /> {tr('Fragments')} <b className="text-white">{ch.wallet.fragments}</b></span>
            <button onClick={() => { soundEngine.playUIClick(); onClose(); }} className="text-slate-400 hover:text-white"><X size={18} /></button>
          </div>
        </div>

        <div className="flex gap-2 mt-2 text-xs">
          {(['gear', 'craft'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 rounded ${tab === t ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>{t === 'gear' ? tr('Gear') : tr('Craft')}</button>
          ))}
          {ch.season.skins.length > 0 && (
            <select value={ch.activeSkin ?? ''} onChange={(e) => void run({ kind: 'set_skin', skin: e.target.value || null }, T('Skin changed'))} className="px-2 py-1 rounded bg-slate-800 text-slate-200">
              <option value="">{tr('No skin')}</option>
              {ch.season.skins.map((k) => <option key={k} value={k}>{k.replace('skin_season_', '')}</option>)}
            </select>
          )}
          {msg && <span className="ml-auto text-[11px] text-orange-300 self-center">{msg}</span>}
        </div>

        {tab === 'gear' && (
          <div className="grid grid-cols-12 gap-3 mt-2 min-h-0 flex-1 overflow-hidden">
            {/* Vehicle slots + stats */}
            <div className="col-span-4 overflow-y-auto space-y-1.5 pr-1">
              {stats && (
                <div className="text-[11px] grid grid-cols-2 gap-x-3 gap-y-0.5 p-2 rounded bg-slate-950/50 border border-slate-800 tabular-nums">
                  <span>{tr('Hull')} <b className="text-white">{stats.maxHull.toLocaleString()}</b></span>
                  <span>{tr('Armor')} <b className="text-white">{stats.maxArmor.toLocaleString()}</b></span>
                  <span>{tr('Damage')} <b className="text-white">{stats.mainDamage}</b></span>
                  <span>{tr('Reload')} <b className="text-white">{stats.mainReloadTime}s</b></span>
                  <span>{tr('Range')} <b className="text-white">{stats.mainRange}</b></span>
                  <span>{tr('Speed')} <b className="text-white">{stats.maxSpeed}</b></span>
                  <span>{tr('Crit')} <b className="text-white">{Math.round(stats.critChance * 100)}%</b></span>
                  <span>{tr('Reduction')} <b className="text-white">{stats.flatReduction}</b></span>
                </div>
              )}
              {slots.map((s) => {
                const g = ch.garage.find((x) => x.vehicleId === vehicleId)!;
                const it = g.loadout[s.key] ? C.findItem(ch, g.loadout[s.key]) : undefined;
                const info = it ? describeItem(it) : undefined;
                return (
                  <div key={s.key} className="flex items-center justify-between p-2 rounded bg-slate-950/40 border border-slate-800/80 text-xs">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase text-slate-500 flex items-center gap-1"><SlotIcon slot={s.key} />{s.key}</div>
                      <button disabled={!it} onClick={() => it && setSelected(it.uid)} className="truncate text-left" style={{ color: info?.color || '#64748b' }}>{info ? info.name : tr('empty')}</button>
                    </div>
                    {it && <button onClick={() => run({ kind: 'unequip', vehicleId, slot: s.key })} className="text-[11px] text-slate-400 hover:text-white">{tr('Unequip')}</button>}
                  </div>
                );
              })}
            </div>

            {/* Item list */}
            <div className="col-span-4 flex flex-col min-h-0">
              <div className="flex gap-1 flex-wrap mb-1">
                {SLOT_FILTERS.map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={`px-2 py-0.5 rounded text-[11px] capitalize border inline-flex items-center gap-1 ${filter === f ? 'border-orange-500/70 text-orange-300' : 'border-slate-800 text-slate-400'}`}>{f !== 'all' && <SlotIcon slot={f} size={12} />}{f}</button>
                ))}
              </div>
              <div className="text-[11px] text-slate-500 mb-1">{ch.inventory.length} / {C.inventoryCapacity(ch)} slots
                <button onClick={() => run({ kind: 'expand_inventory' }, T('Inventory expanded'))} className="ml-2 text-orange-400 hover:text-orange-300">{tr('Expand (+10)')} {C.expansionCost(ch).toLocaleString()} {tr('scrap')}</button>
              </div>
              <div className="overflow-y-auto space-y-1 pr-1">
                {items.length === 0 && <div className="text-xs text-slate-500 p-3">{tr('Nothing here yet. Enemies drop gear.')}</div>}
                {items.map((it) => {
                  const info = describeItem(it);
                  const eq = C.isEquipped(ch, it.uid);
                  return (
                    <button key={it.uid} onClick={() => setSelected(it.uid)} className={`w-full flex items-center justify-between p-2 rounded border text-left text-xs ${selected === it.uid ? 'border-orange-500/70 bg-orange-500/10' : 'border-slate-800 bg-slate-900/40'}`}>
                      <span className="truncate flex items-center gap-1" style={{ color: info.color }}><RarityGem rarity={it.rarity} /><FamilyIcon family={info.def.family} />{info.name}</span>
                      <span className="text-[11px] text-slate-500 shrink-0 ml-2">{eq ? tr('equipped') + ' · ' : ''}{it.rarity}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected item */}
            <div className="col-span-4 overflow-y-auto p-2 rounded bg-slate-950/40 border border-slate-800 text-xs">
              {!sel || !selInfo ? (
                <div className="text-slate-500">{tr('Select an item.')}</div>
              ) : (
                <div className="space-y-2">
                  <div>
                    <div className="text-sm font-semibold flex items-center gap-1" style={{ color: selInfo.color }}><RarityGem rarity={sel.rarity} size={18} />{selInfo.name}</div>
                    <div className="text-[11px] text-slate-400">{tr(sel.rarity)} · {tr(selInfo.def.slotType)} · {tr('needs level')} {selInfo.def.minLevel}</div>
                  </div>
                  <div className="text-[11px] text-slate-400 italic">{nm(selInfo.def.descriptionKey, '')}</div>
                  <div className="text-[11px] text-slate-300 space-y-0.5">
                    {selInfo.def.baseDPS ? <div>{selInfo.def.slotType === 'drone' ? tr('Drone power') : tr('Damage')} {Math.round(selInfo.def.baseDPS * C.itemStatMultiplier(sel))}</div> : null}
                    {selInfo.def.baseHullBonus ? <div>{tr('Hull')} +{Math.round(selInfo.def.baseHullBonus * C.itemStatMultiplier(sel))}</div> : null}
                    {selInfo.def.baseArmorBonus ? <div>{tr('Armor')} +{Math.round(selInfo.def.baseArmorBonus * C.itemStatMultiplier(sel))}</div> : null}
                    {selInfo.def.baseFlatReduction ? <div>{tr('Flat reduction')} {Math.round(selInfo.def.baseFlatReduction * C.itemStatMultiplier(sel))}</div> : null}
                    {selInfo.def.baseSpeedBonus ? <div>{tr('Speed')} +{Math.round(selInfo.def.baseSpeedBonus * C.itemStatMultiplier(sel))}</div> : null}
                    {sel.affixes.map((a, i) => (
                      <div key={i} className="flex items-center justify-between text-sky-300">
                        <span>{tr(a.stat.replace('_', ' '))} +{a.value}{a.stat === 'flat_reduction' ? '' : '%'}</span>
                        <button onClick={() => run({ kind: 'reroll', uid: sel.uid, index: i }, T('Affix rerolled'))} className="text-[11px] text-slate-400 hover:text-white">{tr('reroll')} ({C.rerollCost(sel).scrap})</button>
                      </div>
                    ))}
                    <div className="text-[11px] text-slate-500">{tr('Rerolls used')} {sel.rerolls}/{C.MAX_REROLLS}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {!equippedSlot && <button onClick={equipSel} className="px-2 py-1 rounded bg-emerald-600/80 text-white">{tr('Equip')}</button>}
                    {sel.upgrade < C.MAX_UPGRADE && (() => {
                      const c1 = C.upgradeCost(sel.upgrade, false, selInfo.def.tier);
                      const chance = Math.round(UPGRADE_LEVEL_STATS[sel.upgrade + 1].successChance * 100);
                      return (
                        <>
                          <button onClick={() => run({ kind: 'upgrade', uid: sel.uid }, T('Upgrade attempted'))} className="px-2 py-1 rounded bg-orange-600/80 text-white">{tr('Upgrade')} +{sel.upgrade + 1} ({chance}%)</button>
                          {sel.upgrade >= 9 && <button onClick={() => run({ kind: 'upgrade', uid: sel.uid, safe: true }, T('Safe upgrade attempted'))} className="px-2 py-1 rounded bg-sky-700/80 text-white">{tr('Safe mode')}</button>}
                          <span className="w-full text-[11px] text-slate-500">{tr('Cost')} {c1.scrap.toLocaleString()} {tr('scrap')}, {c1.ore} {tr('ore')}, {c1.fragments} {tr('fragments')}</span>
                        </>
                      );
                    })()}
                    {!C.isEquipped(ch, sel.uid) && <button onClick={() => { void run({ kind: 'sell_item', uid: sel.uid }, T('Sold to vendor')); setSelected(null); }} className="px-2 py-1 rounded bg-slate-700 text-white">Sell ({C.npcSellValue(sel, ch)})</button>}
                    {!C.isEquipped(ch, sel.uid) && <button onClick={() => { run({ kind: 'dismantle', uid: sel.uid }, T('Dismantled')); setSelected(null); }} className="px-2 py-1 rounded bg-rose-700/70 text-white">{tr('Dismantle')}</button>}
                  </div>
                  {fusionCandidates.length >= 3 && (
                    <button onClick={() => { const uids = fusionCandidates.slice(0, 3).map((i) => i.uid); run({ kind: 'fuse', uids }, T('Fusion done')); setSelected(null); }} className="px-2 py-1 rounded bg-violet-700/80 text-white">{tr('Fuse 3 identical')} ({fusionCandidates.length} {tr('available')})</button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'craft' && (
          <div className="mt-2 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-1.5 pr-1">
            {CRAFTING_RECIPES.filter((r) => r.minLevel <= ch.level + 10).map((r) => {
              const def = ITEM_BY_ID.get(r.outputItemId)!;
              const locked = ch.level < r.minLevel;
              return (
                <div key={r.id} className="flex items-center justify-between p-2 rounded border border-slate-800 bg-slate-900/40 text-xs">
                  <div>
                    <div className="text-white">{itemName(def)}</div>
                    <div className="text-[11px] text-slate-500">Lv {r.minLevel} · {r.costScrap} {tr('scrap')} · {Object.entries(r.costOre).map(([k, v]) => `${v} ${tr(k)}`).join(', ')} · {r.costFragments} {tr('frag')}</div>
                  </div>
                  <button disabled={locked} onClick={() => run({ kind: 'craft', recipeId: r.id }, T('Crafted'))} className={`px-2 py-1 rounded ${locked ? 'bg-slate-800 text-slate-600' : 'bg-orange-600/80 text-white'}`}>{tr('Craft')}</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
