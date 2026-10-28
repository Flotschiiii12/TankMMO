import React, { useEffect, useRef, useState } from 'react';
import { tr } from '../i18n.ts';
import type { OnlineGameClient } from '../net/onlineClient.ts';

const CHANNELS = [['G', 'Global'], ['M', 'Map'], ['C', 'Clan'], ['P', 'Party'], ['T', 'Trade']] as const;

/** Chat line for the online game. Enter opens it; "/w Name text" whispers. */
export const ChatInput: React.FC<{ client: OnlineGameClient }> = ({ client }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [channel, setChannel] = useState<'G' | 'M' | 'C' | 'P' | 'T'>('G');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' && !open && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); setOpen(true); setTimeout(() => ref.current?.focus(), 0); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

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

  if (!open) return (
    <button onClick={() => { setOpen(true); setTimeout(() => ref.current?.focus(), 0); }} className="absolute left-3 bottom-3 z-30 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-700 text-[11px] text-slate-300 pointer-events-auto">{tr('Chat (Enter)')}</button>
  );
  return (
    <div className="absolute left-3 bottom-3 z-30 flex gap-1 items-center pointer-events-auto bg-slate-950/90 border border-slate-700 rounded-lg p-1.5 max-w-[60vw]">
      <select value={channel} onChange={(e) => setChannel(e.target.value as any)} className="bg-slate-900 text-xs text-slate-200 rounded px-1 py-1">
        {CHANNELS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
      </select>
      <input ref={ref} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setText(''); setOpen(false); } }} placeholder={tr('Message… (/w Name text)')} className="flex-1 min-w-[200px] bg-slate-900 text-xs text-white rounded px-2 py-1 outline-none" />
      <button onClick={submit} className="px-2 py-1 rounded bg-orange-600/80 text-white text-xs">{tr('Send')}</button>
    </div>
  );
};
