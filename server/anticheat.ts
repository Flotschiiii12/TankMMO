/**
 * Anti-cheat basics (design doc section 11). The server is authoritative, so most cheats simply do not work; this adds
 * visibility: counters for rejected input and heuristics for bots (machine-regular timing, 24/7 sessions).
 */
export interface SuspicionReport { accountId: string; name: string; score: number; reasons: string[] }

export class AntiCheat {
  private stats = new Map<string, { name: string; joinedAt: number; intervals: number[]; lastInputAt: number; rejected: number; floods: number }>();

  join(accountId: string, name: string, now: number): void {
    this.stats.set(accountId, { name, joinedAt: now, intervals: [], lastInputAt: 0, rejected: 0, floods: 0 });
  }
  leave(accountId: string): void { this.stats.delete(accountId); }

  /** Called for every accepted input packet. */
  input(accountId: string, now: number): void {
    const s = this.stats.get(accountId);
    if (!s) return;
    if (s.lastInputAt) { s.intervals.push(now - s.lastInputAt); if (s.intervals.length > 200) s.intervals.shift(); }
    s.lastInputAt = now;
  }
  rejected(accountId: string, kind: 'replay' | 'flood' | 'invalid'): void {
    const s = this.stats.get(accountId);
    if (!s) return;
    if (kind === 'flood') s.floods++; else s.rejected++;
  }

  report(accountId: string, now: number): SuspicionReport | undefined {
    const s = this.stats.get(accountId);
    if (!s) return undefined;
    const reasons: string[] = [];
    let score = 0;
    if (s.intervals.length >= 100) {
      const mean = s.intervals.reduce((a, b) => a + b, 0) / s.intervals.length;
      const sd = Math.sqrt(s.intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / s.intervals.length);
      if (mean > 0 && sd / mean < 0.02) { score += 40; reasons.push('machine-regular input timing'); }
    }
    if (s.rejected >= 20) { score += 20; reasons.push(`${s.rejected} rejected inputs`); }
    if (s.floods >= 5) { score += 25; reasons.push('input flooding'); }
    if (now - s.joinedAt > 20 * 3600_000) { score += 15; reasons.push('session longer than 20 h'); }
    return { accountId, name: s.name, score, reasons };
  }

  flagged(now: number, minScore = 40): SuspicionReport[] {
    return [...this.stats.keys()].map((id) => this.report(id, now)!).filter((r) => r.score >= minScore).sort((a, b) => b.score - a.score);
  }
}
