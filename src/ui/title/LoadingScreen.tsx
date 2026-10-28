import React, { useEffect, useMemo, useRef, useState } from 'react';
import { currentLang, tr } from '../../i18n.ts';
import { ArtSlot, ART } from '../kit/art.tsx';
import { ProgressBar } from '../kit/Indicators.tsx';
import { Logo } from './Logo.tsx';
import { STAGE_LABEL, loadProgress, type LoadStage } from './loadProgress.ts';
import { TIPS, tipAt } from './tips.ts';

const TIP_MS = 7000;

/** Full-screen loading view: logo, painted illustration slot, rotating tip and a progress bar. `children` appear once the stage is ready (the deploy button). */
export const LoadingScreen: React.FC<{ stage: LoadStage; children?: React.ReactNode }> = ({ stage, children }) => {
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));
  const [now, setNow] = useState(0);
  const stageAt = useRef(performance.now());
  const art = useMemo(() => 1 + Math.floor(Math.random() * 6), []);
  useEffect(() => { stageAt.current = performance.now(); setNow(0); }, [stage]);
  useEffect(() => {
    if (stage === 'ready') return;
    const t = setInterval(() => setNow(performance.now() - stageAt.current), 400);
    return () => clearInterval(t);
  }, [stage]);
  useEffect(() => { const t = setInterval(() => setTip((i) => i + 1), TIP_MS); return () => clearInterval(t); }, []);
  const value = loadProgress(stage, now);
  return (
    <div className="tt-screen tt-loading" data-testid="loading-screen" role="status" aria-live="polite">
      <ArtSlot src={ART.loading(art)} className="tt-loading__art" />
      <div className="tt-loading__main">
        <Logo size="sm" />
        <div className="tt-loading__tip" key={tip}>
          <span className="tt-loading__tiplabel">{tr('Tip')}</span>
          <p>{tipAt(tip, currentLang)}</p>
        </div>
        <div className="tt-loading__bar">
          <ProgressBar value={value} kind="accent" ariaLabel={tr(STAGE_LABEL[stage])} />
          <div className="tt-loading__status">{tr(STAGE_LABEL[stage])} <span className="tabular-nums">{Math.round(value * 100)}%</span></div>
        </div>
        {children}
      </div>
    </div>
  );
};
