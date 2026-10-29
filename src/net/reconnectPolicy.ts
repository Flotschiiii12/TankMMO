export const MAX_AUTO_RECONNECT_ATTEMPTS = 5;

/** Exponential retry delay in milliseconds, capped to keep recovery responsive. `attempt` is zero-based. */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(16_000, 1_000 * 2 ** Math.max(0, Math.floor(attempt)));
}
