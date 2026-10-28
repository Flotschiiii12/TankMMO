import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '../sim/types.ts';
import { ClanEmblemBadge } from './GameIcon.tsx';
import { tr, nm } from '../i18n.ts';
import { KEY_BY_ENGLISH } from '../../shared/data/names/index.ts';

interface ChatLogProps {
  messages: ChatMessage[];
}

/** Server system messages that are built from English templates. */
function localizeSystemText(text: string): string {
  const m = text.match(/^CRITICAL ALERT: (.+) detected on the battlefield!$/);
  return m ? tr('CRITICAL ALERT: {name} detected on the battlefield!', { name: nm(KEY_BY_ENGLISH.get(m[1]), m[1]) }) : text;
}

export const ChatLog: React.FC<ChatLogProps> = ({ messages }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  // Keep last 5 lines for clean unobtrusive HUD
  const visibleMessages = messages.slice(-5);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none select-none max-w-md w-full max-h-24 overflow-y-auto flex flex-col gap-1 px-3 py-1.5 rounded-lg bg-slate-950/45 backdrop-blur-none"
    >
      {visibleMessages.map((msg) => (
        <div key={msg.id} className="text-[11px] leading-tight flex items-baseline gap-1.5">
          <span
            className={`font-semibold shrink-0 text-[10px] ${
              msg.channel === 'G' ? 'text-emerald-400' : 'text-orange-400'
            }`}
          >
            [{msg.channel}]
          </span>
          {msg.clanTag && <span className="text-slate-400 shrink-0 inline-flex items-center gap-0.5"><ClanEmblemBadge emblem={msg.clanEmblem} size={12} />[{msg.clanTag}]</span>}
          <span
            className={`font-medium shrink-0 ${
              msg.channel === 'S' ? 'text-red-400' : 'text-blue-300'
            }`}
          >
            {msg.sender}:
          </span>
          <span className="text-slate-200 truncate">{localizeSystemText(msg.text)}</span>
        </div>
      ))}
    </div>
  );
};
