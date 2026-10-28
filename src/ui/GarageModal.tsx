import { WindowFrame } from './wm/WindowFrame.tsx';
import React, { useState } from 'react';
import { tr, nm } from '../i18n.ts';
import { CurrencyIcon } from './GameIcon.tsx';
import { AMMO_TYPES, AMMO_SIM_ID } from '../data/parts.ts';
import { TALENTS_CATALOG } from '../../shared/data/talents.ts';
import * as C from '../../shared/rules/character.ts';
import { errorText } from '../game/actions.ts';
import type { ClientAction } from '../../shared/rules/actions.ts';
import { UserProfile } from '../save/profile.ts';
import { AmmoType } from '../sim/types.ts';
import { soundEngine } from '../audio/soundEngine.ts';
import { Tabs } from './kit/Tabs.tsx';
import { HangarView, HangarSubView } from './hangar/HangarView.tsx';
import { useWindowMode } from './wm/useWindows.ts';

interface GarageModalProps {
  profile: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: ClientAction) => Promise<{ ok: boolean; error?: string }>;
}

function talentLabel(t: { id: string; nameKey: string }): string {
  return nm(t.nameKey, t.id.replace(/^(off|def|log)_/, '').split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '));
}

/** The garage window: Hangar (vehicles and loadout), Talents, Ammunition Depot. */
export const GarageModal: React.FC<GarageModalProps> = ({ profile, isOpen, onAction }) => {
  const ch = profile.character;
  const [msg, setMsg] = useState('');
  const run = async (action: ClientAction) => {
    soundEngine.playUIClick();
    const r = await onAction(action);
    setMsg(r.ok ? '' : errorText(r.error || 'failed'));
  };
  const [activeTab, setActiveTab] = useState<'vehicles' | 'parts' | 'ammo'>('vehicles');
  const [hview, setHview] = useState<HangarSubView>('loadout'); const sheet = useWindowMode() === 'sheet';
  if (!isOpen) return null;
  // one tab row on phones: the three hangar views and Talents / Ammo side by side
  const tabValue = activeTab === 'vehicles' && sheet ? hview : activeTab;
  const onTab = (v: string) => { soundEngine.playUIClick(); if (v === 'vehicle' || v === 'loadout' || v === 'stats') { setActiveTab('vehicles'); setHview(v); } else setActiveTab(v as typeof activeTab); };
  const oreHave = ch.wallet.ore.iron + ch.wallet.ore.copper + ch.wallet.ore.titanium + ch.wallet.ore.crystal;
  const buyAmmo = (type: AmmoType, _count: number, _cost: number) => { void run({ kind: 'buy_ammo', ammo: type, packs: 1 }); };

  return (
    <WindowFrame id="garage" title="Base Outpost Hangar" width="min(1180px, 98vw)" height="min(740px, 95vh)" headerExtra={
      <div className="flex items-center gap-3 text-xs max-[900px]:hidden">
        <span className="tabular-nums"><CurrencyIcon kind="scrap" /> {tr('Scrap')}: <b className="text-white">{ch.wallet.scrap.toLocaleString()}</b></span>
        <span className="tabular-nums"><CurrencyIcon kind="ore" /> {tr('Ore')}: <b className="text-white">{oreHave.toLocaleString()}</b></span>
      </div>
    }>
      <div className="flex flex-col h-full min-h-0 gap-2">
        <Tabs label={tr('Garage')} value={tabValue} onChange={onTab} tabs={[...(sheet ? [{ id: 'vehicle', label: tr('Vehicle') }, { id: 'loadout', label: tr('Loadout') }, { id: 'stats', label: tr('Stats') }] : [{ id: 'vehicles', label: tr('Hangar') }]), { id: 'parts', label: tr('Talents'), pip: C.talentPointsAvailable(ch) > 0 }, { id: 'ammo', label: tr('Ammunition Depot') }]} />
        {msg && <div className="text-xs" style={{ color: 'var(--c-warn)' }} role="alert">{msg}</div>}
        <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'vehicles' && <HangarView profile={profile} onAction={onAction} onMessage={setMsg} view={hview} onView={setHview} />}

        {/* TAB 2: TALENTS */}
        {activeTab === 'parts' && (
          <div className="mt-3 overflow-y-auto">
            <div className="flex items-center justify-between text-xs mb-3">
              <span className="text-slate-300">{tr('Talent points available')}: <b className="text-orange-400">{C.talentPointsAvailable(ch)}</b> ({tr('from level 5, one per level')})</span>
              <button
                onClick={() => run({ kind: 'respec' })}
                className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                {tr('Reset talents')} ({C.respecCost(ch).toLocaleString()} {tr('scrap')})
              </button>
            </div>
            {msg && <div className="text-xs text-orange-300 mb-2">{msg}</div>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(['offense', 'defense', 'logistics'] as const).map((branch) => (
                <div key={branch} className="rounded-lg border border-slate-800 bg-slate-900/40 p-2.5">
                  <div className="text-[11px] uppercase tracking-wide text-orange-400 mb-1.5">{branch}</div>
                  <div className="space-y-1">
                    {TALENTS_CATALOG.filter((t) => t.branch === branch).sort((x, y) => x.tier - y.tier).map((t) => {
                      const rank = ch.talentRanks[t.id] ?? 0;
                      return (
                        <button
                          key={t.id}
                          onClick={() => run({ kind: 'rank_talent', talentId: t.id })}
                          className="w-full flex items-center justify-between p-1.5 rounded border border-slate-800 hover:border-slate-600 text-left text-xs"
                        >
                          <span className="text-slate-200">{talentLabel(t)} <span className="text-[11px] text-slate-500">{t.effectPerRank.isPercent ? `+${Math.round(t.effectPerRank.valuePerRank * 1000) / 10}%` : `+${t.effectPerRank.valuePerRank}`}/{tr('rank')} · Lv {t.minLevel}</span></span>
                          <span className={`tabular-nums ${rank === t.maxRank ? 'text-emerald-400' : 'text-slate-400'}`}>{rank}/{t.maxRank}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: AMMO DEPOT */}
        {activeTab === 'ammo' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto pt-4">
            {Object.values(AMMO_TYPES).map((ammo) => {
              const currentStock = profile.ammoInventory[AMMO_SIM_ID[ammo.id]] ?? 0;
              const canAfford = ch.wallet.scrap >= ammo.costScrapPerPack;

              return (
                <div
                  key={ammo.id}
                  className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-white text-sm">{ammo.name}</h4>
                      <span className="text-xs font-semibold text-orange-400">
                        {ammo.id.toUpperCase()}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      {ammo.description}
                    </p>

                    <div className="mt-4 space-y-1.5 text-xs text-slate-300">
                      <div>
                        {tr('Base Damage')}: <span className="font-semibold text-white">{ammo.damage}</span>
                      </div>
                      <div>
                        {tr('Penetration')}:{' '}
                        <span className="font-semibold text-white">
                          {ammo.armorPiercingRatio > 0
                            ? tr('Ignores {n}% Armor', { n: ammo.armorPiercingRatio * 100 })
                            : tr('Standard')}
                        </span>
                      </div>
                      <div>
                        {tr('Area Splash')}:{' '}
                        <span className="font-semibold text-white">
                          {ammo.splashRadius > 0 ? tr('{n} Radius', { n: ammo.splashRadius }) : tr('Direct hit')}
                        </span>
                      </div>
                      <div className="pt-2 text-slate-400 tabular-nums">
                        {tr('Current In Reserve')}: <span className="text-white font-medium">{currentStock}</span>
                      </div>
                    </div>
                  </div>

                  {ammo.id === 'standard' ? (
                    <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400">
                      {tr('Unlimited Free Fallback')}
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        soundEngine.playUIClick();
                        buyAmmo(AMMO_SIM_ID[ammo.id], ammo.packSize, ammo.costScrapPerPack);
                      }}
                      disabled={!canAfford}
                      className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors ${
                        canAfford
                          ? 'bg-orange-500 hover:bg-orange-400 text-slate-950 shadow'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {tr('Buy')} +{ammo.packSize} {tr('Shells')} ({ammo.costScrapPerPack} {tr('Scrap')})
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>
    </WindowFrame>
  );
};
