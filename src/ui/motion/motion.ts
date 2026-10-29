import { graphicsQualityFor, type GraphicsQualitySettings } from '../perfMonitor.ts';

/** Motion helpers (pure). Components never keep per-frame state in React; they write to the DOM or use CSS animations. */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** Value shown `t` (0..1) into a count-up from `from` to `to`. Integers only, ends exactly on `to`. */
export function countUpValue(from: number, to: number, t: number): number {
  if (t >= 1) return to;
  return Math.round(from + (to - from) * easeOutCubic(t));
}

/** Count-up length: short for small changes, capped so big jumps never feel slow. */
export function countUpDuration(from: number, to: number): number {
  const d = Math.abs(to - from);
  return d === 0 ? 0 : Math.min(900, 250 + Math.log10(d + 1) * 170);
}

/** True when the player or the OS asks for less motion (settings class or media query). */
export function prefersReducedMotion(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.classList.contains('reduced-motion')) return true;
  return systemPrefersReducedMotion();
}

export function systemPrefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function shouldPlayRewardEffects(settings: GraphicsQualitySettings & { reduceMotion?: boolean }, systemReducedMotion = false): boolean {
  const quality = graphicsQualityFor(settings);
  return (quality === 'high' || quality === 'medium') && !settings.reduceMotion && !systemReducedMotion;
}

export function bossSlowMotionTime(now: number, startedAt: number): number {
  const elapsed = now - startedAt;
  const slowDuration = 500;
  const recoveryDuration = 500;
  const slowScale = 0.35;
  const lostTime = slowDuration * (1 - slowScale);
  if (!Number.isFinite(elapsed) || elapsed <= 0) return now;
  if (elapsed < slowDuration) return now - elapsed * (1 - slowScale);
  if (elapsed < slowDuration + recoveryDuration) {
    const progress = (elapsed - slowDuration) / recoveryDuration;
    const eased = progress * progress * (3 - 2 * progress);
    return now - lostTime * (1 - eased);
  }
  return now;
}

export const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as const;
export const rarityRank = (r: string | undefined): number => Math.max(0, RARITY_ORDER.indexOf(r as (typeof RARITY_ORDER)[number]));
/** Items from Rare up get the reveal treatment (scale-in, glow, chime). */
export const isRevealRarity = (r: string | undefined): boolean => rarityRank(r) >= 2;
