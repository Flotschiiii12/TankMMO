/** Loading bar: fixed milestones per stage, creeping towards the next one while we wait so the bar never looks stuck. */
export type LoadStage = 'server' | 'login' | 'connect' | 'world' | 'ready';
const BASE: Record<LoadStage, number> = { server: 0.06, login: 0.28, connect: 0.5, world: 0.8, ready: 1 };
const NEXT: Record<LoadStage, LoadStage> = { server: 'login', login: 'connect', connect: 'world', world: 'ready', ready: 'ready' };

export function loadProgress(stage: LoadStage, elapsedMs: number): number {
  if (stage === 'ready') return 1;
  const from = BASE[stage]; const to = BASE[NEXT[stage]];
  const creep = 1 - Math.exp(-Math.max(0, elapsedMs) / 2500); // 0..1, never reaches 1
  return from + (to - from) * 0.85 * creep;
}

export const STAGE_LABEL: Record<LoadStage, string> = {
  server: 'Looking for the server…',
  login: 'Signing in…',
  connect: 'Connecting…',
  world: 'Loading the battlefield…',
  ready: 'Ready',
};
