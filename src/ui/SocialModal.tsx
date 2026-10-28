import React, { useState } from 'react';
import { tr } from '../i18n.ts';
import type { OnlineGameClient } from '../net/onlineClient.ts';
import type { CharacterState } from '../../shared/rules/character.ts';
import { WarPanel } from './WarPanel.tsx';
import { Tabs } from './kit/Tabs.tsx';
import { WindowFrame } from './wm/WindowFrame.tsx';
import { ClanTab } from './social/ClanTab.tsx';
import { FriendsTab } from './social/FriendsTab.tsx';
import { ArenaTab, GatesTab, MeTab } from './social/MoreTabs.tsx';
import { PartyTab } from './social/PartyTab.tsx';
import { RankingsTab } from './social/RankingsTab.tsx';

type Tab = 'friends' | 'party' | 'clan' | 'ranking' | 'arena' | 'gates' | 'war' | 'me';

/** Social window: friends, party (with finder), clan hub, leaderboards, arena, gates, faction war and my profile. Chat and the player profile are their own windows. */
export const SocialModal: React.FC<{ client: OnlineGameClient; isOpen: boolean; onClose: () => void; notices: string[]; character: CharacterState }> = ({ client, isOpen, onClose, notices, character }) => {
  const [tab, setTab] = useState<Tab>('friends'); const [msg, setMsg] = useState('');
  if (!isOpen) return null;
  const myName = character.name;
  return (
    <WindowFrame id="social" width="min(940px, 98vw)" height="min(660px, 95vh)">
      <div className="flex flex-col h-full min-h-0 gap-2">
        <Tabs label={tr('Social')} value={tab} onChange={(v) => { setTab(v as Tab); setMsg(''); }} tabs={[{ id: 'friends', label: tr('Friends') }, { id: 'party', label: tr('Party') }, { id: 'clan', label: tr('Clan') }, { id: 'ranking', label: tr('Rankings') }, { id: 'arena', label: tr('Arena') }, { id: 'gates', label: tr('Gates') }, { id: 'war', label: tr('War') }, { id: 'me', label: tr('Me') }]} />
        {msg && <div className="text-xs" style={{ color: 'var(--c-warn)' }} role="alert">{msg}</div>}
        {notices.length > 0 && <div className="text-[11px]" style={{ color: 'var(--c-good)' }}>{notices.slice(-2).join(' · ')}</div>}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {tab === 'friends' && <FriendsTab client={client} say={setMsg} />}
          {tab === 'party' && <PartyTab client={client} say={setMsg} myName={myName} />}
          {tab === 'clan' && <ClanTab client={client} ch={character} say={setMsg} />}
          {tab === 'ranking' && <RankingsTab client={client} myName={myName} />}
          {tab === 'arena' && <ArenaTab client={client} say={setMsg} onWatch={onClose} />}
          {tab === 'gates' && <GatesTab client={client} say={setMsg} />}
          {tab === 'war' && <WarPanel client={client} />}
          {tab === 'me' && <MeTab ch={character} myName={myName} />}
        </div>
      </div>
    </WindowFrame>
  );
};
