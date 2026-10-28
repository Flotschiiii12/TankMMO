import type { CSSProperties } from 'react';

/**
 * The free band between the joystick (9 rem from its screen edge) and the fire cluster (13 rem), whichever side each is on,
 * respecting the notch insets. Chat and the chat log live here so they never cover the controls.
 */
export function controlStrip(leftHanded: boolean | undefined, bottom: string): CSSProperties {
  const near = leftHanded ? '13rem' : '9rem'; const far = leftHanded ? '9rem' : '13rem';
  return { left: `calc(max(1.25rem, var(--safe-left)) + ${near})`, right: `calc(max(1.25rem, var(--safe-right)) + ${far})`, bottom };
}
