/**
 * Entity delta encoding shared by server and client. The server keeps, per connection, the last state it
 * sent for every entity and transmits only changed fields; the client merges them back.
 */
import type { SimEntity } from '../types.ts';

export type EntityPatch = { id: number; full?: SimEntity; d?: Partial<SimEntity> };

const round = (v: number): number => Math.round(v * 100) / 100;

/** Plain-data copy with numbers rounded to 0.01 so tiny float noise does not count as a change. */
export function compactEntity(e: SimEntity): SimEntity {
  const out: any = {};
  for (const [k, v] of Object.entries(e)) {
    if (v === undefined) continue;
    if (typeof v === 'number') out[k] = round(v);
    else if (v && typeof v === 'object' && 'x' in (v as any) && 'y' in (v as any) && Object.keys(v as object).length === 2) out[k] = { x: round((v as any).x), y: round((v as any).y) };
    else out[k] = v;
  }
  return out as SimEntity;
}

export function diffEntity(prev: SimEntity | undefined, cur: SimEntity): EntityPatch | undefined {
  if (!prev) return { id: cur.id, full: cur };
  const d: any = {};
  let changed = false;
  for (const k of Object.keys(cur) as Array<keyof SimEntity>) {
    if (JSON.stringify(prev[k]) !== JSON.stringify(cur[k])) { d[k] = cur[k]; changed = true; }
  }
  for (const k of Object.keys(prev) as Array<keyof SimEntity>) if (!(k in cur)) { d[k] = null; changed = true; }
  return changed ? { id: cur.id, d } : undefined;
}

export function applyPatch(entities: Map<number, SimEntity>, patch: EntityPatch): void {
  if (patch.full) { entities.set(patch.id, { ...patch.full }); return; }
  const e: any = entities.get(patch.id);
  if (!e || !patch.d) return;
  for (const [k, v] of Object.entries(patch.d)) { if (v === null) delete e[k]; else e[k] = v; }
}

/** Tracks what one client already knows. */
export class DeltaEncoder {
  private known = new Map<number, SimEntity>();

  encode(visible: SimEntity[]): { patches: EntityPatch[]; removed: number[] } {
    const patches: EntityPatch[] = [];
    const seen = new Set<number>();
    for (const e of visible) {
      seen.add(e.id);
      const cur = compactEntity(e);
      const patch = diffEntity(this.known.get(e.id), cur);
      if (patch) patches.push(patch);
      this.known.set(e.id, cur);
    }
    const removed: number[] = [];
    for (const id of this.known.keys()) if (!seen.has(id)) { removed.push(id); this.known.delete(id); }
    return { patches, removed };
  }

  /** Forget everything (map change): the next encode sends full entities. */
  reset(): void { this.known.clear(); }
}
