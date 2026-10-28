import React, { useEffect, useState } from 'react';
import { spriteRegistry } from '../../render/assets.ts';

/** Names of optional painted UI art under /assets/ui/ (see docs/bildprompts-ui.md). A file is used only when manifest.json lists it. */
export const ART = {
  panelFrame: '/assets/ui/panel_frame.png',
  windowFrame: '/assets/ui/window_frame.png',
  buttonPrimary: '/assets/ui/btn_primary.png',
  tabActive: '/assets/ui/tab_active.png',
  hotbarFrame: '/assets/ui/hotbar_frame.png',
  rarityFrame: (rarity: string) => `/assets/ui/frame_${rarity.toLowerCase()}.png`,
  hangarBg: '/assets/ui/hangar_bg.png',
  titleBg: (faction: string) => `/assets/ui/title_${faction}.png`,
  loading: (n: number) => `/assets/ui/loading_${n}.png`,
  mapFrame: '/assets/ui/map_frame.png',
  parchment: '/assets/ui/parchment.png',
  logo: '/assets/ui/logo.png',
} as const;

/** True once manifest.json lists `path`. Re-renders when the manifest arrives, so a missing file never causes a request. */
export function useArt(path: string | undefined): boolean {
  const [listed, setListed] = useState(() => !!path && spriteRegistry.isListed(path));
  useEffect(() => {
    if (!path) { setListed(false); return; }
    setListed(spriteRegistry.isListed(path));
    return spriteRegistry.onChange(() => setListed(spriteRegistry.isListed(path)));
  }, [path]);
  return listed;
}

/** Shows the painted image when it exists, otherwise `children` (the CSS fallback). */
export const ArtSlot: React.FC<{ src: string; className?: string; style?: React.CSSProperties; alt?: string; children?: React.ReactNode }> = ({ src, className, style, alt = '', children }) => {
  const ok = useArt(src);
  if (!ok) return <>{children ?? null}</>;
  return <img src={src} alt={alt} draggable={false} className={className} style={style} onError={(e) => { e.currentTarget.style.display = 'none'; }} />;
};
