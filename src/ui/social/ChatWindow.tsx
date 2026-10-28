import React, { useEffect, useMemo, useRef, useState } from 'react';
import { tr } from '../../i18n.ts';
import type { OnlineGameClient } from '../../net/onlineClient.ts';
import type { CharacterState } from '../../../shared/rules/character.ts';
import { ITEM_BY_ID } from '../../../shared/data/items.ts';
import { describeItem } from '../../game/actions.ts';
import { ClanEmblemBadge } from '../GameIcon.tsx';
import { Button } from '../kit/Button.tsx';
import { EmptyState } from '../kit/States.tsx';
import { PipHost } from '../kit/Indicators.tsx';
import { Tooltip } from '../kit/Tooltip.tsx';
import { itemScore } from '../hangar/hangarLogic.ts';
import { rarityStyle } from '../kit/logic.ts';
import { windows } from '../wm/windowStore.ts';
import { WindowFrame } from '../wm/WindowFrame.tsx';
import { useWindowStack } from '../wm/useWindows.ts';
import { CHANNELS, CHAT_ERROR_TEXT, Channel, filterMessages, itemLinkToken, parseChatText } from './chatLogic.ts';
import { chatIntent, chatStore, profileIntent, useChat } from './chat.ts';
import { EMOTES } from '../hud/ChatDock.tsx';

const REPORT_REASONS = ['Spam', 'Abuse', 'Cheating', 'Other'];
const CHANNEL_COLOR: Record<string, string> = { G: 'var(--c-good)', M: 'var(--c-text)', F: 'var(--c-info)', C: 'var(--accent-2)', A: 'var(--accent)', P: 'var(--c-xp)', W: '#f472b6', S: 'var(--c-bad)' };

const ItemChip: React.FC<{ defId: string; rarity: string; upgrade: number }> = ({ defId, rarity, upgrade }) => {
  const def = ITEM_BY_ID.get(defId)!; const info = describeItem({ uid: 'link', defId, rarity: rarity as never, upgrade, affixes: [], rerolls: 0, bound: false });
  return <Tooltip content={<div className="grid"><b style={{ color: info.color }}>{info.name}</b><span style={{ color: 'var(--c-text-3)' }}>{tr(rarity)} · {tr(def.slotType)} · {tr('needs level')} {def.minLevel}</span>{def.baseDPS ? <span>{tr('Damage')} {def.baseDPS}</span> : null}</div>}><span className="px-1.5 rounded-md font-semibold" style={{ border: `1px solid var(${rarityStyle(rarity).cssVar})`, color: `var(${rarityStyle(rarity).cssVar})`, background: 'var(--c-bg-0)' }} data-testid="item-link">[{info.name}]</span></Tooltip>;
};

/** Full chat window: channel tabs with unread pips, filters, mentions, emotes, item links, slow-mode/mute explanations and a sender menu (whisper, profile, friend, block, report). */
export const ChatWindow: React.FC<{ client: OnlineGameClient | null; character: CharacterState; myName: string }> = ({ client, character, myName }) => {
  const stack = useWindowStack(); const open = stack.includes('chat'); const chat = useChat();
  const [channel, setChannel] = useState<Channel>('G'); const [text, setText] = useState(''); const [to, setTo] = useState('');
  const [hideSystem, setHideSystem] = useState(false); const [mentionsOnly, setMentionsOnly] = useState(false);
  const [menu, setMenu] = useState<string | null>(null); const [pop, setPop] = useState<'emotes' | 'items' | 'report' | null>(null); const [info, setInfo] = useState('');
  const list = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null);

  useEffect(() => { chatStore.setVisible(open ? channel : null); if (open) chatStore.clearMentions(); return () => chatStore.setVisible(null); }, [open, channel]);
  useEffect(() => chatIntent.subscribe(() => { const w = chatIntent.take(); if (w) { setChannel(w.channel as Channel); if (w.to) setTo(w.to); windows.open('chat'); setTimeout(() => input.current?.focus(), 50); } }), []);
  useEffect(() => { if (!client) return; let t: number | undefined; return client.onServerError((code) => { const m = CHAT_ERROR_TEXT[code]; if (m) { setInfo(tr(m)); window.clearTimeout(t); t = window.setTimeout(() => setInfo(''), 6000); } }); }, [client]);
  const msgs = useMemo(() => filterMessages(chat.channels[channel] ?? [], { hideSystem, mentionsOnly, myName }), [chat, channel, hideSystem, mentionsOnly, myName]);
  useEffect(() => { const el = list.current; if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight; }, [msgs.length, open]);
  useEffect(() => { if (open && list.current) list.current.scrollTop = list.current.scrollHeight; }, [open, channel]);

  const send = () => {
    const t = text.trim(); if (!t || !client) return;
    if (channel === 'W') { if (!to.trim()) { setInfo(tr('Enter the name of the player you want to whisper to.')); return; } client.sendChat(t, 'W', to.trim()); }
    else if (channel !== 'S') client.sendChat(t, channel);
    setText('');
  };
  const call = async (req: Parameters<OnlineGameClient['social']>[0]) => { const r = await client?.social(req); setInfo(r?.ok ? tr('Done') : tr('That did not work')); setMenu(null); setPop(null); };
  const myItems = useMemo(() => [...character.inventory].sort((a, b) => itemScore(b) - itemScore(a)).slice(0, 36), [character.inventory]);

  return (
    <WindowFrame id="chat" title="Chat" width="min(900px, 98vw)" height="min(620px, 94vh)">
      <div className="flex h-full min-h-0 gap-2">
        <nav className="flex flex-col gap-1 shrink-0 overflow-y-auto" aria-label={tr('Channels')} style={{ width: 118 }}>
          {CHANNELS.map((c) => (
            <PipHost key={c.id} count={c.id === channel ? 0 : chat.unread[c.id] ?? 0} label={tr(c.label)}>
              <button type="button" aria-pressed={channel === c.id} onClick={() => setChannel(c.id)} className="k-btn w-full justify-start shrink-0"  style={{ ['--b-line' as string]: channel === c.id ? CHANNEL_COLOR[c.id] : undefined, color: CHANNEL_COLOR[c.id], minHeight: 44 }}>{c.id} · {tr(c.label)}</button>
            </PipHost>
          ))}
          <div className="grid gap-1 mt-2 text-[12px]">
            <Button pressed={hideSystem} onClick={() => setHideSystem((v) => !v)}>{tr('Hide system')}</Button>
            <Button pressed={mentionsOnly} onClick={() => setMentionsOnly((v) => !v)}>{tr('Mentions only')}</Button>
          </div>
        </nav>
        <div className="flex flex-col flex-1 min-w-0 min-h-0 gap-2">
          <div ref={list} className="flex-1 min-h-0 overflow-y-auto rounded-lg p-2 grid content-start gap-0.5" style={{ background: 'var(--c-bg-0)', border: '1px solid var(--c-line)' }} role="log" aria-live="polite" aria-label={tr('Messages')} data-testid="chat-log">
            {msgs.length === 0 ? <EmptyState icon="💬" title={tr('No messages here yet')} text={mentionsOnly ? tr('No message names you.') : channel === 'S' ? tr('Server notices appear here.') : tr('Say hello!')} /> : msgs.map((m) => (
              <div key={m.id} className="text-[13px] leading-snug flex flex-wrap items-baseline gap-x-1.5 relative" style={{ color: m.channel === 'S' ? 'var(--c-bad)' : 'var(--c-text)' }}>
                <span className="text-[11px] tabular-nums" style={{ color: 'var(--c-text-3)' }}>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {m.clanTag && <span className="inline-flex items-center gap-0.5" style={{ color: 'var(--c-text-3)' }}><ClanEmblemBadge emblem={m.clanEmblem} size={12} />[{m.clanTag}]</span>}
                {m.channel === 'S' ? <b>{m.sender}:</b> : <button type="button" className="font-semibold underline decoration-dotted min-h-[28px]" data-compact style={{ color: 'var(--c-info)' }} onClick={() => setMenu(menu === m.id ? null : m.id)} aria-haspopup="menu" aria-expanded={menu === m.id}>{m.sender}:</button>}
                <span>{parseChatText(m.text, myName).map((s, i) => s.kind === 'item' ? <ItemChip key={i} {...s} /> : s.kind === 'mention' ? <mark key={i} className="px-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent-2)' }}>{s.text}</mark> : <span key={i}>{s.text}</span>)}</span>
                {menu === m.id && (
                  <div role="menu" className="absolute left-8 top-full z-10 grid p-1 rounded-lg" style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-line-strong)', boxShadow: 'var(--e-3)', minWidth: 170 }}>
                    <Button variant="ghost" onClick={() => { setChannel('W'); setTo(m.sender); setMenu(null); input.current?.focus(); }}>{tr('Whisper')}</Button>
                    <Button variant="ghost" onClick={() => { profileIntent.set(m.sender); windows.open('profile'); setMenu(null); }}>{tr('Profile')}</Button>
                    <Button variant="ghost" onClick={() => void call({ op: 'friend_request', name: m.sender })}>{tr('Add friend')}</Button>
                    <Button variant="ghost" onClick={() => void call({ op: 'block', name: m.sender })}>{tr('Block')}</Button>
                    <Button variant="ghost" onClick={() => { setPop('report'); }}>{tr('Report')}…</Button>
                    {pop === 'report' && <div className="grid">{REPORT_REASONS.map((r) => <Button key={r} variant="danger" onClick={() => void call({ op: 'report', name: m.sender, reason: r.toLowerCase() })}>{tr(r)}</Button>)}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
          {info && <div className="text-[12px]" style={{ color: 'var(--c-warn)' }} role="status" data-testid="chat-info">{info}</div>}
          <div className="relative flex gap-1.5 items-center flex-wrap">
            {channel === 'W' && <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={tr('To')} aria-label={tr('Whisper to')} className="k-field w-28" />}
            <input ref={input} value={text} maxLength={200} disabled={channel === 'S'} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} placeholder={channel === 'S' ? tr('System messages are read only') : tr('Message… (/w Name text)')} aria-label={tr('Message')} className="k-field flex-1 min-w-[8rem]" />
            <Button onClick={() => setPop(pop === 'emotes' ? null : 'emotes')} label={tr('Emotes')}>😀</Button>
            <Button onClick={() => setPop(pop === 'items' ? null : 'items')} label={tr('Link an item')}>🎒</Button>
            <Button variant="primary" disabled={channel === 'S' || !text.trim()} onClick={send}>{tr('Send')}</Button>
            <span className="text-[11px] tabular-nums" style={{ color: 'var(--c-text-3)' }}>{text.length}/200</span>
            {pop === 'emotes' && <div className="absolute bottom-full mb-1 right-0 flex gap-1 p-1 rounded-xl" style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-line-strong)' }}>{EMOTES.map((e) => <Button key={e} variant="ghost" onClick={() => { setText((t) => (t + e).slice(0, 200)); setPop(null); input.current?.focus(); }}>{e}</Button>)}</div>}
            {pop === 'items' && <div className="absolute bottom-full mb-1 right-0 grid gap-0.5 p-1 rounded-xl max-h-56 overflow-y-auto" style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-line-strong)', minWidth: 220 }}>{myItems.length === 0 ? <span className="p-2 text-[12px]">{tr('No items')}</span> : myItems.map((i) => <Button key={i.uid} variant="ghost" onClick={() => { setText((t) => `${t} ${itemLinkToken(i)}`.trim().slice(0, 200)); setPop(null); input.current?.focus(); }}><span style={{ color: describeItem(i).color }}>{describeItem(i).name}</span></Button>)}</div>}
          </div>
        </div>
      </div>
    </WindowFrame>
  );
};
