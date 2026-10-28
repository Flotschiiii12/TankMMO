import { useEffect, useRef, useState } from 'react';

/** Trailing value for bars: follows increases at once and decreases after `delayMs`, so damage reads as a chunk that drains away. */
export function useGhost(value: number, delayMs = 450): number {
  const [ghost, setGhost] = useState(value); const t = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(t.current);
    if (value >= ghost) { setGhost(value); return; }
    t.current = window.setTimeout(() => setGhost(value), delayMs);
    return () => window.clearTimeout(t.current);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return Math.max(ghost, value);
}
