import React from 'react';
import { tr } from '../i18n.ts';
import { soundEngine } from '../audio/soundEngine.ts';
import { Volume2, VolumeX } from 'lucide-react';
import { GameIcon } from './GameIcon.tsx';
import { PipHost } from './kit/Indicators.tsx';
import { useShortScreen } from './useShortScreen.ts';
import { Tooltip } from './kit/Tooltip.tsx';
import { WINDOW_DEFS, WindowId } from './wm/defs.ts';
import { windows } from './wm/windowStore.ts';
import { useWindowStack } from './wm/useWindows.ts';

export type NavPips = Partial<Record<WindowId, number | boolean>>;

/**
 * The main menu: one round button per window (taken from wm/defs.ts), notification pips, shortcut hints in the tooltip,
 * the garage button lights up in safe zones. Layout (column / 4x2 block) comes from .hud-menu-btns in index.css.
 */
export const MainMenu: React.FC<{ pips?: NavPips; hasSocial: boolean; isSafeZone: boolean; soundMuted: boolean; onToggleMute: () => void }> = ({ pips = {}, hasSocial, isSafeZone, soundMuted, onToggleMute }) => {
  const stack = useWindowStack(); const short = useShortScreen();
  const items = WINDOW_DEFS.filter((d) => d.menu && (d.id !== 'social' || hasSocial));
  return (
    <nav className="hud-menu-btns" aria-label={tr('Main menu')}>
      {items.map((d) => {
        const open = stack.includes(d.id);
        const hint = d.id === 'garage' && !isSafeZone ? tr('Garage (Available in Safe Zone)') : tr(d.title);
        return (
          <Tooltip key={d.id} content={`${hint}${d.key ? ` (${d.key})` : ''}`} placement="left">
            <PipHost count={pips[d.id]} label={tr(d.title)}>
              <button type="button" aria-label={tr(d.title)} aria-pressed={open} onClick={() => { soundEngine.playUIClick(); windows.toggle(d.id); }}
                className={`hud-round w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95 ${d.id === 'garage' && isSafeZone ? 'bg-orange-500 text-slate-950 shadow-md' : 'bg-slate-900/90 border border-slate-700/80 text-slate-300 hover:text-white'} ${open ? 'ring-2 ring-[var(--accent)]' : ''}`}>
                <GameIcon name={d.icon} size={26} />
              </button>
            </PipHost>
          </Tooltip>
        );
      })}
      {!short && <Tooltip content={soundMuted ? tr('Unmute Audio') : tr('Mute Audio')} placement="left">
        <button type="button" aria-label={soundMuted ? tr('Unmute Audio') : tr('Mute Audio')} onClick={() => { soundEngine.playUIClick(); onToggleMute(); }}
          className="hud-round w-11 h-11 rounded-full bg-slate-900/90 border border-slate-700/80 text-slate-300 flex items-center justify-center hover:text-white active:scale-95">
          {soundMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </Tooltip>}
    </nav>
  );
};
