import React from 'react';
import { soundEngine } from '../audio/soundEngine.ts';
import { Navigation, Crosshair, Zap, ChevronRight, X } from 'lucide-react';

interface TutorialOverlayProps {
  step: number; // 0, 1, 2
  onNextStep: () => void;
  onDismiss: () => void;
}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ step, onNextStep, onDismiss }) => {
  const steps = [
    {
      title: 'Step 1: Pilot & Steering',
      desc: 'Use the Virtual Joystick on the bottom-left (or WASD / arrow keys on desktop) to steer your chassis. Your vehicle accelerates forward with authentic tank traction.',
      icon: <Navigation className="text-orange-400" size={24} />,
      btnText: 'Next: Targeting',
    },
    {
      title: 'Step 2: Lock & Aim Turret',
      desc: 'Tap the large TARGET button on the bottom-right (or tap an enemy vehicle directly) to lock on. Your turret rotates independently to track locked hostiles.',
      icon: <Crosshair className="text-orange-400" size={24} />,
      btnText: 'Next: Combat & Ammo',
    },
    {
      title: 'Step 3: Fire & Tactical Ammo',
      desc: 'Tap the central button again (or Space) to toggle auto-fire. Switch between Standard, Armor-Piercing (AP), and High-Explosive (HE) ammo to crush enemy armor!',
      icon: <Zap className="text-orange-400" size={24} />,
      btnText: 'Deploy Commander',
    },
  ];

  const current = steps[Math.min(step, 2)];

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 max-w-sm w-full mx-auto px-3 pointer-events-auto select-none animate-in fade-in slide-in-from-top-4 duration-200">
      <div className="bg-slate-900/95 border border-orange-500/50 rounded-xl p-4 shadow-2xl backdrop-blur-md text-slate-200">
        <div className="flex items-start justify-between gap-3">
          <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
            {current.icon}
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white tracking-tight">{current.title}</h4>
              <span className="text-[10px] text-orange-400 font-semibold">{step + 1} / 3</span>
            </div>
            <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">{current.desc}</p>
          </div>

          <button
            onClick={() => {
              soundEngine.playUIClick();
              onDismiss();
            }}
            className="text-slate-500 hover:text-white p-0.5"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-800 text-xs">
          <button
            onClick={() => {
              soundEngine.playUIClick();
              onDismiss();
            }}
            className="text-[11px] text-slate-400 hover:text-slate-200"
          >
            Skip Manual
          </button>

          <button
            onClick={() => {
              soundEngine.playUIClick();
              onNextStep();
            }}
            className="px-3 py-1 rounded-md bg-orange-500 hover:bg-orange-400 text-slate-950 font-semibold flex items-center gap-1 transition-colors text-xs"
          >
            <span>{current.btnText}</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
