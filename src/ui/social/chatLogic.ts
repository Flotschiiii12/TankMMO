/** Pure chat logic: item link tokens, mentions, message grouping and the per-channel history with unread counters. */
import type { ChatMessage } from '../../sim/types.ts';
import { ITEM_BY_ID } from '../../../shared/data/items.ts';
import { RARITIES } from '../kit/logic.ts';

export type Channel = ChatMessage['channel'];
export const CHANNELS: ReadonlyArray<{ id: Channel; label: string; sendable: boolean }> = [
  { id: 'G', label: 'Global', sendable: true }, { id: 'M', label: 'Map', sendable: true }, { id: 'F', label: 'Faction', sendable: true }, { id: 'C', label: 'Clan', sendable: true },
  { id: 'A', label: 'Allies', sendable: true }, { id: 'P', label: 'Party', sendable: true }, { id: 'W', label: 'Whispers', sendable: true }, { id: 'S', label: 'System', sendable: false },
];

// ---------------------------------------------------------------- item links
/** Chat text carries items as `{{i:<defId>:<Rarity>:<upgrade>}}`; the client renders them from the shared catalogue (cosmetic, the server does not check ownership). */
export function itemLinkToken(item: { defId: string; rarity: string; upgrade: number }): string { return `{{i:${item.defId}:${item.rarity}:${item.upgrade}}}`; }
export type Segment = { kind: 'text'; text: string } | { kind: 'item'; defId: string; rarity: string; upgrade: number } | { kind: 'mention'; text: string };
const LINK = /\{\{i:([a-z0-9_]+):(Common|Uncommon|Rare|Epic|Legendary):(\d{1,2})\}\}/g;
/** Splits chat text into plain text, valid item links (unknown items stay text) and @mentions of `myName`. */
export function parseChatText(text: string, myName?: string): Segment[] {
  const out: Segment[] = []; let last = 0; let m: RegExpExecArray | null; LINK.lastIndex = 0;
  const pushText = (t: string) => {
    if (!t) return;
    if (!myName) { out.push({ kind: 'text', text: t }); return; }
    const re = new RegExp(`@${myName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'); let p = 0; let mm: RegExpExecArray | null;
    while ((mm = re.exec(t))) { if (mm.index > p) out.push({ kind: 'text', text: t.slice(p, mm.index) }); out.push({ kind: 'mention', text: mm[0] }); p = mm.index + mm[0].length; }
    if (p < t.length) out.push({ kind: 'text', text: t.slice(p) });
  };
  while ((m = LINK.exec(text))) {
    if (!ITEM_BY_ID.has(m[1])) continue; // unknown item: leave the raw text
    pushText(text.slice(last, m.index)); out.push({ kind: 'item', defId: m[1], rarity: m[2], upgrade: Number(m[3]) }); last = m.index + m[0].length;
  }
  pushText(text.slice(last)); return out;
}
export const isMention = (text: string, myName: string): boolean => !!myName && new RegExp(`@${myName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
/** Plain readable text of a message (links shortened) for tickers and notifications. */
export function plainText(text: string): string { return text.replace(LINK, (_m, id: string, r: string) => `[${ITEM_BY_ID.has(id) ? id.replace(/_t\d+$/, '').replace(/^[a-z]+_/, '').replace(/_/g, ' ') : 'item'} · ${r}]`); }
export const rarityRank = (r: string): number => RARITIES.indexOf(r as never);

// ---------------------------------------------------------------- history store
export const HISTORY_PER_CHANNEL = 200;
export interface ChatSnapshot { channels: Record<string, ChatMessage[]>; unread: Record<string, number>; mentions: number; total: number }
export class ChatStore {
  private by: Record<string, ChatMessage[]> = {}; private unread: Record<string, number> = {}; private mentions = 0; private seen = new Set<string>();
  private visible: string | null = null;
  private subs = new Set<() => void>(); private snap: ChatSnapshot = { channels: {}, unread: {}, mentions: 0, total: 0 };
  constructor(private myName: () => string = () => '') {}
  subscribe = (f: () => void): (() => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  getSnapshot = (): ChatSnapshot => this.snap;
  private emit(): void { this.snap = { channels: { ...this.by }, unread: { ...this.unread }, mentions: this.mentions, total: Object.values(this.unread).reduce((a, b) => a + b, 0) }; this.subs.forEach((f) => f()); }
  /** Adds one message (duplicates by id are ignored). `visibleChannel` = the channel tab currently shown, its messages count as read. */
  /** The channel tab that is on screen right now (null when the chat window is closed): its new messages count as read. */
  setVisible(channel: string | null): void { this.visible = channel; if (channel) this.markRead(channel); }
  add(m: ChatMessage, visibleChannel: string | null | undefined = this.visible): void {
    if (this.seen.has(m.id)) return; this.seen.add(m.id); if (this.seen.size > 2000) this.seen = new Set([...this.seen].slice(-1000));
    const list = (this.by[m.channel] ??= []); list.push(m); if (list.length > HISTORY_PER_CHANNEL) list.shift();
    if (m.channel !== visibleChannel) { this.unread[m.channel] = (this.unread[m.channel] ?? 0) + 1; if (isMention(m.text, this.myName())) this.mentions++; }
    this.emit();
  }
  markRead(channel: string): void { if (this.unread[channel]) { this.unread[channel] = 0; this.emit(); } }
  clearMentions(): void { if (this.mentions) { this.mentions = 0; this.emit(); } }
}
/** Messages of one channel after the filters: system lines can be hidden, "mentions only" keeps messages that name me. */
export function filterMessages(list: ChatMessage[], opts: { hideSystem?: boolean; mentionsOnly?: boolean; myName?: string; blocked?: ReadonlySet<string> }): ChatMessage[] {
  return list.filter((m) => !(opts.hideSystem && m.channel === 'S') && !(opts.mentionsOnly && !isMention(m.text, opts.myName ?? '')) && !opts.blocked?.has(m.sender));
}
/** Error codes of the server that the chat bar explains. */
export const CHAT_ERROR_TEXT: Record<string, string> = { slow_mode: 'Slow mode: one message per second, five per ten seconds.', muted: 'You are muted by a moderator.', no_clan: 'You are not in a clan.', no_party: 'You are not in a party.', player_offline: 'That player is not online.' };
