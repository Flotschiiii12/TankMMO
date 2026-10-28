/**
 * Snapshot interpolation for remote vehicles. Samples are kept with their arrival time and drawn slightly in the past, so a late
 * or bunched-up server update (a stalled server tick, network jitter, far entities that only update every 200 ms) never makes a
 * vehicle stop and jump. The delay adapts to how often an entity is updated.
 */
export interface PoseSample { t: number; x: number; y: number; a: number; ta: number }

const MIN_DELAY_MS = 130;
const MAX_DELAY_MS = 380;
const DELAY_PER_GAP = 1.45;
const MAX_SAMPLES = 8;

const angleDiff = (a: number, b: number): number => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

export class RemoteInterpolator {
  private samples = new Map<number, PoseSample[]>();
  private gap = new Map<number, number>();

  push(id: number, now: number, x: number, y: number, a: number, ta: number): void {
    let list = this.samples.get(id);
    if (!list) { list = []; this.samples.set(id, list); }
    const last = list[list.length - 1];
    if (last) {
      const g = now - last.t;
      if (g > 5) this.gap.set(id, (this.gap.get(id) ?? g) * 0.7 + Math.min(g, 600) * 0.3);
    }
    list.push({ t: now, x, y, a, ta });
    if (list.length > MAX_SAMPLES) list.shift();
  }

  /** How far in the past this entity is drawn. */
  delayFor(id: number): number {
    return Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, (this.gap.get(id) ?? 100) * DELAY_PER_GAP));
  }

  sample(id: number, now: number): PoseSample | undefined {
    const list = this.samples.get(id);
    if (!list || list.length === 0) return undefined;
    const t = now - this.delayFor(id);
    if (list.length === 1 || t <= list[0].t) return list[0];
    const last = list[list.length - 1];
    if (t >= last.t) return last;
    let i = 1;
    while (i < list.length - 1 && list[i].t < t) i++;
    const a = list[i - 1], b = list[i];
    const k = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
    return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, a: a.a + angleDiff(b.a, a.a) * k, ta: a.ta + angleDiff(b.ta, a.ta) * k };
  }

  remove(id: number): void { this.samples.delete(id); this.gap.delete(id); }
  clear(): void { this.samples.clear(); this.gap.clear(); }
}
