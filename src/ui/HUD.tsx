import { controlStrip } from './layoutStrip.ts';
import { MainMenu, NavPips } from './MainMenu.tsx';
import { PlayerCard } from './PlayerCard.tsx';
import { useShortScreen } from './useShortScreen.ts';
import React from 'react';
import { tr, nm } from '../i18n.ts';
import { ChatMessage, SimEntity } from '../sim/types.ts';
import { QUEST_BY_ID } from '../../shared/data/quests.ts';
import { questMarkers } from '../../shared/rules/quests.ts';
import { UserProfile } from '../save/profile.ts';
import { Radar } from './Radar.tsx';
import { ChatLog } from './ChatLog.tsx';
import { soundEngine } from '../audio/soundEngine.ts';
import { GameIcon, CurrencyIcon } from './GameIcon.tsx';
import { Volume2, VolumeX, Wrench, Package, ScrollText, Users, Map as MapIcon, Settings as SettingsIcon, HelpCircle } from 'lucide-react';

interface HUDProps {
  /** the guided-start chip, rendered inside the status block so it can never overlap it */
  tutorialChip?: React.ReactNode;
  leftHanded?: boolean;
  player: SimEntity | null;
  entities: SimEntity[];
  mapWidth: number;
  mapHeight: number;
  partyNames?: string[];
  mapName: string;
  /** running world events on this map, already localized ("Invasion · 12:30") */
  eventLines?: string[];
  isSafeZone: boolean;
  profile: UserProfile;
  chatMessages: ChatMessage[];
  soundMuted: boolean;
  onToggleMute: () => void;
  /** notification pips of the main menu (new items, quests to turn in, invites, running events) */
  navPips?: NavPips;
  /** false offline: the social window needs the server */
  hasSocial: boolean;
}


export const HUD: React.FC<HUDProps> = ({
  player,
  entities,
  mapWidth,
  mapHeight,
  partyNames,
  mapName,
  isSafeZone,
  profile,
  chatMessages,
  soundMuted,
  onToggleMute,
  eventLines,
  navPips,
  hasSocial,
  tutorialChip,
  leftHanded,
}) => {
  const short = useShortScreen();

  return (
    <div className="absolute inset-0 pointer-events-none select-none flex flex-col justify-between p-3 pl-[max(0.75rem,var(--safe-left))] pr-[max(0.75rem,var(--safe-right))] pt-[max(0.75rem,var(--safe-top))] pb-[max(0.5rem,var(--safe-bottom))] overflow-hidden">
      {/* TOP BAR */}
      <div className={`flex items-start justify-between w-full ${leftHanded ? 'flex-row-reverse' : ''}`}>
        {/* Top-Left Status: Level, Map, Currencies, Ammo */}
        <div data-hud="status" className="hud-scale origin-top-left flex flex-col gap-1 pointer-events-auto bg-slate-950/60 rounded-lg p-2 border border-slate-800/60 shadow-sm max-w-[280px]">
          <PlayerCard character={profile.character} name={profile.playerName} compact={short} />
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="font-medium text-slate-100 truncate">{mapName}</span>
            {isSafeZone && (<><span>·</span><span className="text-emerald-400 font-medium">{tr('Safe Zone')}</span></>)}
          </div>

          {!short && (
          <div className="text-[11px] text-slate-300 tabular-nums">
            {tr('Ammo')}: <span className="font-semibold text-orange-400">{player?.selectedAmmo.replace('_', ' ')}</span> (
            {player ? (player.ammoInventory[player.selectedAmmo] < 0 ? '∞' : player.ammoInventory[player.selectedAmmo]) : '∞'})
          </div>
          )}

          {eventLines?.map((l) => <div key={l} className="text-[11px] font-semibold text-amber-300 truncate" data-testid="event-line">⚑ {l}</div>)}

          {tutorialChip}

          {/* Quest tracker: the guided start has its own chip, short screens show one line */}
          {Object.values(profile.character.quests.active).filter((aq) => !(tutorialChip && aq.id.startsWith('tut_'))).sort((a, b) => Number(b.id.startsWith('tut_')) - Number(a.id.startsWith('tut_')) || Number(b.ready) - Number(a.ready)).slice(0, short ? (tutorialChip ? 0 : 1) : 3).map((aq) => {
            const def = QUEST_BY_ID.get(aq.id);
            if (!def) return null;
            const done = aq.progress.reduce((a, b) => a + b, 0);
            const total = aq.targets.reduce((a, b) => a + b, 0);
            return (
              <div key={aq.id} className="text-[11px] flex justify-between gap-2 text-slate-400 border-t border-slate-800/60 pt-0.5">
                <span className={`truncate ${aq.ready ? 'text-emerald-400' : ''}`}>{nm(def.nameKey, def.name)}</span>
                <span className="tabular-nums shrink-0">{aq.ready ? tr('ready') : `${done}/${total}`}</span>
              </div>
            );
          })}
        </div>

        {/* Top-Right: Clean Vertical Stack of Radar, with Icons Below (Zero Overlap) */}
        <div data-hud="menu" className="hud-menu pointer-events-auto">
          {/* Circular Radar */}
          <Radar
            player={player}
            entities={entities}
            mapWidth={mapWidth}
            mapHeight={mapHeight}
            partyNames={partyNames}
            colorBlind={profile.settings.colorBlind}
            questKinds={questMarkers(profile.character).enemyKinds}
          />

          {/* Icon Button Column Below Radar: All buttons >= 44x44px */}
          <MainMenu pips={navPips} hasSocial={hasSocial} isSafeZone={isSafeZone} soundMuted={soundMuted} onToggleMute={onToggleMute} />
        </div>
      </div>

      {/* BOTTOM-CENTER: Translucent Chat Log */}
      <div data-hud="chatlog" style={controlStrip(leftHanded, 'calc(max(0.75rem, var(--safe-bottom)) + 3.25rem)')} className="absolute flex justify-center pointer-events-none">
        <ChatLog messages={chatMessages} />
      </div>
    </div>
  );
};
