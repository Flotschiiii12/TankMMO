import { useSyncExternalStore } from 'react';
import { ChatStore } from './chatLogic.ts';

let myName = '';
export const setChatName = (n: string): void => { myName = n; };
/** The one chat history of the session: fed by the online client, read by the chat window and the dock's unread pip. */
export const chatStore = new ChatStore(() => myName);
export const useChat = () => useSyncExternalStore(chatStore.subscribe, chatStore.getSnapshot, chatStore.getSnapshot);

/** One-shot hand-over: open the chat window on a channel with a whisper recipient (friends list, profile card, sender menu). */
let wish: { channel: string; to?: string } | null = null; const subs = new Set<() => void>();
export const chatIntent = { set(channel: string, to?: string) { wish = { channel, to }; subs.forEach((f) => f()); }, take() { const w = wish; wish = null; return w; }, subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; } };
export const profileIntent = (() => { let name: string | null = null; const s = new Set<() => void>(); return { set(n: string) { name = n; s.forEach((f) => f()); }, peek: () => name, subscribe(f: () => void) { s.add(f); return () => { s.delete(f); }; } }; })();
