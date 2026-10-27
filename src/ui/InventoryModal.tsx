import React from 'react';
import { UserProfile } from '../save/profile.ts';
import { getVehicleById } from '../data/vehicles.ts';
import { getPartById } from '../data/parts.ts';
import { soundEngine } from '../audio/soundEngine.ts';
import { X, Shield, Gauge, Crosshair, Package } from 'lucide-react';

interface InventoryModalProps {
  profile: UserProfile;
  isOpen: boolean;
  onClose: () => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({ profile, isOpen, onClose }) => {
  if (!isOpen) return null;

  const currentVehicle = getVehicleById(profile.currentVehicleId);
  const cannon = getPartById(profile.equippedParts.cannon);
  const armor = getPartById(profile.equippedParts.armor);
  const engine = getPartById(profile.equippedParts.engine);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 text-slate-200 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Package className="text-orange-500" size={20} />
            <h3 className="font-semibold text-white text-base">Combat Loadout & Ammo</h3>
          </div>
          <button
            onClick={() => {
              soundEngine.playUIClick();
              onClose();
            }}
            className="text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Vehicle Summary */}
        <div className="mt-4 p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-white">{currentVehicle.name}</div>
            <div className="text-xs text-orange-400">
              Tier {currentVehicle.tier} · Pilot Level {profile.level}
            </div>
          </div>
          <div className="text-right text-xs text-slate-400 tabular-nums">
            <div>Scrap: <span className="text-white font-semibold">{profile.scrap.toLocaleString()}</span></div>
            <div>Parts: <span className="text-white font-semibold">{profile.parts.toLocaleString()}</span></div>
          </div>
        </div>

        {/* Equipped Modules */}
        <div className="mt-4 space-y-2 text-xs">
          <div className="text-slate-400 font-medium tracking-wide text-[11px]">INSTALLED HARDWARE</div>

          <div className="flex items-center justify-between p-2.5 rounded bg-slate-950/40 border border-slate-800/80">
            <div className="flex items-center gap-2">
              <Crosshair size={14} className="text-amber-400" />
              <span className="text-white font-medium">{cannon?.name || 'Standard Cannon'}</span>
            </div>
            <span className="text-slate-400">Slot 1: Cannon</span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded bg-slate-950/40 border border-slate-800/80">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-blue-400" />
              <span className="text-white font-medium">{armor?.name || 'Standard Plates'}</span>
            </div>
            <span className="text-slate-400">Slot 2: Armor</span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded bg-slate-950/40 border border-slate-800/80">
            <div className="flex items-center gap-2">
              <Gauge size={14} className="text-emerald-400" />
              <span className="text-white font-medium">{engine?.name || 'Standard Engine'}</span>
            </div>
            <span className="text-slate-400">Slot 3: Engine</span>
          </div>
        </div>

        {/* Ammunition Inventory */}
        <div className="mt-4 space-y-2 text-xs">
          <div className="text-slate-400 font-medium tracking-wide text-[11px]">AMMUNITION RESERVES</div>
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded bg-slate-950/40 border border-slate-800 text-center">
              <div className="text-slate-400 text-[10px]">Standard</div>
              <div className="font-bold text-white mt-0.5">∞</div>
            </div>
            <div className="p-2.5 rounded bg-slate-950/40 border border-slate-800 text-center">
              <div className="text-slate-400 text-[10px]">AP Shells</div>
              <div className="font-bold text-orange-400 mt-0.5 tabular-nums">
                {profile.ammoInventory.ARMOR_PIERCING}
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-950/40 border border-slate-800 text-center">
              <div className="text-slate-400 text-[10px]">HE Shells</div>
              <div className="font-bold text-orange-400 mt-0.5 tabular-nums">
                {profile.ammoInventory.EXPLOSIVE}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 text-right">
          <button
            onClick={() => {
              soundEngine.playUIClick();
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
