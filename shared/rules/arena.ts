/**
 * Arena rules (design doc section 8): everyone drives THEIR OWN vehicle with THEIR OWN gear. Matchmaking is by
 * LEAGUE (derived from vehicle combat power, not level) plus an Elo-like rating per mode. Pure and deterministic.
 */
export const ARENA_MODES = { '1v1': 1, '3v3': 3, '5v5': 5 } as const;
export type ArenaMode = keyof typeof ARENA_MODES;

export const LEAGUES = [
  { id: 'bronze', minPower: 0 },
  { id: 'silver', minPower: 400 },
  { id: 'gold', minPower: 1200 },
  { id: 'platinum', minPower: 3000 },
  { id: 'diamond', minPower: 7000 },
  { id: 'master', minPower: 15000 },
] as const;
export type LeagueId = (typeof LEAGUES)[number]['id'];

export const START_RATING = 1000;
export const ELO_K = 32;
export const ROUNDS_TO_WIN = 2; // best of 3
export const COUNTDOWN_SECONDS = 5;
export const ROUND_BREAK_SECONDS = 4;
export const ROUND_TIME_LIMIT_SECONDS = 120;
export const WIDEN_AFTER_SECONDS = 30;
export const DODGE_PENALTY_SECONDS = 10 * 60;

export function leagueIndex(power: number): number {
  let idx = 0;
  LEAGUES.forEach((l, i) => { if (power >= l.minPower) idx = i; });
  return idx;
}
export const leagueForPower = (power: number): LeagueId => LEAGUES[leagueIndex(power)].id;

/** Vehicle combat power: sqrt(DPS x (hull+armor)) with a flat-reduction bonus (see rules/power.ts for the shared formula). */
export function arenaPower(dps: number, maxHull: number, maxArmor: number, flatReduction = 0): number {
  const dur = (maxHull + maxArmor) * (1 + Math.min(0.5, flatReduction / 100));
  return Math.max(1, Math.round(Math.sqrt(Math.max(1, dps) * Math.max(1, dur))));
}

export function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

/** Returns the rating deltas for teams A and B (zero-sum). scoreA is 1 (A won), 0 (A lost) or 0.5. */
export function eloDelta(ratingA: number, ratingB: number, scoreA: number, k = ELO_K): { a: number; b: number } {
  const d = Math.round(k * (scoreA - expectedScore(ratingA, ratingB)));
  return { a: d, b: -d };
}

export interface QueueEntry {
  id: string;
  mode: ArenaMode;
  power: number;
  rating: number;
  queuedAt: number; // seconds
}

export interface FoundMatch { mode: ArenaMode; teamA: QueueEntry[]; teamB: QueueEntry[] }

/** Players of the same league are matched; after 30 s of waiting neighbouring leagues are allowed too. */
export function findMatches(queue: QueueEntry[], now: number): FoundMatch[] {
  const matches: FoundMatch[] = [];
  const used = new Set<string>();
  for (const mode of Object.keys(ARENA_MODES) as ArenaMode[]) {
    const size = ARENA_MODES[mode];
    const pool = queue.filter((e) => e.mode === mode && !used.has(e.id)).sort((x, y) => x.queuedAt - y.queuedAt);
    for (const seed of pool) {
      if (used.has(seed.id)) continue;
      const widen = Math.floor((now - seed.queuedAt) / WIDEN_AFTER_SECONDS);
      const candidates = pool
        .filter((e) => !used.has(e.id) && Math.abs(leagueIndex(e.power) - leagueIndex(seed.power)) <= widen)
        .sort((x, y) => Math.abs(x.rating - seed.rating) - Math.abs(y.rating - seed.rating))
        .slice(0, size * 2);
      if (candidates.length < size * 2 || !candidates.some((c) => c.id === seed.id)) continue;
      // balance: sort by rating and deal alternately (snake draft) so team averages stay close
      const sorted = [...candidates].sort((x, y) => y.rating - x.rating);
      const teamA: QueueEntry[] = []; const teamB: QueueEntry[] = [];
      sorted.forEach((e, i) => ((i % 4 === 0 || i % 4 === 3 ? teamA : teamB).push(e)));
      matches.push({ mode, teamA, teamB });
      for (const e of candidates) used.add(e.id);
    }
  }
  return matches;
}

export interface MatchState {
  mode: ArenaMode;
  phase: 'countdown' | 'fighting' | 'break' | 'finished';
  phaseEndsAt: number;
  round: number;
  wins: [number, number];
  winner?: 0 | 1;
  roundStartedAt: number;
  /** host bookkeeping: the board was reset for the current countdown */
  resetDone?: boolean;
}

export function newMatch(mode: ArenaMode, now: number): MatchState {
  return { mode, phase: 'countdown', phaseEndsAt: now + COUNTDOWN_SECONDS, round: 1, wins: [0, 0], roundStartedAt: now };
}

/** Advances the match given who is still alive. Returns what happened so the host can reset/respawn players. */
export function advanceMatch(m: MatchState, now: number, alive: [number, number]): 'none' | 'round_started' | 'round_over' | 'match_over' {
  if (m.phase === 'finished') return 'none';
  if (m.phase === 'countdown') {
    if (now < m.phaseEndsAt) return 'none';
    m.phase = 'fighting'; m.roundStartedAt = now;
    return 'round_started';
  }
  if (m.phase === 'break') {
    if (now < m.phaseEndsAt) return 'none';
    m.phase = 'countdown'; m.phaseEndsAt = now + 3; m.round++;
    return 'none';
  }
  // fighting
  let roundWinner: 0 | 1 | undefined;
  if (alive[0] === 0 && alive[1] === 0) roundWinner = undefined;
  else if (alive[0] === 0) roundWinner = 1;
  else if (alive[1] === 0) roundWinner = 0;
  const timeUp = now - m.roundStartedAt >= ROUND_TIME_LIMIT_SECONDS;
  if (roundWinner === undefined && !timeUp && !(alive[0] === 0 && alive[1] === 0)) return 'none';
  if (roundWinner === undefined) roundWinner = alive[0] === alive[1] ? undefined as any : alive[0] > alive[1] ? 0 : 1; // time up: more survivors wins; tie = no point
  if (roundWinner !== undefined) m.wins[roundWinner]++;
  if (m.wins[0] >= ROUNDS_TO_WIN || m.wins[1] >= ROUNDS_TO_WIN) { m.phase = 'finished'; m.winner = m.wins[0] > m.wins[1] ? 0 : 1; return 'match_over'; }
  m.phase = 'break'; m.phaseEndsAt = now + ROUND_BREAK_SECONDS;
  return 'round_over';
}
