import React, { useEffect, useRef, useState } from 'react';
import { tr, T } from '../../i18n.ts';
import type { ChatMessage } from '../../sim/types.ts';
import type { OnlineGameClient } from '../../net/onlineClient.ts';
import { ChatLog } from '../ChatLog.tsx';
import { plainText } from '../social/chatLogic.ts';
import { useChat } from '../social/chat.ts';
import { windows } from '../wm/windowStore.ts';
import { controlStrip } from '../layoutStrip.ts';
import { KEY_BY_ENGLISH } from '../../../shared/data/names/index.ts';
import { nm } from '../../i18n.ts';

export const EMOTES = ['👍', '😂', '😡', '🆘', '👋'] as const;
const CHANNELS = [['G', T('Global')], ['M', T('Map')], ['F', T('Faction')], ['C', T('Clan')], ['A', T('Allies')], ['P', T('Party')], ['T', T('Trade')]] as const;
type Channel = (typeof CHANNELS)[number][0];

function tickerText(m: ChatMessage): string {
  const crit = m.text.match(/^CRITICAL ALERT: (.+) detected on the battlefield!$/);
  const text = crit ? tr('CRITICAL ALERT: {name} detected on the battlefield!', { name: nm(KEY_BY_ENGLISH.get(crit[1]), crit[1]) }) : m.text;
  return `[${m.channel}] ${m.sender}: ${plainText(text)}`;
}

/**
 * Chat dock. Collapsed it is a one-line ticker with the latest message (plus emote button); a tap or Enter expands it to the
 * last lines and the input. Phones place it in the free band between joystick and fire cluster, desktop bottom-left.
 */
export const ChatDock: React.FC<{ client: OnlineGameClient | null; messages: ChatMessage[]; leftHanded?: boolean; touchLayout: boolean }> = ({ client, messages, leftHanded, touchLayout }) => {
  const [open, setOpen] = useState(false); const [emotes, setEmotes] = useState(false);
  const [text, setText] = useState(''); const [channel, setChannel] = useState<Channel>('G');
  const ref = useRef<HTMLInputElement>(null);
  const last = messages[messages.length - 1]; const unread = useChat();

  useEffect(() => {
    if (!client) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' && !open && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); setOpen(true); setTimeout(() => ref.current?.focus(), 0); }
      if (e.altKey && !(e.target instanceof HTMLInputElement)) { const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code); if (i >= 0) { e.preventDefault(); client.sendChat(EMOTES[i], 'M'); } }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, client]);

  const submit = () => {
    const t = text.trim();
    if (t && client) { const w = /^\/w\s+(\S+)\s+(.+)$/i.exec(t); if (w) client.sendChat(w[2], 'W', w[1]); else client.sendChat(t, channel); }
    setText(''); setOpen(false);
  };
  const place: React.CSSProperties = touchLayout ? controlStrip(leftHanded, 'max(0.75rem, var(--safe-bottom))') : { left: 'max(0.75rem, var(--safe-left))', bottom: 'max(0.75rem, var(--safe-bottom))', width: 'min(20rem, calc(50vw - 18rem))' };

  if (!open) return (
    <div data-hud="chat" style={place} className="absolute z-30 flex pointer-events-none">
      <div className="relative flex gap-1 items-center pointer-events-auto min-w-0 w-full">
        <button type="button" onClick={() => { setOpen(true); setTimeout(() => ref.current?.focus(), 0); }} aria-label={tr('Chat (Enter)')} className="hud-surface min-h-[44px] px-3 text-left min-w-0 flex-1 text-[11px] truncate" style={{ color: 'var(--c-text-2)' }}>
          {last ? tickerText(last) : tr('Chat (Enter)')}
        </button>
        <button type="button" onClick={() => windows.open('chat')} aria-label={tr('Open chat window')} title={tr('Open chat window')} className="hud-surface w-11 h-11 text-base shrink-0 relative">💬{unread.total > 0 && <span className="k-counter" style={{ position: 'absolute', top: -4, right: -4 }}>{unread.total > 99 ? '99+' : unread.total}</span>}</button>
        {client && <button type="button" onClick={() => setEmotes((v) => !v)} aria-label={tr('Emotes')} title={tr('Emotes')} className="hud-surface w-11 h-11 text-base shrink-0">😀</button>}
        {emotes && client && (
          <div className="absolute bottom-full mb-1 right-0 flex gap-1 p-1 rounded-full" style={{ background: 'var(--c-scrim)' }}>
            {EMOTES.map((em, i) => <button key={em} type="button" title={`Alt+${i + 1}`} aria-label={em} onClick={() => { client.sendChat(em, 'M'); setEmotes(false); }} className="hud-surface w-11 h-11 rounded-full text-base">{em}</button>)}
          </div>
        )}
      </div>
    </div>
  );
  return (
    <div data-hud="chat" style={place} className="absolute z-30 flex flex-col gap-1 pointer-events-none" data-testid="chat-open">
      <div className="pointer-events-none"><ChatLog messages={messages} /></div>
      <div className="flex gap-1 items-center pointer-events-auto hud-surface p-1 w-full">
        <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className="bg-slate-900 text-xs text-slate-200 rounded px-1 shrink-0 max-w-[5.5rem]" aria-label={tr('Channel')}>
          {CHANNELS.map(([k, n]) => <option key={k} value={k}>{tr(n)}</option>)}
        </select>
        <input ref={ref} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setText(''); setOpen(false); } }} placeholder={tr('Message… (/w Name text)')} className="min-w-0 flex-1 bg-slate-900 rounded px-2 text-base text-white outline-none" />
        <button type="button" onClick={submit} className="px-2 rounded bg-orange-600/80 text-white text-xs">{tr('Send')}</button>
        <button type="button" onClick={() => { setText(''); setOpen(false); }} aria-label={tr('Close')} className="px-2 rounded text-slate-300 text-xs">✕</button>
      </div>
    </div>
  );
};
