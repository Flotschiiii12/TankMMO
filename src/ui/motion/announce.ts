/**
 * Big centre banners for level-up, rank-up (season tier) and quest complete. A queue shows them one at a time
 * so two events in the same second never overlap. Pure logic plus a tiny store; AnnounceHost renders it.
 */
export type AnnounceKind = 'levelup' | 'rankup' | 'quest';
export interface Announcement { id: number; kind: AnnounceKind; title: string; sub?: string }
export const ANNOUNCE_MS = 2800;
export const MAX_QUEUE = 4;

export interface ProgressSnapshot { level: number; tier: number; readyQuests: string[] }

export interface RawAnnounce { kind: AnnounceKind; value: number | string }
/** What to announce when going from one snapshot to the next. Levels and tiers announce only the highest value reached. */
export function diffAnnouncements(prev: ProgressSnapshot, next: ProgressSnapshot): RawAnnounce[] {
  const out: RawAnnounce[] = [];
  if (next.level > prev.level) out.push({ kind: 'levelup', value: next.level });
  if (next.tier > prev.tier) out.push({ kind: 'rankup', value: next.tier });
  const was = new Set(prev.readyQuests);
  for (const id of next.readyQuests) if (!was.has(id)) out.push({ kind: 'quest', value: id });
  return out;
}

export class AnnounceStore {
  private nextId = 1;
  private queue: Announcement[] = [];
  private current: Announcement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private subs = new Set<() => void>();
  private snap: Announcement | null = null;
  constructor(private onShow?: (a: Announcement) => void, private ms = ANNOUNCE_MS) {}
  subscribe = (f: () => void): (() => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  getSnapshot = (): Announcement | null => this.snap;
  push(a: Omit<Announcement, 'id'>): void {
    if (this.queue.length >= MAX_QUEUE) this.queue.shift();
    this.queue.push({ ...a, id: this.nextId++ });
    if (!this.current) this.advance();
  }
  private advance(): void {
    this.current = this.queue.shift() ?? null;
    this.snap = this.current;
    if (this.current) { this.onShow?.(this.current); this.timer = setTimeout(() => this.advance(), this.ms); } else this.timer = null;
    this.subs.forEach((f) => f());
  }
  clear(): void { if (this.timer) clearTimeout(this.timer); this.timer = null; this.queue = []; this.current = null; this.snap = null; this.subs.forEach((f) => f()); }
}
