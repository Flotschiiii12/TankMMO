import React from 'react';
import { WindowFrame } from './wm/WindowFrame.tsx';
import { tr } from '../i18n.ts';
import { TUTORIAL_HINT_KEYS } from '../../shared/rules/hints.ts';
import { TUTORIAL_STEPS } from '../../shared/data/quests.ts';

/** "Next step" chip of the guided start: what to do now, how far along, and a skip button. */
export const TutorialChip: React.FC<{ step?: string; done: number; total: number; onSkip: () => void }> = ({ step, done, total, onSkip }) => {
  if (!step) return null;
  const text = TUTORIAL_HINT_KEYS[step] ?? '';
  return (
    <div className="mt-1" data-testid="tutorial-chip">
      <div className="rounded-lg border border-orange-500/60 bg-slate-950/85 px-2.5 py-1.5 text-[11px] text-slate-200">
        <div className="flex items-center justify-between gap-2 text-[11px] text-orange-300">
          <span>{tr('Getting started')} {done + 1}/{total}</span>
          <button data-compact className="min-h-[44px] px-2 -my-4 text-slate-400 hover:text-white underline" onClick={onSkip}>{tr('Skip tutorial')}</button>
        </div>
        <div className="mt-0.5 leading-snug">{tr(text)}</div>
      </div>
    </div>
  );
};

/** Short, dismissible contextual hint (appears at most a few times per situation). */
export const HintToast: React.FC<{ text: string | null; onClose: () => void }> = ({ text, onClose }) => {
  if (!text) return null;
  return (
    <div data-hud="hint" className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 hud-scale max-w-[min(360px,calc(100vw-2rem))]" data-testid="hint-toast">
      <div className="flex items-start gap-2 rounded-lg border border-sky-500/60 bg-slate-950/90 px-3 py-2 text-[11px] text-slate-100">
        <span className="text-sky-300">💡</span><span className="leading-snug">{tr(text)}</span>
        <button data-compact className="ml-1 min-h-[44px] min-w-[44px] text-slate-400 hover:text-white" onClick={onClose} aria-label={tr('Close')}>✕</button>
      </div>
    </div>
  );
};

/** "How to play": every lesson of the guided start in order, so it can be read again at any time (replay). */
export const HowToPlay: React.FC<{ open: boolean; onClose: () => void; done: string[] }> = ({ open, onClose, done }) => {
  if (!open) return null;
  return (
    <WindowFrame id="howto" width="min(480px, 94vw)" height="min(520px, 90vh)">
      <div data-testid="how-to-play">
        <ol className="mt-2 space-y-1.5 text-xs">
          {TUTORIAL_STEPS.map((s, i) => <li key={s} className="flex gap-2"><span className={done.includes(s) ? 'text-emerald-400' : 'text-slate-500'}>{done.includes(s) ? '✓' : `${i + 1}.`}</span><span>{tr(TUTORIAL_HINT_KEYS[s] ?? s)}</span></li>)}
        </ol>
      </div>
    </WindowFrame>
  );
};
