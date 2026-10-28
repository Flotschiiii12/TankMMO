import React, { Suspense, useEffect, useState } from 'react';
import { GameShell } from './ui/GameShell.tsx';
import { OnlineGate } from './ui/OnlineGate.tsx';

const Gallery = React.lazy(() => import('./ui/kit/Gallery.tsx'));
const isGallery = () => typeof location !== 'undefined' && location.hash.startsWith('#/ui-gallery');

export default function App() {
  const [gallery, setGallery] = useState(isGallery());
  useEffect(() => { const on = () => setGallery(isGallery()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  if (gallery) return <Suspense fallback={null}><Gallery /></Suspense>; // dev gallery of the UI kit: #/ui-gallery
  return <OnlineGate>{(online) => <GameShell online={online} />}</OnlineGate>;
}
