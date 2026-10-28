import React, { useRef } from 'react';

/** Cooldown overlay for a button: a dark layer that shrinks from `remaining/total` to 0 with a CSS animation (transform only, no per-frame state). */
export const CooldownSweep: React.FC<{ remaining: number; total: number; showNumber?: boolean }> = ({ remaining, total, showNumber = true }) => {
  const gen = useRef(0); const prev = useRef(0);
  if (remaining > prev.current + 0.6) gen.current++; // a new cooldown started: restart the animation
  prev.current = remaining;
  if (remaining <= 0) return null;
  return (
    <>
      <div key={gen.current} className="k-cd" style={{ animationDuration: `${remaining}s`, ['--cd-start' as string]: Math.min(1, remaining / Math.max(0.1, total)) }} />
      {showNumber && <span className="k-cd-num">{Math.ceil(remaining)}</span>}
    </>
  );
};

/** Cooldown lengths of the three base abilities in seconds (mirrors shared/sim/world.ts; the server stays authoritative). */
export const ABILITY_COOLDOWN = { smoke: 18, repair_kit: 25, boost: 20 } as const;
