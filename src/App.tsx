import React, { Suspense, useEffect, useState } from 'react';
import { GameShell } from './ui/GameShell.tsx';
import { OnlineGate } from './ui/OnlineGate.tsx';

const Gallery = React.lazy(() => import('./ui/kit/Gallery.tsx'));
const HudFixture = React.lazy(() => import('./ui/HudFixture.tsx'));
const isFixture = () => typeof location !== 'undefined' && location.hash.startsWith('#/hud-fixture');
const isGallery = () => typeof location !== 'undefined' && location.hash.startsWith('#/ui-gallery');

export default function App() {
  const [gallery, setGallery] = useState(isGallery());
  const [fixture, setFixture] = useState(isFixture());
  useEffect(() => { const on = () => { setGallery(isGallery()); setFixture(isFixture()); }; window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  if (fixture) return <Suspense fallback={null}><HudFixture /></Suspense>; // worst-case HUD for scripts/layout-check.ts
  if (gallery) return <Suspense fallback={null}><Gallery /></Suspense>; // dev gallery of the UI kit: #/ui-gallery
  return <OnlineGate>{(online) => <GameShell online={online} />}</OnlineGate>;
}
