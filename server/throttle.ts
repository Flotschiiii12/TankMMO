/**
 * Exponential back-off for repeated failures per key (usually the client IP).
 * The first `free` failures inside the decay window cost nothing, so players behind one shared NAT are not punished for
 * a few typos; after that the block doubles with every further failure up to `maxMs`.
 */
import type { IncomingMessage } from 'node:http';

export interface BackoffOptions { free: number; baseMs: number; maxMs: number; decayMs: number; maxKeys?: number }

export class FailureBackoff {
  private m = new Map<string, { fails: number; last: number; until: number }>();
  constructor(private o: BackoffOptions) {}

  /** Milliseconds the key must still wait (0 = allowed). */
  blockedFor(key: string, now: number): number {
    const e = this.m.get(key);
    if (!e) return 0;
    if (now - e.last > this.o.decayMs) { this.m.delete(key); return 0; }
    return Math.max(0, e.until - now);
  }

  fail(key: string, now: number): number {
    let e = this.m.get(key);
    if (!e || now - e.last > this.o.decayMs) e = { fails: 0, last: now, until: 0 };
    e.fails++; e.last = now;
    const over = e.fails - this.o.free;
    if (over > 0) e.until = now + Math.min(this.o.maxMs, this.o.baseMs * 2 ** Math.min(30, over - 1));
    this.m.set(key, e);
    if (this.m.size > (this.o.maxKeys ?? 50_000)) this.prune(now);
    return Math.max(0, e.until - now);
  }

  private prune(now: number): void {
    for (const [k, v] of this.m) if (now - v.last > this.o.decayMs) this.m.delete(k);
    if (this.m.size > (this.o.maxKeys ?? 50_000)) this.m.clear(); // worst case: forget everybody rather than grow without bound
  }
  get size(): number { return this.m.size; }
}

/**
 * Client address of a WebSocket upgrade. Behind a reverse proxy (TRUST_PROXY=<hops>) the right-most `hops`-th entry of
 * X-Forwarded-For is used - entries further left can be forged by the client.
 */
export function clientIp(req: IncomingMessage): string {
  const hops = Number(process.env.TRUST_PROXY ?? 0);
  if (hops > 0) {
    const xff = String(req.headers['x-forwarded-for'] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    if (xff.length >= hops) return xff[xff.length - hops];
  }
  return req.socket.remoteAddress ?? 'unknown';
}
