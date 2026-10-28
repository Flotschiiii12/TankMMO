/**
 * Notification centre store: grouped toasts (loot, xp, quest, system) plus a short history. Pure logic, no React.
 * Events of the same group and key that arrive within MERGE_MS are folded into one entry ("+120 scrap" instead of five toasts).
 */
export type NotifyGroup = 'loot' | 'xp' | 'quest' | 'system';
export interface Notice { id: number; group: NotifyGroup; key: string; title: string; amount: number; count: number; unit?: string; kind: 'info' | 'success' | 'warn'; at: number; icon?: string; rarity?: string }
export const MERGE_MS = 2500;
export const TOAST_MS = 4500;
export const MAX_ACTIVE = 3;
export const MAX_HISTORY = 40;

export interface NotifyInput { group: NotifyGroup; key?: string; title: string; amount?: number; unit?: string; kind?: Notice['kind']; icon?: string; rarity?: string }

export class NotifyStore {
  private nextId = 1;
  private list: Notice[] = [];
  private seenUntil = 0;
  private subs = new Set<() => void>();
  private snap: { active: Notice[]; history: Notice[]; unread: number } = { active: [], history: [], unread: 0 };
  constructor(private now: () => number = () => Date.now()) {}

  subscribe = (f: () => void): (() => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  getSnapshot = () => this.snap;
  private emit(): void {
    const t = this.now();
    this.snap = { active: this.list.filter((n) => t - n.at < TOAST_MS).slice(-MAX_ACTIVE), history: [...this.list].reverse(), unread: this.list.filter((n) => n.id > this.seenUntil).length };
    this.subs.forEach((f) => f());
  }

  push(input: NotifyInput): Notice {
    const t = this.now(); const key = input.key ?? input.title;
    const last = [...this.list].reverse().find((n) => n.group === input.group && n.key === key);
    if (last && t - last.at < MERGE_MS) {
      last.amount += input.amount ?? 0; last.count += 1; last.at = t; last.kind = input.kind ?? last.kind; this.emit(); return last;
    }
    const n: Notice = { id: this.nextId++, group: input.group, key, title: input.title, amount: input.amount ?? 0, count: 1, unit: input.unit, kind: input.kind ?? 'info', at: t, icon: input.icon, rarity: input.rarity };
    this.list.push(n); if (this.list.length > MAX_HISTORY) this.list.shift();
    this.emit(); return n;
  }
  /** Marks everything as read (history window opened). */
  markRead(): void { this.seenUntil = this.nextId; this.emit(); }
  /** Re-evaluates which toasts are still fresh (call from a timer). */
  tick(): void { this.emit(); }
  clear(): void { this.list = []; this.emit(); }
}

/** Display line of a notice: "+120 scrap", "3× Cannon T1", "Level up!". */
export function noticeText(n: Notice): string {
  if (n.amount) return `${n.amount > 0 ? '+' : '−'}${Math.abs(Math.round(n.amount)).toLocaleString('en-US')}${n.unit ? ` ${n.unit}` : ''}${n.title ? ` ${n.title}` : ''}`.trim();
  return n.count > 1 ? `${n.count}× ${n.title}` : n.title;
}

export const notifications = new NotifyStore();

// ---------------------------------------------------------------- derive notices from character changes (client only, no protocol)
export interface CharSnapshot { xp: number; level: number; scrap: number; fragments: number; ore: number; itemUids: string[]; readyQuests: string[]; honor: number }

export interface DiffNotice extends NotifyInput { amount?: number }
/** What changed between two character snapshots, as notices. Spending (negative scrap) is not announced. */
export function diffCharacter(prev: CharSnapshot, next: CharSnapshot, itemName: (uid: string) => string, questName: (id: string) => string, t: { levelUp: (lv: number) => string; xp: string; scrap: string; fragments: string; ore: string; honor: string; questReady: string }, itemRarity?: (uid: string) => string | undefined): DiffNotice[] {
  const out: DiffNotice[] = [];
  if (next.level > prev.level) out.push({ group: 'xp', key: 'level', title: t.levelUp(next.level), kind: 'success' });
  else if (next.xp > prev.xp) out.push({ group: 'xp', key: 'xp', title: '', amount: next.xp - prev.xp, unit: t.xp });
  if (next.scrap > prev.scrap) out.push({ group: 'loot', key: 'scrap', title: '', amount: next.scrap - prev.scrap, unit: t.scrap });
  if (next.fragments > prev.fragments) out.push({ group: 'loot', key: 'fragments', title: '', amount: next.fragments - prev.fragments, unit: t.fragments });
  if (next.ore > prev.ore) out.push({ group: 'loot', key: 'ore', title: '', amount: next.ore - prev.ore, unit: t.ore });
  if (next.honor > prev.honor) out.push({ group: 'xp', key: 'honor', title: '', amount: next.honor - prev.honor, unit: t.honor });
  const had = new Set(prev.itemUids);
  for (const uid of next.itemUids) if (!had.has(uid)) out.push({ group: 'loot', key: `item:${itemName(uid)}`, title: itemName(uid), kind: 'success', rarity: itemRarity?.(uid) });
  const was = new Set(prev.readyQuests);
  for (const id of next.readyQuests) if (!was.has(id)) out.push({ group: 'quest', key: `ready:${id}`, title: `${t.questReady}: ${questName(id)}`, kind: 'success' });
  return out;
}
