import React, { useEffect, useRef, useState } from 'react';
import { VEHICLE_TIERS } from '../data/vehicles.ts';
import { createWorld as createSharedWorld, spawnVehicle } from '../../shared/sim/world.ts';
import { AMMO_TYPES, AMMO_SIM_ID, ARMORS, CANNONS, ENGINES } from '../data/parts.ts';
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
  onBuyVehicle: (vehicleId: string) => void;
  onEquipVehicle: (vehicleId: string) => void;
  onBuyAndEquipPart: (partId: string, type: 'cannon' | 'armor' | 'engine') => void;
  onBuyAmmo: (type: AmmoType, count: number, cost: number) => void;
}

const PREVIEW_WORLD = createSharedWorld({ populate: false });

export const GarageModal: React.FC<GarageModalProps> = ({
  profile,
  isOpen,
  onClose,
  onBuyVehicle,
  onEquipVehicle,
  onBuyAndEquipPart,
  onBuyAmmo,
}) => {
  const [activeTab, setActiveTab] = useState<'vehicles' | 'parts' | 'ammo'>('vehicles');
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleStats>(() => {
    return VEHICLE_TIERS.find((v) => v.id === profile.currentVehicleId) || VEHICLE_TIERS[0];
  });

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
      const mockEntity = spawnVehicle(PREVIEW_WORLD, 'player', selectedVehicle.name, profile.level, { x: 0, y: 0 }, {
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
  }, [isOpen, activeTab, selectedVehicle, profile.level]);

  if (!isOpen) return null;

  const isUnlocked = profile.unlockedVehicles.includes(selectedVehicle.id);
  const isEquipped = profile.currentVehicleId === selectedVehicle.id;
  const canAfford =
    profile.scrap >= selectedVehicle.costScrap &&
    profile.parts >= selectedVehicle.costParts &&
    profile.level >= selectedVehicle.minLevel;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col p-4 md:p-6 text-slate-200 select-none overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <Wrench className="text-orange-500" size={22} />
          <h2 className="text-lg font-semibold tracking-tight text-white">Base Outpost Hangar</h2>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-400">Safe Zone Depot</span>
        </div>

        {/* Currency Strip */}
        <div className="flex items-center gap-5 text-xs">
          <span className="tabular-nums">
            Scrap: <span className="font-semibold text-white">{profile.scrap.toLocaleString()}</span>
          </span>
          <span className="tabular-nums">
            Parts: <span className="font-semibold text-white">{profile.parts.toLocaleString()}</span>
          </span>
          <span className="tabular-nums">
            Level: <span className="font-semibold text-orange-400">{profile.level}</span>
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
          Vehicle Tiers (1–6)
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
          Parts Workshop
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
          Ammunition Depot
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto mt-4">
        {/* TAB 1: VEHICLES */}
        {activeTab === 'vehicles' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-full">
            {/* Left 4 cols: Vehicle Tier Selector */}
            <div className="md:col-span-5 flex flex-col gap-2 overflow-y-auto pr-1">
              {VEHICLE_TIERS.map((v) => {
                const unlocked = profile.unlockedVehicles.includes(v.id);
                const active = selectedVehicle.id === v.id;
                const equipped = profile.currentVehicleId === v.id;

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
                        <span className="text-[10px] text-orange-400 font-medium">T{v.tier}</span>
                        {equipped && (
                          <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                            <Check size={12} /> Active
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Hull: {v.baseHull.toLocaleString()} · Armor: {v.baseArmor.toLocaleString()}
                      </div>
                    </div>

                    <div className="text-right">
                      {unlocked ? (
                        <span className="text-[11px] text-slate-300">Owned</span>
                      ) : (
                        <span className="text-[11px] text-slate-400 tabular-nums">
                          {v.costScrap} Scrap
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
                      Tier {selectedVehicle.tier} Combat Platform · Min Level {selectedVehicle.minLevel}
                    </div>
                  </div>

                  {isEquipped ? (
                    <span className="px-3 py-1 rounded bg-emerald-500/20 text-emerald-300 text-xs font-semibold">
                      Deployed
                    </span>
                  ) : isUnlocked ? (
                    <button
                      onClick={() => {
                        soundEngine.playUIClick();
                        onEquipVehicle(selectedVehicle.id);
                      }}
                      className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-colors"
                    >
                      Deploy Vehicle
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        soundEngine.playUIClick();
                        onBuyVehicle(selectedVehicle.id);
                      }}
                      disabled={!canAfford}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        canAfford
                          ? 'bg-orange-500 hover:bg-orange-400 text-slate-950'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      Unlock ({selectedVehicle.costScrap} Scrap · {selectedVehicle.costParts} Parts)
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
                    <span>Hull HP</span>
                  </div>
                  <div className="text-sm font-semibold text-white mt-1 tabular-nums">
                    {selectedVehicle.baseHull.toLocaleString()}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
                  <div className="text-slate-400 flex items-center gap-1.5">
                    <Shield size={14} className="text-blue-400" />
                    <span>Armor HP</span>
                  </div>
                  <div className="text-sm font-semibold text-white mt-1 tabular-nums">
                    {selectedVehicle.baseArmor.toLocaleString()}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
                  <div className="text-slate-400 flex items-center gap-1.5">
                    <Gauge size={14} className="text-orange-400" />
                    <span>Top Speed</span>
                  </div>
                  <div className="text-sm font-semibold text-white mt-1 tabular-nums">
                    {selectedVehicle.maxSpeed} u/s
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
                  <div className="text-slate-400 flex items-center gap-1.5">
                    <Crosshair size={14} className="text-amber-400" />
                    <span>Reload</span>
                  </div>
                  <div className="text-sm font-semibold text-white mt-1 tabular-nums">
                    {selectedVehicle.reloadTime}s
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PARTS WORKSHOP */}
        {activeTab === 'parts' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Cannons */}
            <div className="flex flex-col gap-3">
              <h4 className="text-xs font-semibold text-orange-400 tracking-wider">
                MAIN CANNONS
              </h4>
              {CANNONS.map((p) => {
                const isEquipped = profile.equippedParts.cannon === p.id;
                const canBuy =
                  profile.scrap >= p.costScrap &&
                  profile.parts >= p.costParts &&
                  profile.level >= p.minLevel;

                return (
                  <div
                    key={p.id}
                    className={`p-3.5 rounded-lg border text-xs flex flex-col justify-between gap-2 ${
                      isEquipped
                        ? 'border-orange-500/70 bg-orange-500/10'
                        : 'border-slate-800 bg-slate-900/40'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">{p.name}</span>
                        <span className="text-[10px] text-slate-400">T{p.tier}</span>
                      </div>
                      <p className="text-slate-400 mt-1 leading-snug">{p.description}</p>
                      {p.dpsBonus > 0 && (
                        <div className="text-emerald-400 font-medium mt-1">
                          +{p.dpsBonus} Damage
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                      <span className="text-slate-400 tabular-nums">
                        {p.costScrap > 0
                          ? `${p.costScrap} Scrap · ${p.costParts} Parts`
                          : 'Starter Tech'}
                      </span>
                      {isEquipped ? (
                        <span className="text-emerald-400 font-medium flex items-center gap-1">
                          <Check size={12} /> Equipped
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            soundEngine.playUIClick();
                            onBuyAndEquipPart(p.id, 'cannon');
                          }}
                          disabled={!canBuy}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            canBuy
                              ? 'bg-slate-800 hover:bg-slate-700 text-white'
                              : 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                          }`}
                        >
                          Equip
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Armors */}
            <div className="flex flex-col gap-3">
              <h4 className="text-xs font-semibold text-blue-400 tracking-wider">
                ARMOR SKIRTS & PLATES
              </h4>
              {ARMORS.map((p) => {
                const isEquipped = profile.equippedParts.armor === p.id;
                const canBuy =
                  profile.scrap >= p.costScrap &&
                  profile.parts >= p.costParts &&
                  profile.level >= p.minLevel;

                return (
                  <div
                    key={p.id}
                    className={`p-3.5 rounded-lg border text-xs flex flex-col justify-between gap-2 ${
                      isEquipped
                        ? 'border-blue-500/70 bg-blue-500/10'
                        : 'border-slate-800 bg-slate-900/40'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">{p.name}</span>
                        <span className="text-[10px] text-slate-400">T{p.tier}</span>
                      </div>
                      <p className="text-slate-400 mt-1 leading-snug">{p.description}</p>
                      {(p.hullBonus > 0 || p.armorBonus > 0) && (
                        <div className="text-blue-400 font-medium mt-1">
                          +{p.hullBonus} Hull · +{p.armorBonus} Armor
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                      <span className="text-slate-400 tabular-nums">
                        {p.costScrap > 0
                          ? `${p.costScrap} Scrap · ${p.costParts} Parts`
                          : 'Starter Tech'}
                      </span>
                      {isEquipped ? (
                        <span className="text-blue-400 font-medium flex items-center gap-1">
                          <Check size={12} /> Equipped
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            soundEngine.playUIClick();
                            onBuyAndEquipPart(p.id, 'armor');
                          }}
                          disabled={!canBuy}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            canBuy
                              ? 'bg-slate-800 hover:bg-slate-700 text-white'
                              : 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                          }`}
                        >
                          Equip
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Engines */}
            <div className="flex flex-col gap-3">
              <h4 className="text-xs font-semibold text-emerald-400 tracking-wider">
                ENGINES & TURBINES
              </h4>
              {ENGINES.map((p) => {
                const isEquipped = profile.equippedParts.engine === p.id;
                const canBuy =
                  profile.scrap >= p.costScrap &&
                  profile.parts >= p.costParts &&
                  profile.level >= p.minLevel;

                return (
                  <div
                    key={p.id}
                    className={`p-3.5 rounded-lg border text-xs flex flex-col justify-between gap-2 ${
                      isEquipped
                        ? 'border-emerald-500/70 bg-emerald-500/10'
                        : 'border-slate-800 bg-slate-900/40'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">{p.name}</span>
                        <span className="text-[10px] text-slate-400">T{p.tier}</span>
                      </div>
                      <p className="text-slate-400 mt-1 leading-snug">{p.description}</p>
                      {p.speedBonus > 0 && (
                        <div className="text-emerald-400 font-medium mt-1">
                          +{p.speedBonus} Top Speed
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                      <span className="text-slate-400 tabular-nums">
                        {p.costScrap > 0
                          ? `${p.costScrap} Scrap · ${p.costParts} Parts`
                          : 'Starter Tech'}
                      </span>
                      {isEquipped ? (
                        <span className="text-emerald-400 font-medium flex items-center gap-1">
                          <Check size={12} /> Equipped
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            soundEngine.playUIClick();
                            onBuyAndEquipPart(p.id, 'engine');
                          }}
                          disabled={!canBuy}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            canBuy
                              ? 'bg-slate-800 hover:bg-slate-700 text-white'
                              : 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                          }`}
                        >
                          Equip
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: AMMO DEPOT */}
        {activeTab === 'ammo' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto pt-4">
            {Object.values(AMMO_TYPES).map((ammo) => {
              const currentStock = profile.ammoInventory[AMMO_SIM_ID[ammo.id]] ?? 0;
              const canAfford = profile.scrap >= ammo.costScrapPerPack;

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
                        Base Damage: <span className="font-semibold text-white">{ammo.damage}</span>
                      </div>
                      <div>
                        Penetration:{' '}
                        <span className="font-semibold text-white">
                          {ammo.armorPiercingRatio > 0
                            ? `Ignores ${ammo.armorPiercingRatio * 100}% Armor`
                            : 'Standard'}
                        </span>
                      </div>
                      <div>
                        Area Splash:{' '}
                        <span className="font-semibold text-white">
                          {ammo.splashRadius > 0 ? `${ammo.splashRadius} Radius` : 'Direct hit'}
                        </span>
                      </div>
                      <div className="pt-2 text-slate-400 tabular-nums">
                        Current In Reserve: <span className="text-white font-medium">{currentStock}</span>
                      </div>
                    </div>
                  </div>

                  {ammo.id === 'standard' ? (
                    <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400">
                      Unlimited Free Fallback
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        soundEngine.playUIClick();
                        onBuyAmmo(AMMO_SIM_ID[ammo.id], ammo.packSize, ammo.costScrapPerPack);
                      }}
                      disabled={!canAfford}
                      className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors ${
                        canAfford
                          ? 'bg-orange-500 hover:bg-orange-400 text-slate-950 shadow'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      Buy +{ammo.packSize} Shells ({ammo.costScrapPerPack} Scrap)
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
