import React from 'react';
import { tr } from '../../i18n.ts';
import { VEHICLE_CATALOG } from '../../../shared/data/vehicles.ts';
import { CLASS_ABILITY } from '../../../shared/rules/abilities.ts';
import type * as C from '../../../shared/rules/character.ts';
import { VEHICLE_TIERS } from '../../data/vehicles.ts';
import { Badge } from '../kit/Indicators.tsx';
import { SegmentedControl } from '../kit/Tabs.tsx';
import { CurrencyIcon, VehicleClassIcon } from '../GameIcon.tsx';

export const CLASSES = ['scout', 'medium', 'heavy', 'artillery', 'support'] as const;
const ABILITY_NAME: Record<string, string> = { dash: 'Dash', overcharge: 'Overcharge', fortify: 'Fortify', barrage: 'Barrage', repair_aura: 'Repair aura' };

/** Why a vehicle cannot be bought yet (empty when it can): level, scrap and ore, as the player reads them. */
export function lockReasons(ch: C.CharacterState, vehicleId: string): string[] {
  const v = VEHICLE_CATALOG.find((x) => x.id === vehicleId); if (!v) return [];
  const ore = ch.wallet.ore.iron + ch.wallet.ore.copper + ch.wallet.ore.titanium + ch.wallet.ore.crystal;
  const out: string[] = [];
  if (ch.level < v.minLevel) out.push(tr('Level {n} needed', { n: v.minLevel }));
  if (ch.wallet.scrap < v.costScrap) out.push(tr('{n} more scrap', { n: (v.costScrap - ch.wallet.scrap).toLocaleString() }));
  if (ore < Math.round(v.costOre)) out.push(tr('{n} more ore', { n: (Math.round(v.costOre) - ore).toLocaleString() }));
  return out;
}

/** What owning the vehicle gives: slot counts and the class ability. */
export function unlocksLine(vehicleId: string): string {
  const v = VEHICLE_CATALOG.find((x) => x.id === vehicleId); if (!v) return '';
  const slots = [[v.mainSlots, 'main'], [v.secondarySlots, 'secondary'], [v.armorSlots, 'armor'], [v.engineSlots, 'engine'], [v.moduleSlots, 'module'], [v.droneSlots, 'drone']].filter(([n]) => (n as number) > 0).map(([n, k]) => `${n}× ${tr(k as string)}`).join(' · ');
  const ab = CLASS_ABILITY[v.vehicleClass]; return `${slots}${ab ? ` · ${tr(ABILITY_NAME[ab] ?? ab)}` : ''}`;
}

export const VehicleCarousel: React.FC<{ ch: C.CharacterState; selectedId: string; classFilter: string; onClass: (c: string) => void; onSelect: (id: string) => void }> = ({ ch, selectedId, classFilter, onClass, onSelect }) => (
  <div className="flex flex-col gap-2 min-h-0">
    <SegmentedControl label={tr('Vehicle class')} value={classFilter} onChange={onClass} options={CLASSES.map((c) => ({ id: c, label: tr(c.charAt(0).toUpperCase() + c.slice(1)) }))} />
    <div className="flex flex-col gap-1.5 overflow-y-auto pr-1 min-h-0" role="listbox" aria-label={tr('Vehicles')}>
      {VEHICLE_TIERS.filter((v) => v.vehicleClass === classFilter).map((v) => {
        const owned = ch.garage.some((g) => g.vehicleId === v.id); const active = ch.activeVehicle === v.id; const sel = selectedId === v.id;
        const reasons = owned ? [] : lockReasons(ch, v.id);
        return (
          <button key={v.id} type="button" role="option" aria-selected={sel} onClick={() => onSelect(v.id)} className="text-left p-2 rounded-lg border min-h-[56px]" style={{ borderColor: sel ? 'var(--accent)' : 'var(--c-line)', background: sel ? 'var(--accent-soft)' : 'var(--c-bg-1)', opacity: owned ? 1 : 0.85 }}>
            <div className="flex items-center gap-2">
              <VehicleClassIcon vehicleClass={v.vehicleClass} size={18} />
              <b className="text-[13px] truncate flex-1">{v.name}</b>
              <Badge tone="accent">T{v.tier}</Badge>
              {active ? <Badge tone="good">{tr('Active')}</Badge> : owned ? <Badge>{tr('Owned')}</Badge> : <Badge tone="warn">🔒</Badge>}
            </div>
            {owned ? <div className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>{tr('Hull')} {v.baseHull.toLocaleString()} · {tr('Armor')} {v.baseArmor.toLocaleString()}</div> : (
              <div className="text-[11px] flex flex-wrap gap-x-2" style={{ color: reasons.length ? 'var(--c-warn)' : 'var(--c-good)' }}>
                <span><CurrencyIcon kind="scrap" size={12} /> {v.costScrap.toLocaleString()}</span><span><CurrencyIcon kind="ore" size={12} /> {Math.round(VEHICLE_CATALOG.find((x) => x.id === v.id)?.costOre ?? 0).toLocaleString()}</span><span>Lv {v.minLevel}</span>
                {reasons.length ? <span>· {reasons[0]}</span> : <span>· {tr('Ready to unlock')}</span>}
              </div>
            )}
          </button>
        );
      })}
    </div>
  </div>
);
