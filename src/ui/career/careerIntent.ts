/** Lets other screens (garage "Talents" button) open the career window on a given tab. */
export type CareerTab = 'talents' | 'achievements' | 'codex' | 'season';
let want: CareerTab | null = null; const subs = new Set<() => void>();
export const careerIntent = { set(t: CareerTab) { want = t; subs.forEach((f) => f()); }, take(): CareerTab | null { const t = want; want = null; return t; }, peek: () => want, subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; } };
