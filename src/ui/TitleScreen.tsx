import React, { useEffect } from 'react';
import { tr } from '../i18n.ts';
import { soundEngine } from '../audio/soundEngine.ts';
import { Play } from 'lucide-react';

interface TitleScreenProps {
  onStart: () => void;
  playerLevel: number;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({ onStart, playerLevel }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        soundEngine.init();
        soundEngine.playUIClick();
        onStart();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onStart]);

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-between p-8 bg-gradient-to-b from-slate-950/70 via-slate-950/40 to-slate-950/90 select-none pointer-events-auto">
      {/* Top Quiet Meta */}
      <div className="w-full flex items-center justify-between text-xs text-slate-400 max-w-4xl">
        <span className="font-semibold tracking-wider text-orange-400">{tr('TREADFRONT PROTOTYPE')}</span>
        <span>{tr('MMO-Style Top-Down Tactical Armor')}</span>
      </div>

      {/* Centerpiece: Bespoke SVG Title Lockup */}
      <div className="flex flex-col items-center max-w-xl text-center my-auto">
        {/* Inline SVG Tank / Tread Insignia */}
        <div className="w-20 h-20 mb-4 text-orange-500 drop-shadow-md">
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="18" y="22" width="64" height="14" rx="4" fill="#334155" stroke="#f97316" strokeWidth="2.5" />
            <rect x="18" y="64" width="64" height="14" rx="4" fill="#334155" stroke="#f97316" strokeWidth="2.5" />
            <rect x="26" y="32" width="48" height="36" rx="4" fill="#1e293b" stroke="#64748b" strokeWidth="2" />
            <line x1="50" y1="50" x2="88" y2="50" stroke="#f97316" strokeWidth="5" strokeLinecap="round" />
            <circle cx="50" cy="50" r="14" fill="#0f172a" stroke="#f97316" strokeWidth="2.5" />
            <circle cx="50" cy="50" r="4" fill="#f97316" />
          </svg>
        </div>

        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-2">
          TREADFRONT
        </h1>
        <p className="text-sm md:text-base text-slate-300 font-light max-w-md mx-auto leading-relaxed">
          {tr('Command your armored combat platform across hostile biomes, engage siege fortifications, scavenge enemy scrap, and forge an apex war machine.')}
        </p>

        {/* Primary Start CTA */}
        <div className="mt-8">
          <button
            onClick={() => {
              soundEngine.init();
              soundEngine.playUIClick();
              onStart();
            }}
            className="group relative inline-flex items-center gap-3 px-8 py-3.5 rounded-full bg-orange-500 hover:bg-orange-400 active:scale-95 text-slate-950 font-bold text-sm tracking-wide transition-all shadow-lg shadow-orange-500/20"
          >
            <Play size={18} className="fill-slate-950" />
            <span>{tr('DEPLOY TO BATTLEFIELD')}</span>
          </button>
        </div>

        {playerLevel > 1 && (
          <div className="text-xs text-slate-400 mt-3 tabular-nums">
            {tr('Saved Profile: Pilot Level')} {playerLevel}
          </div>
        )}
      </div>

      {/* Flat Control Hints Footer */}
      <div className="text-xs text-slate-500 text-center tracking-wide font-medium">
        {tr('WASD Move · Space Auto-Fire · Q/E/F Abilities · Left Stick + Target Ring on Touch · Esc Pause')}
      </div>
    </div>
  );
};
