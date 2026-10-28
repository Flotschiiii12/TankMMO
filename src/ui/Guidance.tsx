import React from 'react';
import { tr } from '../i18n.ts';
import { TUTORIAL_HINT_KEYS } from '../../shared/rules/hints.ts';
import { TUTORIAL_STEPS } from '../../shared/data/quests.ts';

/** "Next step" chip of the guided start: what to do now, how far along, and a skip button. */
export const TutorialChip: React.FC<{ step?: string; done: number; total: number; onSkip: () => void }> = ({ step, done, total, onSkip }) => {
  if (!step) return null;
  const text = TUTORIAL_HINT_KEYS[step] ?? '';
  return (
    <div className="absolute left-3 top-32 z-20 hud-scale max-w-[260px]" data-testid="tutorial-chip">
      <div className="rounded-lg border border-orange-500/60 bg-slate-950/85 px-2.5 py-1.5 text-[11px] text-slate-200">
        <div className="flex items-center justify-between gap-2 text-[10px] text-orange-300">
          <span>{tr('Getting started')} {done + 1}/{total}</span>
          <button className="text-slate-400 hover:text-white underline" onClick={onSkip}>{tr('Skip tutorial')}</button>
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
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 hud-scale max-w-[360px]" data-testid="hint-toast">
      <div className="flex items-start gap-2 rounded-lg border border-sky-500/60 bg-slate-950/90 px-3 py-2 text-[11px] text-slate-100">
        <span className="text-sky-300">💡</span><span className="leading-snug">{tr(text)}</span>
        <button className="ml-1 text-slate-400 hover:text-white" onClick={onClose} aria-label={tr('Close')}>✕</button>
      </div>
    </div>
  );
};

/** "How to play": every lesson of the guided start in order, so it can be read again at any time (replay). */
export const HowToPlay: React.FC<{ open: boolean; onClose: () => void; done: string[] }> = ({ open, onClose, done }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4" data-testid="how-to-play">
      <div className="max-w-md w-full max-h-[90vh] overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-4 text-slate-200">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2"><b className="text-white text-sm">{tr('How to play')}</b><button onClick={onClose} className="text-slate-400 hover:text-white">✕</button></div>
        <ol className="mt-2 space-y-1.5 text-xs">
          {TUTORIAL_STEPS.map((s, i) => <li key={s} className="flex gap-2"><span className={done.includes(s) ? 'text-emerald-400' : 'text-slate-500'}>{done.includes(s) ? '✓' : `${i + 1}.`}</span><span>{tr(TUTORIAL_HINT_KEYS[s] ?? s)}</span></li>)}
        </ol>
      </div>
    </div>
  );
};
