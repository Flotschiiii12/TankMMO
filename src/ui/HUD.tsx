import React, { useEffect, useState } from 'react';
import { tr, nm } from '../i18n.ts';
import { ChatMessage, SimEntity } from '../sim/types.ts';
import { QUEST_BY_ID } from '../../shared/data/quests.ts';
import { questMarkers } from '../../shared/rules/quests.ts';
import { UserProfile } from '../save/profile.ts';
import { Radar } from './Radar.tsx';
import { MainMenu, NavPips } from './MainMenu.tsx';
import { PlayerCard } from './PlayerCard.tsx';
import { PartyFrames, StatusCluster } from './hud/StatusCluster.tsx';
import { controlStrip } from './layoutStrip.ts';
import { getTracked, trackerOrder } from './career/careerLogic.ts';
import { useShortScreen } from './useShortScreen.ts';

interface HUDProps {
  /** the guided-start chip, rendered inside the status block so it can never overlap it */
  tutorialChip?: React.ReactNode;
  /** target frame and kill feed. Tall screens: centre of the top row. Short screens: a band between status block and fire cluster */
  targetNode?: React.ReactNode;
  feedNode?: React.ReactNode;
  hasTarget?: boolean;
  leftHanded?: boolean;
  /** minimal HUD: only bars, target, controls (no quest tracker, events, party frames, minimap extras) */
  minimal?: boolean;
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
  chatMessages?: ChatMessage[];
  soundMuted: boolean;
  onToggleMute: () => void;
  /** notification pips of the main menu (new items, quests to turn in, invites, running events) */
  navPips?: NavPips;
  /** false offline: the social window needs the server */
  hasSocial: boolean;
}

/**
 * HUD zones: status block top-left (player card, hull/armor, statuses, events, tutorial chip, quests, party), centre slot
 * (target frame, kill feed), minimap + main menu top-right. Hotbar, chat dock and notices are siblings rendered by GameShell.
 * The top row is a grid, so the centre slot shrinks to whatever is left instead of overlapping its neighbours.
 */
export const HUD: React.FC<HUDProps> = ({ player, entities, mapWidth, mapHeight, partyNames, mapName, isSafeZone, profile, soundMuted, onToggleMute, eventLines, navPips, hasSocial, tutorialChip, targetNode, feedNode, hasTarget, leftHanded, minimal }) => {
  const short = useShortScreen();
  const [bigMap, setBigMap] = useState(false);
  const chipOn = !!tutorialChip;
  const [tracked, setTrackedId] = useState<string | null>(() => getTracked());
  useEffect(() => { const on = () => setTrackedId(getTracked()); window.addEventListener('treadfront-track', on); return () => window.removeEventListener('treadfront-track', on); }, []);
  const quests = trackerOrder(Object.values(profile.character.quests.active).filter((aq) => !(tutorialChip && aq.id.startsWith('tut_'))), tracked).slice(0, short ? (chipOn ? 0 : 1) : 3);
  return (
    <div className="absolute inset-0 pointer-events-none select-none p-3 pl-[max(0.75rem,var(--safe-left))] pr-[max(0.75rem,var(--safe-right))] pt-[max(0.75rem,var(--safe-top))]" data-minimal={minimal || undefined}>
      <div className={`hud-top ${leftHanded ? 'hud-top--lefty' : ''}`}>
        <div data-hud="status" className={`hud-surface hud-scale origin-top-left flex flex-col gap-1.5 pointer-events-auto p-2 min-w-0 ${short ? 'w-[14rem]' : 'max-w-[280px]'}`}>
          <PlayerCard character={profile.character} name={profile.playerName} compact={short} />
          {short && <div className="text-[11px] truncate" style={{ color: 'var(--c-text-2)' }} data-testid="zone-line">{mapName}{isSafeZone ? ` · ${tr('Safe Zone')}` : ''}</div>}
          <StatusCluster player={player} hideChips={short && chipOn} />
          {!minimal && !(short && chipOn) && eventLines?.slice(0, short ? 1 : 3).map((l) => <div key={l} className="text-[11px] font-semibold truncate" style={{ color: 'var(--c-warn)' }} data-testid="event-line">⚑ {l}</div>)}
          {tutorialChip}
          {!minimal && quests.map((aq) => {
            const def = QUEST_BY_ID.get(aq.id);
            if (!def) return null;
            const done = aq.progress.reduce((a, b) => a + b, 0);
            const total = aq.targets.reduce((a, b) => a + b, 0);
            return (
              <div key={aq.id} className="text-[11px] flex justify-between gap-2 pt-0.5" style={{ color: 'var(--c-text-2)', borderTop: '1px solid var(--c-line)' }}>
                <span className="truncate" style={aq.ready ? { color: 'var(--c-good)' } : undefined}>{aq.id === tracked ? '📌 ' : ''}{nm(def.nameKey, def.name)}</span>
                <span className="tabular-nums shrink-0">{aq.ready ? tr('ready') : `${done}/${total}`}</span>
              </div>
            );
          })}
          {!minimal && !short && <PartyFrames names={partyNames} entities={entities} meId={player?.id} />}
        </div>

        {short ? <div /> : <div className="flex flex-col items-center gap-1 min-w-0 pointer-events-none" data-hud="center">{targetNode}{!minimal && feedNode}</div>}

        <div data-hud="menu" className="hud-menu pointer-events-auto">
          <div className="relative">
            <Radar player={player} entities={entities} mapWidth={mapWidth} mapHeight={mapHeight} partyNames={partyNames} colorBlind={profile.settings.colorBlind} questKinds={questMarkers(profile.character).enemyKinds} big={bigMap && !short} zoneName={short ? undefined : mapName} />
            {!short && <button type="button" aria-label={bigMap ? tr('Smaller minimap') : tr('Bigger minimap')} title={bigMap ? tr('Smaller minimap') : tr('Bigger minimap')} onClick={() => setBigMap((v) => !v)} className="absolute -left-2 -top-2 w-7 h-7 rounded-full text-[11px] hud-surface pointer-events-auto">⤢</button>}
          </div>
          <MainMenu pips={navPips} hasSocial={hasSocial} isSafeZone={isSafeZone} soundMuted={soundMuted} onToggleMute={onToggleMute} />
        </div>
      </div>
      {short && (
        <div data-hud="center" className="absolute flex flex-col items-center gap-1 pointer-events-none min-w-0" style={{ ...controlStrip(leftHanded, 'auto'), bottom: undefined, top: 'calc(max(0.75rem, var(--safe-top)) + 9.5rem)', left: leftHanded ? 'calc(max(0.75rem, var(--safe-left)) + 13rem)' : 'calc(max(0.75rem, var(--safe-left)) + 15rem)', right: leftHanded ? 'calc(max(0.75rem, var(--safe-right)) + 15rem)' : 'calc(max(0.75rem, var(--safe-right)) + 13rem)' }}>
          {targetNode}{!hasTarget && !minimal && feedNode}
        </div>
      )}
    </div>
  );
};
