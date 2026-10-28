import { useEffect, useState } from 'react';

/** True on short screens (phones in landscape, small laptops): HUD blocks show fewer lines there. Matches the CSS breakpoint in index.css. */
export function useShortScreen(): boolean {
  const q = '(max-height: 799px)';
  const [short, setShort] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q); if (!m) return;
    const on = () => setShort(m.matches);
    m.addEventListener('change', on); on();
    return () => m.removeEventListener('change', on);
  }, []);
  return short;
}
