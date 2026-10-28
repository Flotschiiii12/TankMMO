import React, { useState } from 'react';
import { tr } from '../i18n.ts';
import { CurrencyIcon } from './GameIcon.tsx';
import { UserProfile } from '../save/profile.ts';
import { soundEngine } from '../audio/soundEngine.ts';
import { errorText } from '../game/actions.ts';
import type { ClientAction } from '../../shared/rules/actions.ts';
import { notifications } from './hud/notify.ts';
import { Tabs } from './kit/Tabs.tsx';
import { GearTab } from './items/GearTab.tsx';
import { WorkshopTab } from './items/WorkshopTab.tsx';
import { WindowFrame } from './wm/WindowFrame.tsx';

interface InventoryModalProps {
  profile: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: ClientAction) => Promise<{ ok: boolean; error?: string }>;
}

/** Inventory & workshop window: Gear (grid, filters, comparison, bulk dismantle) and Workshop (upgrade, reroll, fusion, craft). */
export const InventoryModal: React.FC<InventoryModalProps> = ({ profile, isOpen, onAction }) => {
  const [tab, setTab] = useState<'gear' | 'workshop'>('gear');
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const ch = profile.character;
  if (!isOpen) return null;

  const run = async (action: ClientAction, ok?: string) => {
    soundEngine.playUIClick();
    const r = await onAction(action);
    setMsg(r.ok ? '' : errorText(r.error || 'failed'));
    if (r.ok && ok) notifications.push({ group: 'system', title: tr(ok), kind: 'success' });
    return r;
  };
  const ore = ch.wallet.ore;
  return (
    <WindowFrame id="inventory" title="Loadout & Workshop" width="min(1080px, 98vw)" height="min(720px, 95vh)" headerExtra={
      <div className="flex items-center gap-3 text-[11px] tabular-nums max-[1100px]:hidden" style={{ color: 'var(--c-text-2)' }}>
        <span><CurrencyIcon kind="scrap" /> <b className="text-white">{ch.wallet.scrap.toLocaleString()}</b></span>
        <span><CurrencyIcon kind="iron" /> {ore.iron}</span><span><CurrencyIcon kind="copper" /> {ore.copper}</span><span><CurrencyIcon kind="titanium" /> {ore.titanium}</span><span><CurrencyIcon kind="crystal" /> {ore.crystal}</span>
        <span><CurrencyIcon kind="fragments" /> {ch.wallet.fragments}</span>
      </div>
    }>
      <div className="flex flex-col h-full min-h-0 gap-2">
        <Tabs label={tr('Inventory')} value={tab} onChange={(v) => { soundEngine.playUIClick(); setTab(v as typeof tab); }} tabs={[{ id: 'gear', label: tr('Gear') }, { id: 'workshop', label: tr('Workshop') }]} />
        {msg && <div className="text-xs" style={{ color: 'var(--c-warn)' }} role="alert">{msg}</div>}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {tab === 'gear' ? <GearTab ch={ch} selected={selected} onSelect={setSelected} run={run} onWorkshop={() => setTab('workshop')} /> : <WorkshopTab ch={ch} selected={selected} onSelect={setSelected} run={run} />}
        </div>
      </div>
    </WindowFrame>
  );
};
