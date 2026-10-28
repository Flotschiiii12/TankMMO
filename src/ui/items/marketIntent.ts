/** One-shot hand-over from the inventory ("List on market") to the market window's sell wizard. */
let uid: string | null = null;
const subs = new Set<() => void>();
export const marketIntent = {
  set(u: string): void { uid = u; subs.forEach((f) => f()); },
  take(): string | null { const u = uid; uid = null; return u; },
  peek(): string | null { return uid; },
  subscribe(f: () => void): () => void { subs.add(f); return () => { subs.delete(f); }; },
};
