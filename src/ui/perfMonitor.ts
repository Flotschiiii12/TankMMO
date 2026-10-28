/**
 * Automatic performance mode: when frames stay slower than `thresholdMs` for `holdSeconds` in a row, ask for the cheaper
 * look once. Pure logic (no timers, no DOM) so it is unit tested; GameShell feeds it the frame deltas.
 */
export class PerfMonitor {
  private slowSeconds = 0;
  private ema = 0;
  private fired = false;
  constructor(private thresholdMs = 22, private holdSeconds = 5) {}

  /** Feed one frame time in milliseconds. Returns true exactly once, when the slow streak has lasted long enough. */
  frame(dtMs: number): boolean {
    if (this.fired || !Number.isFinite(dtMs) || dtMs <= 0) return false;
    if (dtMs > 500) return false; // a tab switch or a debugger pause is not slowness
    this.ema = this.ema === 0 ? dtMs : this.ema * 0.9 + dtMs * 0.1;
    if (this.ema > this.thresholdMs) this.slowSeconds += dtMs / 1000; else this.slowSeconds = 0;
    if (this.slowSeconds >= this.holdSeconds) { this.fired = true; return true; }
    return false;
  }
  /** Allow the monitor to fire again (the player switched performance mode off on purpose and we do not nag; use for tests). */
  reset(): void { this.slowSeconds = 0; this.ema = 0; this.fired = false; }
  get smoothedMs(): number { return this.ema; }
}

/** The DPR cap of the canvas: 2 normally, 1.5 in performance mode. */
export const dprCap = (performanceMode: boolean | undefined): number => (performanceMode ? 1.5 : 2);
