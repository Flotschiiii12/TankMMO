import React, { useEffect, useRef, useState } from 'react';
import { tr, nm } from '../i18n.ts';
import { CurrencyIcon } from './GameIcon.tsx';
import { VEHICLE_TIERS } from '../data/vehicles.ts';
import { createWorld as createSharedWorld, spawnVehicle } from '../../shared/sim/world.ts';
import { AMMO_TYPES, AMMO_SIM_ID } from '../data/parts.ts';
import { VEHICLE_CATALOG } from '../../shared/data/vehicles.ts';
import { TALENTS_CATALOG } from '../../shared/data/talents.ts';
import * as C from '../../shared/rules/character.ts';
import { errorText } from '../game/actions.ts';
import type { ClientAction } from '../../shared/rules/actions.ts';
import { UserProfile } from '../save/profile.ts';
import { AmmoType, VehicleStats } from '../sim/types.ts';
import { soundEngine } from '../audio/soundEngine.ts';
import { X, Shield, Gauge, Crosshair, Wrench, ChevronRight, Check } from 'lucide-react';
import { drawVehicle } from '../render/vectorDraw.ts';
import { Camera } from '../render/camera.ts';

interface GarageModalProps {
  profile: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: ClientAction) => Promise<{ ok: boolean; error?: string }>;
}

const VEHICLE_ORE_COST: Record<string, number> = Object.fromEntries(VEHICLE_CATALOG.map((v) => [v.id, v.costOre]));

function talentLabel(t: { id: string; nameKey: string }): string {
  return nm(t.nameKey, t.id.replace(/^(off|def|log)_/, '').split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '));
}

const PREVIEW_WORLD = createSharedWorld({ populate: false });

export const GarageModal: React.FC<GarageModalProps> = ({
  profile,
  isOpen,
  onClose,
  onAction,
}) => {
  const ch = profile.character;
  const [msg, setMsg] = useState('');
  const run = async (action: ClientAction) => {
    soundEngine.playUIClick();
    const r = await onAction(action);
    setMsg(r.ok ? '' : errorText(r.error || 'failed'));
  };
  const [activeTab, setActiveTab] = useState<'vehicles' | 'parts' | 'ammo'>('vehicles');
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleStats>(() => {
    return VEHICLE_TIERS.find((v) => v.id === profile.character.activeVehicle) || VEHICLE_TIERS[0];
  });

  const [classFilter, setClassFilter] = useState<VehicleStats['vehicleClass']>(selectedVehicle.vehicleClass);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Live vector preview of selected vehicle
  useEffect(() => {
    if (!isOpen || activeTab !== 'vehicles' || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const camera = new Camera();
    camera.resize(canvas.width, canvas.height);
    camera.pos = { x: 0, y: 0 };
    camera.zoom = 1.6;

    let previewTime = 0;

    const renderPreview = () => {
      previewTime += 0.02;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw subtle grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      const size = 30;
      for (let x = 0; x < canvas.width; x += size) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += size) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw Vehicle with gentle idle turret scan
      const mockEntity = spawnVehicle(PREVIEW_WORLD, 'player', selectedVehicle.name, profile.character.level, { x: 0, y: 0 }, {
        tier: selectedVehicle.tier,
        maxHull: selectedVehicle.baseHull,
        maxArmor: selectedVehicle.baseArmor,
        maxSpeed: selectedVehicle.maxSpeed,
        turnRate: selectedVehicle.turnRate,
        turretTurnRate: selectedVehicle.turretTurnRate,
        mainReloadTime: selectedVehicle.reloadTime,
        radius: 26 + selectedVehicle.tier * 2,
      });
      mockEntity.turretAngle = Math.sin(previewTime * 0.8) * 0.45;
      PREVIEW_WORLD.entities.clear();

      drawVehicle(ctx, mockEntity, camera, selectedVehicle.tier, previewTime);

      animId = requestAnimationFrame(renderPreview);
    };

    renderPreview();

    return () => cancelAnimationFrame(animId);
  }, [isOpen, activeTab, selectedVehicle, profile.character.level]);

  if (!isOpen) return null;

  const owned = ch.garage.some((g) => g.vehicleId === selectedVehicle.id);
  const isUnlocked = owned;
  const isEquipped = ch.activeVehicle === selectedVehicle.id;
  const oreNeeded = Math.round(VEHICLE_ORE_COST[selectedVehicle.id] ?? 0);
  const oreHave = ch.wallet.ore.iron + ch.wallet.ore.copper + ch.wallet.ore.titanium + ch.wallet.ore.crystal;
  const canAfford = ch.wallet.scrap >= selectedVehicle.costScrap && oreHave >= oreNeeded && ch.level >= selectedVehicle.minLevel;
  const buyAmmo = (type: AmmoType, _count: number, _cost: number) => { void run({ kind: 'buy_ammo', ammo: type, packs: 1 }); };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col p-4 md:p-6 text-slate-200 select-none overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <Wrench className="text-orange-500" size={22} />
          <h2 className="text-lg font-semibold tracking-tight text-white">{tr('Base Outpost Hangar')}</h2>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-400">{tr('Safe Zone Depot')}</span>
        </div>

        {/* Currency Strip */}
        <div className="flex items-center gap-5 text-xs">
          <span className="tabular-nums">
            <CurrencyIcon kind="scrap" /> {tr('Scrap')}: <span className="font-semibold text-white">{ch.wallet.scrap.toLocaleString()}</span>
          </span>
          <span className="tabular-nums">
            <CurrencyIcon kind="ore" /> {tr('Ore')}: <span className="font-semibold text-white">{oreHave.toLocaleString()}</span>
          </span>
          <span className="tabular-nums">
            {tr('Level')}: <span className="font-semibold text-orange-400">{ch.level}</span>
          </span>
          <button
            onClick={() => {
              soundEngine.playUIClick();
              onClose();
            }}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mt-3 border-b border-slate-800 pb-2">
        <button
          onClick={() => {
            soundEngine.playUIClick();
            setActiveTab('vehicles');
          }}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'vehicles'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {tr('Vehicles')}
        </button>
        <button
          onClick={() => {
            soundEngine.playUIClick();
            setActiveTab('parts');
          }}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'parts'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {tr('Talents')}
        </button>
        <button
          onClick={() => {
            soundEngine.playUIClick();
            setActiveTab('ammo');
          }}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'ammo'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {tr('Ammunition Depot')}
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto mt-4">
        {/* TAB 1: VEHICLES */}
        {activeTab === 'vehicles' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-full">
            {/* Left 4 cols: Vehicle Tier Selector */}
            <div className="md:col-span-5 flex flex-col gap-2 overflow-y-auto pr-1">
              <div className="flex gap-1 flex-wrap">
                {(['scout', 'medium', 'heavy', 'artillery', 'support'] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      soundEngine.playUIClick();
                      setClassFilter(c);
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold capitalize border ${
                      classFilter === c ? 'border-orange-500/80 bg-orange-500/10 text-orange-300' : 'border-slate-800 text-slate-400'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {VEHICLE_TIERS.filter((v) => v.vehicleClass === classFilter).map((v) => {
                const unlocked = ch.garage.some((g) => g.vehicleId === v.id);
                const active = selectedVehicle.id === v.id;
                const equipped = ch.activeVehicle === v.id;

                return (
                  <button
                    key={v.id}
                    onClick={() => {
                      soundEngine.playUIClick();
                      setSelectedVehicle(v);
                    }}
                    className={`flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
                      active
                        ? 'border-orange-500/80 bg-orange-500/10'
                        : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">{v.name}</span>
                        <span className="text-[11px] text-orange-400 font-medium">T{v.tier}</span>
                        {equipped && (
                          <span className="text-[11px] text-emerald-400 flex items-center gap-0.5">
                            <Check size={12} /> {tr('Active')}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {tr('Hull')}: {v.baseHull.toLocaleString()} · {tr('Armor')}: {v.baseArmor.toLocaleString()}
                      </div>
                    </div>

                    <div className="text-right">
                      {unlocked ? (
                        <span className="text-[11px] text-slate-300">{tr('Owned')}</span>
                      ) : (
                        <span className="text-[11px] text-slate-400 tabular-nums">
                          {v.costScrap} {tr('Scrap')}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right 7 cols: Vehicle Showcase Preview & Actions */}
            <div className="md:col-span-7 flex flex-col justify-between bg-slate-900/30 border border-slate-800/80 rounded-xl p-5">
              {/* Top: Name, Tier, Description */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight">
                      {selectedVehicle.name}
                    </h3>
                    <div className="text-xs text-orange-400 font-medium">
                      {tr('Tier ')}{selectedVehicle.tier} {tr('Combat Platform')} · {tr('Min Level')} {selectedVehicle.minLevel}
                    </div>
                  </div>

                  {isEquipped ? (
                    <span className="px-3 py-1 rounded bg-emerald-500/20 text-emerald-300 text-xs font-semibold">
                      {tr('Deployed')}
                    </span>
                  ) : isUnlocked ? (
                    <button
                      onClick={() => {
                        soundEngine.playUIClick();
                        run({ kind: 'set_vehicle', vehicleId: selectedVehicle.id });
                      }}
                      className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-colors"
                    >
                      {tr('Deploy Vehicle')}
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        soundEngine.playUIClick();
                        run({ kind: 'buy_vehicle', vehicleId: selectedVehicle.id });
                      }}
                      disabled={!canAfford}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        canAfford
                          ? 'bg-orange-500 hover:bg-orange-400 text-slate-950'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {tr('Unlock')} ({selectedVehicle.costScrap.toLocaleString()} {tr('Scrap')} · {oreNeeded.toLocaleString()} {tr('Ore')})
                    </button>
                  )}
                </div>

                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  {selectedVehicle.description}
                </p>
              </div>

              {/* Center: Live Canvas Preview */}
              <div className="relative w-full h-44 my-3 rounded-lg overflow-hidden border border-slate-800/50 bg-slate-950/60 flex items-center justify-center">
                <canvas
                  ref={previewCanvasRef}
                  width={380}
                  height={180}
                  className="w-full h-full object-contain pointer-events-none"
                />
              </div>

              {/* Bottom: Stat Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
                  <div className="text-slate-400 flex items-center gap-1.5">
                    <Shield size={14} className="text-emerald-400" />
                    <span>{tr('Hull HP')}</span>
                  </div>
                  <div className="text-sm font-semibold text-white mt-1 tabular-nums">
                    {selectedVehicle.baseHull.toLocaleString()}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
                  <div className="text-slate-400 flex items-center gap-1.5">
                    <Shield size={14} className="text-blue-400" />
                    <span>{tr('Armor HP')}</span>
                  </div>
                  <div className="text-sm font-semibold text-white mt-1 tabular-nums">
                    {selectedVehicle.baseArmor.toLocaleString()}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
                  <div className="text-slate-400 flex items-center gap-1.5">
                    <Gauge size={14} className="text-orange-400" />
                    <span>{tr('Top Speed')}</span>
                  </div>
                  <div className="text-sm font-semibold text-white mt-1 tabular-nums">
                    {selectedVehicle.maxSpeed} u/s
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
                  <div className="text-slate-400 flex items-center gap-1.5">
                    <Crosshair size={14} className="text-amber-400" />
                    <span>{tr('Reload')}</span>
                  </div>
                  <div className="text-sm font-semibold text-white mt-1 tabular-nums">
                    {selectedVehicle.reloadTime}s
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

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
  );
};
