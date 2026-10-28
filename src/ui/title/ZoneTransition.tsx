import React, { useEffect, useRef, useState } from 'react';
import { MAP_METADATA_TABLE } from '../../../shared/data/maps.ts';
import { nm, tr } from '../../i18n.ts';

/** Zone entry: a short black fade when the map changes, plus the zone name with its level range. Motion respects reduced-motion (CSS). */
export const ZoneTransition: React.FC<{ mapId: number; playing: boolean }> = ({ mapId, playing }) => {
  const last = useRef<number | null>(null);
  const [shown, setShown] = useState<{ n: number; id: number; fade: boolean } | null>(null);
  useEffect(() => {
    if (!playing || !MAP_METADATA_TABLE[mapId]) return;
    if (last.current === mapId) return;
    const first = last.current === null;
    last.current = mapId;
    setShown((p) => ({ n: (p?.n ?? 0) + 1, id: mapId, fade: !first }));
    const t = setTimeout(() => setShown(null), 3400);
    return () => clearTimeout(t);
  }, [mapId, playing]);
  if (!shown) return null;
  const meta = MAP_METADATA_TABLE[shown.id];
  return (
    <>
      {shown.fade && <div key={`f${shown.n}`} className="tt-fade tt-fade--on" aria-hidden data-testid="zone-fade" />}
      <div key={`z${shown.n}`} className="tt-zone" role="status" data-testid="zone-banner">
        <div className="tt-zone__name">{nm(meta.nameKey, meta.name)}</div>
        <div className="tt-zone__sub">{tr('Level')} {meta.levelRange[0]}–{meta.levelRange[1]}</div>
      </div>
    </>
  );
};
