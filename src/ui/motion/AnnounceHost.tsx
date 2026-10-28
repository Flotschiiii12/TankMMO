import React, { useSyncExternalStore } from 'react';
import { soundEngine } from '../../audio/soundEngine.ts';
import { AnnounceStore } from './announce.ts';
import { ART, ArtSlot } from '../kit/art.tsx';

export const announcements = new AnnounceStore((a) => soundEngine.playFanfare(a.kind));

const ICON = { levelup: '▲', rankup: '★', quest: '✔' } as const;

/** Level-up / rank-up / quest-complete banner. CSS keyframes only (transform + opacity); with reduced motion it just fades. */
export const AnnounceHost: React.FC = () => {
  const a = useSyncExternalStore(announcements.subscribe, announcements.getSnapshot);
  if (!a) return null;
  return (
    <div key={a.id} className={`mo-announce mo-announce--${a.kind}`} role="status" data-testid="announce" data-hud="announce">
      <ArtSlot src={ART.bannerRibbon} className="k-bgart" />
      <span className="mo-announce__icon" aria-hidden>{ICON[a.kind]}</span>
      <div><div className="mo-announce__title">{a.title}</div>{a.sub && <div className="mo-announce__sub">{a.sub}</div>}</div>
    </div>
  );
};
