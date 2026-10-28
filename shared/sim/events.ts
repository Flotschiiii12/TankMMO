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

// ---------------------------------------------------------------------------
// Calendar and rewards (cloud run 3). Everything is a pure function of the clock, so the server, the client banner chip and
// the calendar screen agree without any shared state.
// ---------------------------------------------------------------------------

export interface CalendarEntry { kind: WorldEventKind | 'world_boss'; startsAt: number; endsAt: number; mapIds?: number[] }

/** Events that are running now or start within `horizonSeconds`, soonest first. World boss slots run until the next slot starts. */
export function upcomingEvents(clockSeconds: number, horizonSeconds = 24 * 3600, limit = 24): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  const end = clockSeconds + horizonSeconds;
  for (const r of EVENT_RULES) {
    let w = Math.max(0, Math.floor((clockSeconds - r.offsetSeconds) / r.periodSeconds));
    for (;; w++) {
      const startsAt = r.offsetSeconds + w * r.periodSeconds;
      if (startsAt > end) break;
      const endsAt = startsAt + r.durationSeconds;
      if (endsAt > clockSeconds) out.push({ kind: r.kind, startsAt, endsAt, mapIds: r.mapIds });
    }
  }
  for (let day = Math.floor(clockSeconds / 86400); day * 86400 <= end; day++) {
    const dow = (day + 4) % 7;
    if ((dow === 0 || dow === 6) && (day + 1) * 86400 > clockSeconds) out.push({ kind: 'weekend_xp', startsAt: day * 86400, endsAt: (day + 1) * 86400 });
  }
  for (let slot = Math.floor(clockSeconds / WORLD_BOSS_PERIOD_SECONDS); slot * WORLD_BOSS_PERIOD_SECONDS <= end; slot++) {
    out.push({ kind: 'world_boss', startsAt: slot * WORLD_BOSS_PERIOD_SECONDS, endsAt: (slot + 1) * WORLD_BOSS_PERIOD_SECONDS, mapIds: [WORLD_BOSS_MAPS[slot % WORLD_BOSS_MAPS.length]] });
  }
  return out.sort((a, b) => a.startsAt - b.startsAt || a.kind.localeCompare(b.kind)).slice(0, limit);
}

export const isWeekendXp = (clockSeconds: number): boolean => activeEvents(clockSeconds).some((e) => e.kind === 'weekend_xp');

/** Reward for fighting off an invasion: scrap per raider destroyed, nothing below 3 so that standing around earns nothing, capped. */
export const INVASION_MIN_KILLS = 3;
export const INVASION_SCRAP_PER_KILL = 40;
export const INVASION_SCRAP_CAP = 400;
export function invasionReward(kills: number): number {
  return kills < INVASION_MIN_KILLS ? 0 : Math.min(INVASION_SCRAP_CAP, kills * INVASION_SCRAP_PER_KILL);
}

/** Mining during a storm yields this much more ore. */
export const STORM_ORE_BONUS = 1.25;
export const CONVOY_RACE_CONVOYS = 2;
export const STORM_STRIKE_SECONDS = 6;
export const STORM_STRIKE_RADIUS = 110;
export const stormStrikeDamage = (level: number): number => Math.round(50 + level * 12);
