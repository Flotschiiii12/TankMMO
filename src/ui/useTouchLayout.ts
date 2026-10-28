import { useEffect, useState } from 'react';

export type TouchControlsSetting = 'auto' | 'on' | 'off';
/** Pure decision: explicit setting wins, otherwise touch layout when the primary pointer is coarse (phones, tablets). */
export function decideTouchLayout(setting: TouchControlsSetting | undefined, primaryPointerCoarse: boolean): boolean {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return primaryPointerCoarse;
}
/** True when the on-screen joystick and thumb cluster are used; false gives the hotbar layout for mouse and keyboard. */
export function useTouchLayout(setting: TouchControlsSetting | undefined): boolean {
  const q = '(pointer: coarse)';
  const [coarse, setCoarse] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => { const m = window.matchMedia?.(q); if (!m) return; const on = () => setCoarse(m.matches); m.addEventListener('change', on); on(); return () => m.removeEventListener('change', on); }, []);
  return decideTouchLayout(setting, coarse);
}
