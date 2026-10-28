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
  /** four states of the primary button (idle uses buttonPrimary), a tab strip item and decorations */
  buttonHover: '/assets/ui/btn_primary_hover.png',
  buttonDown: '/assets/ui/btn_primary_down.png',
  buttonOff: '/assets/ui/btn_primary_off.png',
  tabIdle: '/assets/ui/tab_idle.png',
  badgeRibbon: '/assets/ui/badge_ribbon.png',
  bannerRibbon: '/assets/ui/banner_ribbon.png',
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

/**
 * 9-slice frame from a painted image: returns the attributes to spread on the element. Nothing (so the CSS border stays) until the
 * file is listed in manifest.json. `slice` is the corner size in source pixels, drawn at the same size in CSS px.
 */
export function useArtFrame(path: string, slice = 32): { 'data-art-frame'?: 'yes'; style?: React.CSSProperties } {
  const ok = useArt(path);
  return ok ? { 'data-art-frame': 'yes', style: { '--art-img': `url(${path})`, '--art-slice': slice } as React.CSSProperties } : {};
}
