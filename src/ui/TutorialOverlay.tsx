import React from 'react';
import { tr } from '../i18n.ts';
import { Rich } from './Rich.tsx';
import { soundEngine } from '../audio/soundEngine.ts';
import { Navigation, Crosshair, Zap, Shield, X } from 'lucide-react';

interface TutorialOverlayProps {
  step: number; // 0: drive, 1: lock, 2: fire, 3: abilities/loot, 4+: done
  onAdvance: () => void;
  onSkip: () => void;
}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ step, onAdvance, onSkip }) => {
  if (step >= 4) return null;

  if (step === 0) {
    // Step 0: Driving hint sits next to joystick (bottom-left)
    return (
      <div data-hud="tutorial-card" className="absolute bottom-40 left-6 z-30 pointer-events-none select-none max-w-[250px] animate-in fade-in duration-200">
        <div className="pointer-events-auto p-3 rounded-lg bg-slate-900/90 border border-orange-500/50 shadow-xl backdrop-blur-none text-slate-200">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
              <Navigation size={14} className="text-orange-400" />
              <span>{tr('Drive & Steer')}</span>
            </div>
            <button
              onClick={() => {
                soundEngine.playUIClick();
                onSkip();
              }}
              className="text-[11px] text-slate-400 hover:text-slate-200"
            >
              {tr('Skip')}
            </button>
          </div>
          <p className="text-[11px] text-slate-300 mt-1.5 leading-snug">
            <Rich text="Drag the left stick or press *WASD* to steer." />
          </p>
          <div className="mt-2 text-[11px] text-orange-400/90 font-medium">
            {tr('Drive 50m to proceed...')}
          </div>
        </div>
      </div>
    );
  }

  if (step === 1) {
    // Step 1: Lock hint sits next to TARGET button (bottom-right)
    return (
      <div data-hud="tutorial-card" className="absolute bottom-52 right-8 z-30 pointer-events-none select-none max-w-[250px] animate-in fade-in duration-200">
        <div className="pointer-events-auto p-3 rounded-lg bg-slate-900/90 border border-orange-500/50 shadow-xl backdrop-blur-none text-slate-200">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
              <Crosshair size={14} className="text-orange-400" />
              <span>{tr('Targeting Lock')}</span>
            </div>
            <button
              onClick={() => {
                soundEngine.playUIClick();
                onSkip();
              }}
              className="text-[11px] text-slate-400 hover:text-slate-200"
            >
              {tr('Skip')}
            </button>
          </div>
          <p className="text-[11px] text-slate-300 mt-1.5 leading-snug">
            <Rich text="Tap the *TARGET* button (or tap an enemy vehicle) to lock your turret." />
          </p>
          <div className="mt-2 text-[11px] text-orange-400/90 font-medium">
            {tr('Lock an enemy to proceed...')}
          </div>
        </div>
      </div>
    );
  }

  if (step === 2) {
    // Step 2: Auto-fire hint sits next to TARGET button (bottom-right)
    return (
      <div data-hud="tutorial-card" className="absolute bottom-52 right-8 z-30 pointer-events-none select-none max-w-[250px] animate-in fade-in duration-200">
        <div className="pointer-events-auto p-3 rounded-lg bg-slate-900/90 border border-orange-500/50 shadow-xl backdrop-blur-none text-slate-200">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
              <Zap size={14} className="text-orange-400" />
              <span>{tr('Auto-Fire Engagement')}</span>
            </div>
            <button
              onClick={() => {
                soundEngine.playUIClick();
                onSkip();
              }}
              className="text-[11px] text-slate-400 hover:text-slate-200"
            >
              {tr('Skip')}
            </button>
          </div>
          <p className="text-[11px] text-slate-300 mt-1.5 leading-snug">
            <Rich text="Tap *LOCKED* again (or Space) to toggle auto-fire." />
          </p>
          <div className="mt-2 text-[11px] text-orange-400/90 font-medium">
            {tr('Fire cannon to proceed...')}
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Abilities & Loot
  return (
    <div data-hud="tutorial-card" className="absolute bottom-52 right-8 z-30 pointer-events-none select-none max-w-[250px] animate-in fade-in duration-200">
      <div className="pointer-events-auto p-3 rounded-lg bg-slate-900/90 border border-orange-500/50 shadow-xl backdrop-blur-none text-slate-200">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <Shield size={14} className="text-emerald-400" />
            <span>{tr('Tactical Systems')}</span>
          </div>
          <button
            onClick={() => {
              soundEngine.playUIClick();
              onSkip();
            }}
            className="text-[11px] text-slate-400 hover:text-slate-200"
          >
            {tr('Skip')}
          </button>
        </div>
        <p className="text-[11px] text-slate-300 mt-1.5 leading-snug">
          <Rich text="Collect glowing supply crates from wrecks and trigger *Smoke*, *Repair*, or *Boost*!" />
        </p>
        <div className="mt-2 text-[11px] text-emerald-400/90 font-medium">
          {tr('Collect loot or use an ability to complete manual.')}
        </div>
      </div>
    </div>
  );
};
