import React, { useEffect, useRef, useState } from 'react';
import { tr, T } from '../i18n.ts';
import { controlStrip } from './layoutStrip.ts';
import type { OnlineGameClient } from '../net/onlineClient.ts';

export const EMOTES = ['👍', '😂', '😡', '🆘', '👋'] as const;
const CHANNELS = [['G', T('Global')], ['M', T('Map')], ['F', T('Faction')], ['C', T('Clan')], ['A', T('Allies')], ['P', T('Party')], ['T', T('Trade')]] as const;

/** Chat line for the online game. Enter opens it; "/w Name text" whispers. */
export const ChatInput: React.FC<{ client: OnlineGameClient; leftHanded?: boolean }> = ({ client, leftHanded }) => {
  const [open, setOpen] = useState(false);
  const [emotes, setEmotes] = useState(false);
  const [text, setText] = useState('');
  const [channel, setChannel] = useState<'G' | 'M' | 'F' | 'C' | 'A' | 'P' | 'T'>('G');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' && !open && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); setOpen(true); setTimeout(() => ref.current?.focus(), 0); }
    };
    const onEmote = (e: KeyboardEvent) => {
      if (!e.altKey || e.target instanceof HTMLInputElement) return;
      const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code);
      if (i >= 0) { e.preventDefault(); client.sendChat(EMOTES[i], 'M'); }
    };
    window.addEventListener('keydown', onEmote);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keydown', onEmote); };
  }, [open, client]);

  const submit = () => {
    const t = text.trim();
    if (t) {
      const w = /^\/w\s+(\S+)\s+(.+)$/i.exec(t);
      if (w) client.sendChat(w[2], 'W', w[1]);
      else client.sendChat(t, channel);
    }
    setText('');
    setOpen(false);
  };

  // The strip sits between the joystick (9 rem) and the fire cluster (13 rem), whichever side each is on.
  const strip = controlStrip(leftHanded, 'max(0.75rem, var(--safe-bottom))');
  if (!open) return (
    <div data-hud="chat" style={strip} className="absolute z-30 flex pointer-events-none">
      <div className="relative flex gap-1 items-center pointer-events-auto">
        <button onClick={() => { setOpen(true); setTimeout(() => ref.current?.focus(), 0); }} className="px-3 rounded-full bg-slate-900/80 border border-slate-700 text-[11px] text-slate-300 whitespace-nowrap">{tr('Chat (Enter)')}</button>
        <button onClick={() => setEmotes((v) => !v)} aria-label={tr('Emotes')} title={tr('Emotes')} className="w-11 h-11 rounded-full bg-slate-900/70 border border-slate-700 text-base">😀</button>
        {emotes && (
          <div className="absolute bottom-full mb-1 left-0 flex gap-1 p-1 rounded-full bg-slate-950/80">
            {EMOTES.map((em, i) => <button key={em} title={`Alt+${i + 1}`} aria-label={em} onClick={() => { client.sendChat(em, 'M'); setEmotes(false); }} className="w-11 h-11 rounded-full bg-slate-900/70 border border-slate-700 text-base">{em}</button>)}
          </div>
        )}
      </div>
    </div>
  );
  return (
    <div data-hud="chat" style={strip} className="absolute z-30 flex pointer-events-none">
      <div className="flex gap-1 items-center pointer-events-auto bg-slate-950/90 border border-slate-700 rounded-lg p-1 w-full max-w-md">
        <select value={channel} onChange={(e) => setChannel(e.target.value as any)} className="bg-slate-900 text-xs text-slate-200 rounded px-1 shrink-0 max-w-[5.5rem]">
          {CHANNELS.map(([k, n]) => <option key={k} value={k}>{tr(n)}</option>)}
        </select>
        <input ref={ref} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setText(''); setOpen(false); } }} placeholder={tr('Message… (/w Name text)')} className="min-w-0 flex-1 bg-slate-900 rounded px-2 text-base text-white outline-none" />
        <button onClick={submit} className="px-2 rounded bg-orange-600/80 text-white text-xs">{tr('Send')}</button>
      </div>
    </div>
  );
};
