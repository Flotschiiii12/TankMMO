import React, { useEffect, useRef } from 'react';
import { countUpDuration, countUpValue, prefersReducedMotion } from './motion.ts';

/** A number that counts up to its new value. Writes the text node directly (no React state per frame); reduced motion jumps. */
export const CountUp: React.FC<{ value: number; format?: (n: number) => string; className?: string }> = ({ value, format = (n) => Math.round(n).toLocaleString('en-US'), className }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const raf = useRef(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const from = shown.current; const to = value;
    cancelAnimationFrame(raf.current);
    const dur = countUpDuration(from, to);
    if (from === to || dur === 0 || prefersReducedMotion() || Math.abs(to - from) < 2) { shown.current = to; el.textContent = format(to); return; }
    const t0 = performance.now();
    const step = (now: number) => {
      const t = (now - t0) / dur; const v = countUpValue(from, to, t);
      shown.current = v; el.textContent = format(v);
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref} className={`tabular-nums ${className ?? ''}`}>{format(shown.current)}</span>;
};
