import React from 'react';
import { ChatMessage, SimEntity } from '../sim/types.ts';
import { UserProfile } from '../save/profile.ts';
import { Radar } from './Radar.tsx';
import { ChatLog } from './ChatLog.tsx';
import { soundEngine } from '../audio/soundEngine.ts';
import { Volume2, VolumeX, Wrench, Package, Settings as SettingsIcon, HelpCircle } from 'lucide-react';

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
  onOpenSettings,
  onOpenTutorial,
}) => {
  return (
    <div className="absolute inset-0 pointer-events-none select-none flex flex-col justify-between p-4 overflow-hidden">
      {/* TOP BAR */}
      <div className="flex items-start justify-between w-full">
        {/* Top-Left Status: Level, Map, Currencies, Ammo */}
        <div className="flex flex-col gap-1 pointer-events-auto">
          {/* Header Row: Level + Map Name + Safe Zone Status */}
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="font-semibold text-orange-400">Lv. {profile.level}</span>
            <span>·</span>
            <span className="font-medium text-slate-200">{mapName}</span>
            {isSafeZone && (
              <>
                <span>·</span>
                <span className="text-emerald-400 font-medium">Safe Zone</span>
              </>
            )}
          </div>

          {/* Currencies: Scrap & Parts */}
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="tabular-nums">
              Scrap: <span className="font-medium text-slate-100">{profile.scrap.toLocaleString()}</span>
            </span>
            <span>·</span>
            <span className="tabular-nums">
              Parts: <span className="font-medium text-slate-100">{profile.parts.toLocaleString()}</span>
            </span>
            <span>·</span>
            <span className="tabular-nums text-slate-300">
              Ammo: <span className="font-semibold text-orange-400">{player?.selectedAmmo.toUpperCase()}</span> (
              {player ? profile.ammoInventory[player.selectedAmmo] ?? '∞' : '∞'})
            </span>
          </div>
        </div>

        {/* Top-Right: Circular Radar */}
        <div className="pointer-events-none">
          <Radar
            player={player}
            entities={entities}
            mapWidth={mapWidth}
            mapHeight={mapHeight}
          />
        </div>
      </div>

      {/* RIGHT EDGE: Column of Small Round Icon Buttons */}
      <div className="absolute right-4 top-24 flex flex-col gap-2.5 pointer-events-auto">
        {/* Garage button (highlighted when in safe zone) */}
        <button
          onClick={() => {
            soundEngine.playUIClick();
            onOpenGarage();
          }}
          title={isSafeZone ? 'Open Garage' : 'Garage (Available in Safe Zone)'}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
            isSafeZone
              ? 'bg-orange-500 text-slate-950 shadow-md hover:bg-orange-400 active:scale-95'
              : 'bg-slate-900/80 border border-slate-700/60 text-slate-400 hover:text-slate-200 active:scale-95'
          }`}
        >
          <Wrench size={16} />
        </button>

        {/* Inventory button */}
        <button
          onClick={() => {
            soundEngine.playUIClick();
            onOpenInventory();
          }}
          title="Inventory & Loadout"
          className="w-9 h-9 rounded-full bg-slate-900/80 border border-slate-700/60 text-slate-300 flex items-center justify-center hover:text-white active:scale-95"
        >
          <Package size={16} />
        </button>

        {/* Tutorial Guide button */}
        <button
          onClick={() => {
            soundEngine.playUIClick();
            onOpenTutorial();
          }}
          title="Combat Field Manual"
          className="w-9 h-9 rounded-full bg-slate-900/80 border border-slate-700/60 text-slate-300 flex items-center justify-center hover:text-white active:scale-95"
        >
          <HelpCircle size={16} />
        </button>

        {/* Mute button */}
        <button
          onClick={() => {
            soundEngine.playUIClick();
            onToggleMute();
          }}
          title={soundMuted ? 'Unmute Sound' : 'Mute Sound'}
          className="w-9 h-9 rounded-full bg-slate-900/80 border border-slate-700/60 text-slate-300 flex items-center justify-center hover:text-white active:scale-95"
        >
          {soundMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>

        {/* Settings button */}
        <button
          onClick={() => {
            soundEngine.playUIClick();
            onOpenSettings();
          }}
          title="Settings"
          className="w-9 h-9 rounded-full bg-slate-900/80 border border-slate-700/60 text-slate-300 flex items-center justify-center hover:text-white active:scale-95"
        >
          <SettingsIcon size={16} />
        </button>
      </div>

      {/* BOTTOM-CENTER: Translucent Chat Log */}
      <div className="w-full flex justify-center pb-2 pointer-events-none">
        <ChatLog messages={chatMessages} />
      </div>
    </div>
  );
};
