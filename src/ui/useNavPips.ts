import { useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterState } from '../../shared/rules/character.ts';
import type { OnlineGameClient } from '../net/onlineClient.ts';
import type { NavPips } from './MainMenu.tsx';

const SEEN_KEY = 'treadfront_seen_items';

/** Items the player has not looked at yet. The first run marks everything as seen so existing players get no flood of pips. */
export function unseenCount(inventoryUids: string[], seen: Set<string> | null): number {
  if (!seen) return 0;
  let n = 0; for (const u of inventoryUids) if (!seen.has(u)) n++;
  return n;
}
function loadSeen(): Set<string> | null {
  try { const raw = localStorage.getItem(SEEN_KEY); return raw ? new Set(JSON.parse(raw) as string[]) : null; } catch { return null; }
}
function saveSeen(uids: string[]): void { try { localStorage.setItem(SEEN_KEY, JSON.stringify(uids.slice(-400))); } catch { /* ignore */ } }

/** Notification pips of the main menu. Polls the server for clan invites and friend requests every 30 s (cheap read-only ops). */
export function useNavPips(character: CharacterState, online: OnlineGameClient | null | undefined, inventoryOpen: boolean, eventRunning: boolean): NavPips {
  const uids = useMemo(() => character.inventory.map((i) => i.uid), [character.inventory]);
  const seen = useRef<Set<string> | null>(loadSeen());
  const [, bump] = useState(0);
  if (seen.current === null && uids.length >= 0) { seen.current = new Set(uids); saveSeen(uids); } // first run: everything counts as seen
  useEffect(() => { if (inventoryOpen && seen.current) { seen.current = new Set(uids); saveSeen(uids); bump((n) => n + 1); } }, [inventoryOpen, uids]);
  const [social, setSocial] = useState(0); const [mail, setMail] = useState(0);
  useEffect(() => {
    if (!online) return;
    let dead = false;
    const poll = async () => {
      const [invites, friends, mailbox] = await Promise.all([online.social({ op: 'clan_invites' }), online.social({ op: 'friend_list' }), online.social({ op: 'mail_list' })]);
      if (dead) return;
      const inv = invites.ok && Array.isArray(invites.data) ? invites.data.length : 0;
      const req = friends.ok && Array.isArray(friends.data) ? friends.data.filter((f: { status?: string }) => f.status === 'incoming').length : 0;
      setSocial(inv + req); setMail(mailbox.ok && Array.isArray(mailbox.data) ? mailbox.data.length : 0);
    };
    void poll(); const id = setInterval(poll, 30_000);
    return () => { dead = true; clearInterval(id); };
  }, [online]);
  const ready = Object.values(character.quests.active).filter((q) => q.ready).length;
  return { inventory: unseenCount(uids, seen.current), quests: ready, social, map: eventRunning, market: mail };
}
