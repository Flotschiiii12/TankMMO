import type { CharacterState } from './character.ts';
/** Gold league needs a recorded arena power >= 1200 (see arena.ts); the character keeps its best power for this. */
export function arenaLeagueIndexForGold(c: CharacterState): number { return c.stats['best_arena_power'] >= 1200 ? 1 : 0; }
