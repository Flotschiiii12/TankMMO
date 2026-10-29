import React, { useMemo, useState } from 'react';
import { tr, nm } from '../../i18n.ts';
import * as C from '../../../shared/rules/character.ts';
import { ITEM_BY_ID } from '../../../shared/data/items.ts';
import { VEHICLE_CATALOG } from '../../../shared/data/vehicles.ts';
import type { ClientAction } from '../../../shared/rules/actions.ts';
import { UserProfile } from '../../save/profile.ts';
import { VEHICLE_TIERS } from '../../data/vehicles.ts';
import { describeItem, errorText } from '../../game/actions.ts';
import { soundEngine } from '../../audio/soundEngine.ts';
import { FamilyIcon, SlotIcon, VehicleClassIcon } from '../GameIcon.tsx';
import { Button } from '../kit/Button.tsx';
import { ProgressBar } from '../kit/Indicators.tsx';
import { StatRow } from '../kit/Currency.tsx';
import { ItemCard, AffixList } from '../kit/ItemCard.tsx';
import { Modal } from '../kit/Modal.tsx';
import { EmptyState } from '../kit/States.tsx';
import { SegmentedControl } from '../kit/Tabs.tsx';
import { Tooltip } from '../kit/Tooltip.tsx';
import { VirtualGrid } from '../kit/Virtual.tsx';
import { useWindowMode } from '../wm/useWindows.ts';
import { prefersReducedMotion } from '../motion/motion.ts';
import { graphicsQualityFor } from '../perfMonitor.ts';
import { HangarPreview } from './HangarPreview.tsx';
import { VehicleCarousel, lockReasons, unlocksLine } from './VehicleCarousel.tsx';
import { Loadout, PRESET_SLOTS, Plan, bestLoadout, canEquip, currentLoadout, currentPreview, emptyLoadout, equippedElsewhere, itemScore, loadPresets, planLoadout, previewEquip, savePreset } from './hangarLogic.ts';

export type HangarSubView = 'vehicle' | 'loadout' | 'stats';
type Run = (a: ClientAction) => Promise<{ ok: boolean; error?: string }>;
const DRAG_MIME = 'application/x-treadfront-item';
const slotLabel = (key: string) => tr(key.replace(/\d+$/, '')) + (/\d+$/.test(key) ? ` ${Number(key.match(/\d+$/)![0]) + 1}` : '');

function itemTip(it: C.ItemInstance): React.ReactNode {
  const info = describeItem(it); const m = C.itemStatMultiplier(it); const d = info.def;
  return (
    <div className="grid gap-0.5">
      <b style={{ color: info.color }}>{info.name}</b>
      <span style={{ color: 'var(--c-text-3)' }}>{tr(it.rarity)} · {tr(d.slotType)} · {tr('needs level')} {d.minLevel}</span>
      {d.baseDPS ? <span>{d.slotType === 'drone' ? tr('Drone power') : tr('Damage')} {Math.round(d.baseDPS * m)}</span> : null}
      {d.baseHullBonus ? <span>{tr('Hull')} +{Math.round(d.baseHullBonus * m)}</span> : null}
      {d.baseArmorBonus ? <span>{tr('Armor')} +{Math.round(d.baseArmorBonus * m)}</span> : null}
      {d.baseSpeedBonus ? <span>{tr('Speed')} +{Math.round(d.baseSpeedBonus * m)}</span> : null}
      {d.baseFlatReduction ? <span>{tr('Flat reduction')} {Math.round(d.baseFlatReduction * m)}</span> : null}
      <AffixList affixes={it.affixes.map((a) => ({ text: `${tr(a.stat.replace('_', ' '))} +${a.value}${a.stat === 'flat_reduction' ? '' : '%'}` }))} />
    </div>
  );
}
const iconFor = (it: C.ItemInstance) => { const d = ITEM_BY_ID.get(it.defId)!; return d.family && ['cannon', 'rapid_fire', 'rocket', 'mortar', 'railgun', 'flamethrower'].includes(d.family) ? <FamilyIcon family={d.family} size={28} /> : <SlotIcon slot={d.slotType} size={26} />; };

/**
 * The hangar: carousel of all 50 vehicles, a stage with the vehicle and its slots around it (drag and drop or tap to assign),
 * live stat preview with green/red deltas, power rating, equip best / unequip all, 3 loadout presets and the skin picker.
 * Phones get three views (Vehicle, Loadout, Stats) because everything does not fit at once; larger windows show all three.
 */
export const HangarView: React.FC<{ profile: UserProfile; onAction: Run; onMessage: (m: string) => void; view?: HangarSubView; onView?: (v: HangarSubView) => void }> = ({ profile, onAction, onMessage, view: viewProp, onView }) => {
  const ch = profile.character; const mode = useWindowMode();
  const graphicsQuality = graphicsQualityFor(profile.settings);
  const reducedMotion = !!profile.settings.reduceMotion || prefersReducedMotion() || graphicsQuality === 'low' || graphicsQuality === 'off';
  const previewEffects = !reducedMotion && (graphicsQuality === 'high' || graphicsQuality === 'medium');
  const [selectedId, setSelectedId] = useState(ch.activeVehicle);
  const vehicle = VEHICLE_TIERS.find((v) => v.id === selectedId) ?? VEHICLE_TIERS[0];
  const meta = VEHICLE_CATALOG.find((v) => v.id === vehicle.id)!;
  const [classFilter, setClassFilter] = useState<string>(vehicle.vehicleClass);
  const [viewState, setViewState] = useState<HangarSubView>('loadout');
  const view = viewProp ?? viewState; const setView = onView ?? setViewState;
  const [selSlot, setSelSlot] = useState<string | null>(null); const [selItem, setSelItem] = useState<string | null>(null); const [hover, setHover] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'best' | 'none' | null>(null); const [busy, setBusy] = useState(false); const [dragOver, setDragOver] = useState<string | null>(null);
  const [presetIdx, setPresetIdx] = useState(0); const [presets, setPresets] = useState(loadPresets);

  const owned = ch.garage.some((g) => g.vehicleId === vehicle.id); const active = ch.activeVehicle === vehicle.id;
  const slots = useMemo(() => C.slotKeysFor(vehicle.id), [vehicle.id]);
  const loadout = currentLoadout(ch, vehicle.id);
  const stats = owned ? C.computeLoadoutStats(ch, vehicle.id) : undefined;
  const selSlotType = slots.find((s) => s.key === selSlot)?.type;

  const items = useMemo(() => ch.inventory.filter((i) => { const d = ITEM_BY_ID.get(i.defId); return d && (!selSlotType || d.slotType === selSlotType) && slots.some((s) => s.type === d.slotType); }).sort((a, b) => itemScore(b) - itemScore(a)), [ch.inventory, selSlotType, slots]);

  /** slot an item would go into: the selected slot if it fits, else the first empty compatible one, else the first compatible */
  const targetSlotFor = (uid: string): string | undefined => {
    const it = C.findItem(ch, uid); const type = it && ITEM_BY_ID.get(it.defId)?.slotType; if (!type) return undefined;
    if (selSlot && slots.find((s) => s.key === selSlot)?.type === type) return selSlot;
    const fit = slots.filter((s) => s.type === type); return (fit.find((s) => !loadout[s.key]) ?? fit[0])?.key;
  };
  const previewItem = hover ?? selItem; const previewSlot = previewItem ? targetSlotFor(previewItem) : undefined;
  const preview = !owned ? undefined : previewItem && previewSlot ? previewEquip(ch, vehicle.id, previewSlot, previewItem) : currentPreview(ch, vehicle.id);

  const exec = async (plan: Plan) => {
    setBusy(true);
    for (const a of plan.actions) { const r = await onAction(a); if (!r.ok) { onMessage(errorText(r.error || 'failed')); setBusy(false); return false; } }
    onMessage(plan.skipped.length ? tr('{n} items could not be equipped and were skipped', { n: plan.skipped.length }) : '');
    setBusy(false); return true;
  };
  const equipTo = async (uid: string, slot: string) => {
    const it = C.findItem(ch, uid); const type = slots.find((s) => s.key === slot)?.type;
    if (!it || !type || !canEquip(ch, vehicle.id, type, it)) { onMessage(errorText(equippedElsewhere(ch, vehicle.id, uid) ? 'already_equipped' : 'wrong_slot_type')); return; }
    soundEngine.playUIClick();
    const target: Loadout = { ...loadout }; const from = Object.entries(loadout).find(([, v]) => v === uid)?.[0];
    if (from && from !== slot) target[from] = loadout[slot] ?? null; // dropping an equipped item on another slot swaps them
    target[slot] = uid; setSelItem(null); setHover(null);
    await exec(planLoadout(ch, vehicle.id, target));
  };
  const unequipSlot = async (slot: string) => { soundEngine.playUIClick(); await exec({ actions: [{ kind: 'unequip', vehicleId: vehicle.id, slot }], skipped: [] }); };

  const onSlotClick = (key: string, type: string) => {
    if (!owned) return;
    if (selItem) { const it = C.findItem(ch, selItem); if (it && ITEM_BY_ID.get(it.defId)?.slotType === type) { void equipTo(selItem, key); return; } }
    setSelSlot(selSlot === key ? null : key); setSelItem(null);
  };
  const onItemClick = (uid: string) => {
    if (selSlot) { const it = C.findItem(ch, uid); if (it && ITEM_BY_ID.get(it.defId)?.slotType === selSlotType) { void equipTo(uid, selSlot); return; } }
    setSelItem(selItem === uid ? null : uid);
  };

  const bestPlan = useMemo(() => planLoadout(ch, vehicle.id, bestLoadout(ch, vehicle.id)), [ch, vehicle.id]);
  const nonePlan = useMemo(() => planLoadout(ch, vehicle.id, emptyLoadout(vehicle.id)), [ch, vehicle.id]);
  const power = preview?.powerAfter ?? 0;

  // ------------------------------------------------------------- panels
  const carousel = <VehicleCarousel ch={ch} selectedId={vehicle.id} classFilter={classFilter} onClass={setClassFilter} onSelect={(id) => { setSelectedId(id); setSelSlot(null); setSelItem(null); if (mode === 'sheet') setView('loadout'); }} />;

  const slotCard = (s: { key: string; type: string }) => {
    const uid = loadout[s.key]; const it = uid ? C.findItem(ch, uid) : undefined; const info = it ? describeItem(it) : undefined;
    const card = it && info
      ? <ItemCard rarity={it.rarity} name={info.name} icon={iconFor(it)} upgrade={it.upgrade} tier={info.def.tier} selected={selSlot === s.key} onClick={() => onSlotClick(s.key, s.type)} />
      : <ItemCard rarity="Common" name={`${slotLabel(s.key)} (${tr('empty')})`} slot={s.type} empty selected={selSlot === s.key} locked={!owned} onClick={() => onSlotClick(s.key, s.type)} />;
    return (
      <div key={s.key} className="flex flex-col items-center gap-0.5" data-slot={s.key}
        onDragOver={(e) => { if (owned && e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); setDragOver(s.key); } }} onDragLeave={() => setDragOver((d) => (d === s.key ? null : d))}
        onDrop={(e) => { e.preventDefault(); setDragOver(null); const u = e.dataTransfer.getData(DRAG_MIME); if (u) void equipTo(u, s.key); setHover(null); }}
        style={dragOver === s.key ? { outline: '2px dashed var(--accent)', outlineOffset: 2, borderRadius: 12 } : undefined}>
        <Tooltip content={it ? itemTip(it) : `${slotLabel(s.key)} · ${tr('empty')}`}><span draggable={!!uid} onDragStart={(e) => { if (uid) { e.dataTransfer.setData(DRAG_MIME, uid); e.dataTransfer.effectAllowed = 'move'; setHover(uid); } }} onDragEnd={() => setHover(null)}>{card}</span></Tooltip>
        <span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>{slotLabel(s.key)}</span>
      </div>
    );
  };
  const group = (types: string[]) => slots.filter((s) => types.includes(s.type)).map(slotCard);

  const stage = (
    <div className="flex flex-col gap-2 min-w-0 min-h-0">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2"><VehicleClassIcon vehicleClass={vehicle.vehicleClass} size={22} /><div className="min-w-0"><h3 className="font-bold text-base truncate">{vehicle.name}</h3><div className="text-[11px]" style={{ color: 'var(--accent-2)' }}>{tr(vehicle.vehicleClass.charAt(0).toUpperCase() + vehicle.vehicleClass.slice(1))} · {tr('Tier ')}{vehicle.tier} · {tr('Min Level')} {meta.minLevel}</div></div></div>
        {active ? <span className="k-badge k-badge--good">{tr('Deployed')}</span> : owned ? <Button onClick={() => { soundEngine.playUIClick(); void onAction({ kind: 'set_vehicle', vehicleId: vehicle.id }); }}>{tr('Deploy Vehicle')}</Button> : (
          <Button variant="primary" disabled={lockReasons(ch, vehicle.id).length > 0} onClick={async () => { soundEngine.playUIClick(); const r = await onAction({ kind: 'buy_vehicle', vehicleId: vehicle.id }); onMessage(r.ok ? '' : errorText(r.error || 'failed')); }}>{tr('Unlock')} ({meta.costScrap.toLocaleString()} {tr('Scrap')} · {Math.round(meta.costOre).toLocaleString()} {tr('Ore')})</Button>
        )}
      </div>
      {!owned && <div className="text-[11px]" style={{ color: 'var(--c-warn)' }}>{lockReasons(ch, vehicle.id).join(' · ') || tr('Ready to unlock')} — {unlocksLine(vehicle.id)}</div>}
      {mode === 'sheet' ? (
        <div className="grid gap-2 items-start" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)' }}>
          <div className="rounded-xl overflow-hidden h-28" style={{ background: 'radial-gradient(circle at 50% 45%, var(--c-bg-3), var(--c-bg-0))', border: '1px solid var(--c-line)' }} data-testid="hangar-stage">
            <HangarPreview vehicle={vehicle} level={ch.level} drones={owned ? stats?.drones : undefined} skin={active ? ch.activeSkin : undefined} reduceMotion={reducedMotion} effects={previewEffects} />
          </div>
          <div className="flex flex-wrap gap-2 justify-start">{slots.map(slotCard)}</div>
        </div>
      ) : (
      <div className="grid gap-2 items-center" style={{ gridTemplateColumns: 'auto 1fr auto', gridTemplateRows: 'auto 1fr auto' }}>
        <div className="col-span-3 flex justify-center gap-2 flex-wrap">{group(['main', 'secondary'])}</div>
        <div className="flex flex-col gap-2">{group(['armor', 'engine'])}</div>
        <div className="relative rounded-xl overflow-hidden h-[9.5rem] md:h-48" style={{ background: 'radial-gradient(circle at 50% 45%, var(--c-bg-3), var(--c-bg-0))', border: '1px solid var(--c-line)' }} data-testid="hangar-stage">
          <HangarPreview vehicle={vehicle} level={ch.level} drones={owned ? stats?.drones : undefined} skin={active ? ch.activeSkin : undefined} reduceMotion={reducedMotion} effects={previewEffects} />
        </div>
        <div className="flex flex-col gap-2">{group(['module'])}</div>
        <div className="col-span-3 flex justify-center gap-2 flex-wrap">{group(['drone'])}</div>
      </div>
      )}
      {owned && (
        <div className="flex flex-col gap-1.5 min-h-0">
          <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--c-text-2)' }}>
            <span>{selSlot ? `${slotLabel(selSlot)}: ${tr('tap an item to equip it')}` : tr('Drag an item onto a slot, or tap a slot and then an item')}</span>
            {selSlot && <button type="button" className="underline" onClick={() => setSelSlot(null)}>{tr('Show all')}</button>}
          </div>
          <div onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_MIME)) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); const u = e.dataTransfer.getData(DRAG_MIME); const slot = Object.entries(loadout).find(([, v]) => v === u)?.[0]; if (slot) void unequipSlot(slot); }}
            className="rounded-lg p-1.5" style={{ background: 'var(--c-bg-0)', border: '1px solid var(--c-line)' }} data-testid="hangar-items">
            {items.length === 0 ? <EmptyState icon="🧰" title={tr('No matching items')} text={tr('Enemies drop gear, or craft it in the workshop.')} /> : (
              <VirtualGrid items={items} cell={64} gap={6} height={mode === 'sheet' ? 140 : 168} renderCell={(it) => {
                const info = describeItem(it); const here = Object.values(loadout).includes(it.uid); const away = equippedElsewhere(ch, vehicle.id, it.uid);
                return (
                  <Tooltip content={<>{itemTip(it)}{here ? <div style={{ color: 'var(--c-good)' }}>{tr('equipped')}</div> : away ? <div style={{ color: 'var(--c-warn)' }}>{tr('equipped on another vehicle')}</div> : null}</>}>
                    <span draggable={!away} onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, it.uid); e.dataTransfer.effectAllowed = 'move'; setHover(it.uid); }} onDragEnd={() => setHover(null)} onMouseEnter={() => setHover(it.uid)} onMouseLeave={() => setHover(null)} style={{ opacity: away ? 0.45 : 1 }}>
                      <ItemCard rarity={it.rarity} name={info.name} icon={iconFor(it)} upgrade={it.upgrade} tier={info.def.tier} selected={selItem === it.uid || here} onClick={() => onItemClick(it.uid)} />
                    </span>
                  </Tooltip>
                );
              }} />
            )}
          </div>
        </div>
      )}
    </div>
  );

  const skins = ['', ...ch.season.skins];
  const side = (
    <div className="flex flex-col gap-3 min-w-0">
      <div>
        <div className="flex items-baseline justify-between text-[11px]" style={{ color: 'var(--c-text-2)' }}><span>{tr('Power rating')}</span><b className="text-sm" style={{ color: 'var(--c-text)' }} data-testid="power">{owned ? power.toLocaleString() : '—'}</b></div>
        <ProgressBar kind="accent" value={power} max={Math.max(power, preview?.powerBefore ?? 0, 600) * 1.15} ariaLabel={tr('Power rating')} />
        {preview && preview.powerAfter !== preview.powerBefore && <div className="text-[11px] mt-0.5" style={{ color: preview.powerAfter > preview.powerBefore ? 'var(--c-good)' : 'var(--c-bad)' }}>{preview.powerAfter > preview.powerBefore ? '▲' : '▼'} {preview.powerAfter - preview.powerBefore > 0 ? '+' : ''}{preview.powerAfter - preview.powerBefore}</div>}
      </div>
      {owned && preview ? <div>{preview.rows.map((r) => <StatRow key={r.key} label={tr(r.label)} value={r.after} compareTo={previewItem ? r.before : undefined} unit={r.unit} percent={r.percent} lowerIsBetter={r.lowerIsBetter} digits={r.digits} />)}</div> : (
        <div>
          <StatRow label={tr('Hull')} value={vehicle.baseHull} /><StatRow label={tr('Armor')} value={vehicle.baseArmor} /><StatRow label={tr('Speed')} value={vehicle.maxSpeed} /><StatRow label={tr('Reload')} value={vehicle.reloadTime} unit="s" digits={2} lowerIsBetter />
          <p className="text-[11px] mt-2" style={{ color: 'var(--c-text-3)' }}>{vehicle.description}</p>
        </div>
      )}
      {owned && (
        <div className="grid gap-2">
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => setConfirm('best')} disabled={busy || bestPlan.actions.length === 0}>{tr('Equip best')}</Button>
            <Button variant="ghost" onClick={() => setConfirm('none')} disabled={busy || nonePlan.actions.length === 0}>{tr('Unequip all')}</Button>
          </div>
          <div className="grid gap-1" data-testid="presets">
            <span className="text-[11px]" style={{ color: 'var(--c-text-2)' }}>{tr('Loadout presets')}</span>
            <SegmentedControl label={tr('Loadout presets')} value={String(presetIdx)} onChange={(v) => setPresetIdx(Number(v))} options={Array.from({ length: PRESET_SLOTS }, (_, i) => ({ id: String(i), label: `${i + 1}${presets[vehicle.id]?.[i] ? ' ●' : ''}` }))} />
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => { setPresets(savePreset(vehicle.id, presetIdx, loadout)); onMessage(tr('Preset {n} saved', { n: presetIdx + 1 })); }}>{tr('Save')}</Button>
              <Button disabled={busy || !presets[vehicle.id]?.[presetIdx]} onClick={async () => { const p = presets[vehicle.id]![presetIdx]!; const plan = planLoadout(ch, vehicle.id, p); await exec(plan); }}>{tr('Load')}</Button>
            </div>
          </div>
          {active && (
            <div className="grid gap-1">
              <span className="text-[11px]" style={{ color: 'var(--c-text-2)' }}>{tr('Skin')}</span>
              {skins.length === 1 ? <span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>{tr('Skins come from the season pass.')}</span> : (
                <SegmentedControl label={tr('Skin')} value={ch.activeSkin ?? ''} onChange={(v) => { void onAction({ kind: 'set_skin', skin: v || null }); }} options={skins.map((s) => ({ id: s, label: s ? tr(s.replace(/^skin_(season_)?/, '').replace(/^./, (c) => c.toUpperCase())) : tr('Default') }))} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const planText = (p: Plan) => tr('{n} changes', { n: p.actions.length });
  const body = mode === 'sheet' ? (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="min-h-0 overflow-y-auto">{view === 'vehicle' ? carousel : view === 'loadout' ? stage : side}</div>
    </div>
  ) : (
    <div className="grid gap-3 h-full min-h-0" style={{ gridTemplateColumns: '240px minmax(0, 1fr) 250px' }}>{carousel}<div className="overflow-y-auto min-w-0">{stage}</div><div className="overflow-y-auto">{side}</div></div>
  );
  return (
    <>
      {body}
      <Modal open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === 'best' ? tr('Equip the best items?') : tr('Unequip everything?')} closeLabel={tr('Close')}
        footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>{tr('Cancel')}</Button><Button variant={confirm === 'none' ? 'danger' : 'primary'} loading={busy} onClick={async () => { const plan = confirm === 'best' ? bestPlan : nonePlan; await exec(plan); setConfirm(null); }}>{tr('Confirm')}</Button></>}>
        <p>{confirm === 'best' ? tr('Picks the strongest item for every slot of this vehicle. Items on other vehicles stay where they are.') : tr('Moves every item of this vehicle back to your inventory. Nothing is lost.')}</p>
        <p className="text-sm mt-2" style={{ color: 'var(--c-text-2)' }}>{planText(confirm === 'best' ? bestPlan : nonePlan)}</p>
      </Modal>
    </>
  );
};
