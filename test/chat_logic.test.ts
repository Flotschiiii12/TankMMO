import { describe, expect, it } from 'vitest';
import { CHANNELS, ChatStore, HISTORY_PER_CHANNEL, filterMessages, isMention, itemLinkToken, parseChatText, plainText } from '../src/ui/social/chatLogic.ts';
import type { ChatMessage } from '../src/sim/types.ts';

const msg = (id: string, channel: ChatMessage['channel'], text: string, sender = 'Bob'): ChatMessage => ({ id, channel, text, sender, timestamp: 1 });

describe('item links and mentions', () => {
  it('round-trips a link and ignores unknown items and malformed tokens', () => {
    const tok = itemLinkToken({ defId: 'wpn_cannon_t3', rarity: 'Epic', upgrade: 4 });
    expect(parseChatText(`look ${tok} nice`)).toEqual([{ kind: 'text', text: 'look ' }, { kind: 'item', defId: 'wpn_cannon_t3', rarity: 'Epic', upgrade: 4 }, { kind: 'text', text: ' nice' }]);
    expect(parseChatText('{{i:not_an_item:Epic:1}} x')).toEqual([{ kind: 'text', text: '{{i:not_an_item:Epic:1}} x' }]);
    expect(parseChatText('{{i:wpn_cannon_t3:Mythic:1}}')).toEqual([{ kind: 'text', text: '{{i:wpn_cannon_t3:Mythic:1}}' }]);
    expect(plainText(`a ${tok}`)).toContain('Epic');
  });
  it('finds @mentions of my name case-insensitively, also around links, and does not match longer names', () => {
    expect(isMention('hey @florian!', 'Florian')).toBe(true); expect(isMention('hey @florianx', 'Florian')).toBe(false); expect(isMention('hello', 'Florian')).toBe(false); expect(isMention('@a', '')).toBe(false);
    const segs = parseChatText(`@Flo ${itemLinkToken({ defId: 'wpn_cannon_t1', rarity: 'Common', upgrade: 0 })} @flo`, 'Flo');
    expect(segs.map((s) => s.kind)).toEqual(['mention', 'text', 'item', 'text', 'mention']);
    expect(() => parseChatText('x', 'a.b*c(')).not.toThrow();
  });
});

describe('chat store', () => {
  it('keeps messages per channel, ignores duplicates, counts unread for hidden channels and mentions', () => {
    const s = new ChatStore(() => 'Me');
    s.add(msg('1', 'G', 'hi'), 'G'); s.add(msg('1', 'G', 'hi'), 'G'); s.add(msg('2', 'C', 'clan @me', 'Al'), 'G'); s.add(msg('3', 'C', 'again'), 'G'); s.add(msg('4', 'W', 'psst'), 'G');
    const snap = s.getSnapshot();
    expect(snap.channels.G).toHaveLength(1); expect(snap.unread).toMatchObject({ C: 2, W: 1 }); expect(snap.unread.G ?? 0).toBe(0); expect(snap.mentions).toBe(1); expect(snap.total).toBe(3);
    s.markRead('C'); expect(s.getSnapshot().unread.C).toBe(0); s.clearMentions(); expect(s.getSnapshot().mentions).toBe(0);
  });
  it('bounds the history and notifies subscribers per change', () => {
    const s = new ChatStore(); let n = 0; s.subscribe(() => n++);
    for (let i = 0; i < HISTORY_PER_CHANNEL + 30; i++) s.add(msg(`m${i}`, 'G', `t${i}`), 'G');
    expect(s.getSnapshot().channels.G).toHaveLength(HISTORY_PER_CHANNEL); expect(s.getSnapshot().channels.G[0].text).toBe('t30'); expect(n).toBe(HISTORY_PER_CHANNEL + 30);
  });
  it('filters: hide system lines, mentions only, blocked senders', () => {
    const l = [msg('1', 'S', 'server'), msg('2', 'G', 'hello @me'), msg('3', 'G', 'spam', 'Troll'), msg('4', 'G', 'plain')];
    expect(filterMessages(l, { hideSystem: true }).map((m) => m.id)).toEqual(['2', '3', '4']); expect(filterMessages(l, { mentionsOnly: true, myName: 'me' }).map((m) => m.id)).toEqual(['2']); expect(filterMessages(l, { blocked: new Set(['Troll']) }).map((m) => m.id)).toEqual(['1', '2', '4']);
    expect(CHANNELS.filter((c) => !c.sendable).map((c) => c.id)).toEqual(['S']);
  });
});
