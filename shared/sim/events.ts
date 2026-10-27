/**
 * World events (design doc section 7). The schedule is a pure function of server clock seconds, so every
 * server instance agrees on which event is running without any shared state.
 */
export type WorldEventKind = 'invasion' | 'convoy_race' | 'storm_event' | 'meteor_shower' | 'weekend_xp';

export interface EventRule {
  kind: WorldEventKind;
  periodSeconds: number; // a new window starts every period
  offsetSeconds: number;
  durationSeconds: number;
  /** Maps the event applies to (undefined = every map). */
  mapIds?: number[];
}

export const EVENT_RULES: EventRule[] = [
  { kind: 'invasion', periodSeconds: 3 * 3600, offsetSeconds: 0, durationSeconds: 15 * 60, mapIds: [1, 5, 9] },
  { kind: 'convoy_race', periodSeconds: 4 * 3600, offsetSeconds: 3600, durationSeconds: 20 * 60, mapIds: [14, 15, 19] },
  { kind: 'storm_event', periodSeconds: 6 * 3600, offsetSeconds: 2 * 3600, durationSeconds: 30 * 60, mapIds: [17, 18, 27] },
  { kind: 'meteor_shower', periodSeconds: 5 * 3600, offsetSeconds: 1800, durationSeconds: 15 * 60, mapIds: [16, 20, 23] },
];

export const WEEKEND_XP_MULTIPLIER = 1.5;
export const WORLD_BOSS_PERIOD_SECONDS = 2 * 3600;
export const WORLD_BOSS_MAPS = [19, 27];

export interface ActiveEvent {
  id: string; // stable id: kind@windowStart
  kind: WorldEventKind;
  startsAt: number;
  endsAt: number;
}

export function activeEvents(clockSeconds: number): ActiveEvent[] {
  const out: ActiveEvent[] = [];
  for (const r of EVENT_RULES) {
    const t = clockSeconds - r.offsetSeconds;
    if (t < 0) continue;
    const windowIndex = Math.floor(t / r.periodSeconds);
    const startsAt = r.offsetSeconds + windowIndex * r.periodSeconds;
    if (clockSeconds < startsAt + r.durationSeconds) out.push({ id: `${r.kind}@${startsAt}`, kind: r.kind, startsAt, endsAt: startsAt + r.durationSeconds });
  }
  // Weekend XP: Saturday and Sunday (epoch day 0 = Thursday 1970-01-01)
  const day = Math.floor(clockSeconds / 86400);
  const dow = (day + 4) % 7; // 0 = Sunday
  if (dow === 0 || dow === 6) {
    const dayStart = day * 86400;
    out.push({ id: `weekend_xp@${dayStart}`, kind: 'weekend_xp', startsAt: dayStart, endsAt: dayStart + 86400 });
  }
  return out;
}

export function eventAppliesToMap(kind: WorldEventKind, mapId: number): boolean {
  const rule = EVENT_RULES.find((r) => r.kind === kind);
  return !rule || !rule.mapIds || rule.mapIds.includes(mapId);
}

/** Which world boss slot is current: slot index = floor(clock / period); the maps rotate through WORLD_BOSS_MAPS. */
export function worldBossSlot(clockSeconds: number): { slot: number; mapId: number; startsAt: number } {
  const slot = Math.floor(clockSeconds / WORLD_BOSS_PERIOD_SECONDS);
  return { slot, mapId: WORLD_BOSS_MAPS[slot % WORLD_BOSS_MAPS.length], startsAt: slot * WORLD_BOSS_PERIOD_SECONDS };
}
