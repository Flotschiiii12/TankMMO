import React from 'react';
import { ChatMessage, SimEntity } from '../sim/types.ts';
import { UserProfile } from '../save/profile.ts';
import { Radar } from './Radar.tsx';
import { ChatLog } from './ChatLog.tsx';
import { soundEngine } from '../audio/soundEngine.ts';
import { Volume2, VolumeX, Wrench, Package, Map as MapIcon, Settings as SettingsIcon, HelpCircle } from 'lucide-react';

interface HUDProps {
  player: SimEntity | null;
  entities: SimEntity[];
  mapWidth: number;
  mapHeight: number;
  mapName: string;
  isSafeZone: boolean;
  profile: UserProfile;
  chatMessages: ChatMessage[];
  soundMuted: boolean;
  onToggleMute: () => void;
  onOpenGarage: () => void;
  onOpenInventory: () => void;
  onOpenWorldMap: () => void;
  onOpenSettings: () => void;
  onOpenTutorial: () => void;
}


export const HUD: React.FC<HUDProps> = ({
  player,
  entities,
  mapWidth,
  mapHeight,
  mapName,
  isSafeZone,
  profile,
  chatMessages,
  soundMuted,
  onToggleMute,
  onOpenGarage,
  onOpenInventory,
  onOpenWorldMap,
  onOpenSettings,
  onOpenTutorial,
}) => {

  return (
    <div className="absolute inset-0 pointer-events-none select-none flex flex-col justify-between p-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden">
      {/* TOP BAR */}
      <div className="flex items-start justify-between w-full">
        {/* Top-Left Status: Level, Map, Currencies, Ammo */}
        <div className="flex flex-col gap-1 pointer-events-auto bg-slate-950/60 rounded-lg p-2 border border-slate-800/60 shadow-sm max-w-[280px]">
          {/* Header Row: Level + Map Name + Safe Zone Status */}
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="font-semibold text-orange-400">Lv. {profile.character.level}</span>
            <span>·</span>
            <span className="font-medium text-slate-100 truncate">{mapName}</span>
            {isSafeZone && (
              <>
                <span>·</span>
                <span className="text-emerald-400 font-medium">Safe Zone</span>
              </>
            )}
          </div>

          {/* Currencies: Scrap & Parts */}
          <div className="flex items-center gap-2.5 text-xs text-slate-400">
            <span className="tabular-nums">
              Scrap: <span className="font-semibold text-slate-100">{profile.character.wallet.scrap.toLocaleString()}</span>
            </span>
            <span>·</span>
            <span className="tabular-nums">
              Frag: <span className="font-semibold text-slate-100">{profile.character.wallet.fragments.toLocaleString()}</span>
            </span>
          </div>

          {/* Active Ammo Stack */}
          <div className="text-[11px] text-slate-300 tabular-nums">
            Ammo: <span className="font-semibold text-orange-400">{player?.selectedAmmo.toUpperCase()}</span> (
            {player ? profile.ammoInventory[player.selectedAmmo] ?? '∞' : '∞'})
          </div>
        </div>

        {/* Top-Right: Clean Vertical Stack of Radar, with Icons Below (Zero Overlap) */}
        <div className="flex flex-col items-center gap-2 pointer-events-auto">
          {/* Circular Radar */}
          <Radar
            player={player}
            entities={entities}
            mapWidth={mapWidth}
            mapHeight={mapHeight}
          />

          {/* Icon Button Column Below Radar: All buttons >= 44x44px */}
          <div className="flex flex-col gap-2 mt-1">
            {/* Garage button (highlighted when in safe zone) */}
            <button
              onClick={() => {
                soundEngine.playUIClick();
                onOpenGarage();
              }}
              title={isSafeZone ? 'Open Garage' : 'Garage (Available in Safe Zone)'}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                isSafeZone
                  ? 'bg-orange-500 text-slate-950 shadow-md hover:bg-orange-400 active:scale-95'
                  : 'bg-slate-900/90 border border-slate-700/80 text-slate-300 hover:text-white active:scale-95'
              }`}
            >
              <Wrench size={18} />
            </button>

            {/* Inventory button */}
            <button
              onClick={() => {
                soundEngine.playUIClick();
                onOpenInventory();
              }}
              title="Inventory & Loadout (I)"
              className="w-11 h-11 rounded-full bg-slate-900/90 border border-slate-700/80 text-slate-300 flex items-center justify-center hover:text-white active:scale-95"
            >
              <Package size={18} />
            </button>

            {/* World Map button */}
            <button
              onClick={() => {
                soundEngine.playUIClick();
                onOpenWorldMap();
              }}
              title="World Map & Fast Travel (M)"
              className="w-11 h-11 rounded-full bg-slate-900/90 border border-slate-700/80 text-sky-400 flex items-center justify-center hover:text-white hover:border-sky-500 active:scale-95 shadow-sm"
            >
              <MapIcon size={18} />
            </button>


            {/* Tutorial Guide button */}
            <button
              onClick={() => {
                soundEngine.playUIClick();
                onOpenTutorial();
              }}
              title="Combat Field Manual"
              className="w-11 h-11 rounded-full bg-slate-900/90 border border-slate-700/80 text-slate-300 flex items-center justify-center hover:text-white active:scale-95"
            >
              <HelpCircle size={18} />
            </button>

            {/* Mute button */}
            <button
              onClick={() => {
                soundEngine.playUIClick();
                onToggleMute();
              }}
              title={soundMuted ? 'Unmute Audio' : 'Mute Audio'}
              className="w-11 h-11 rounded-full bg-slate-900/90 border border-slate-700/80 text-slate-300 flex items-center justify-center hover:text-white active:scale-95"
            >
              {soundMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>

            {/* Settings button */}
            <button
              onClick={() => {
                soundEngine.playUIClick();
                onOpenSettings();
              }}
              title="Settings & Diagnostics"
              className="w-11 h-11 rounded-full bg-slate-900/90 border border-slate-700/80 text-slate-300 flex items-center justify-center hover:text-white active:scale-95"
            >
              <SettingsIcon size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* BOTTOM-CENTER: Translucent Chat Log */}
      <div className="w-full flex justify-center pb-1 pointer-events-none">
        <ChatLog messages={chatMessages} />
      </div>
    </div>
  );
};
