import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { tr, titleText } from '../../i18n.ts';
import type { OnlineGameClient } from '../../net/onlineClient.ts';
import { getRankForHonor } from '../../../shared/data/ranks.ts';
import { VEHICLE_TIERS } from '../../data/vehicles.ts';
import { FactionCrest, RankBadge, ClanEmblemBadge } from '../GameIcon.tsx';
import { Badge } from '../kit/Indicators.tsx';
import { Button } from '../kit/Button.tsx';
import { EmptyState, SkeletonRows } from '../kit/States.tsx';
import { StatRow } from '../kit/Currency.tsx';
import { HangarPreview } from '../hangar/HangarPreview.tsx';
import { windows } from '../wm/windowStore.ts';
import { WindowFrame } from '../wm/WindowFrame.tsx';
import { chatIntent, profileIntent } from './chat.ts';

interface Profile { name: string; level: number; clan: { name: string; tag: string; emblem: string | null } | null; online: boolean; vehicle?: string; power: number; honor: number; faction?: string; achievements: number; activeSkin: string | null; titles: string[]; isFriend: boolean; blocked: boolean }

/** Public profile ("inspect") card: rank, honor, clan, vehicle preview, titles and social actions. Only public data, nothing private. */
export const ProfileWindow: React.FC<{ client: OnlineGameClient | null; myName: string }> = ({ client, myName }) => {
  const name = useSyncExternalStore(profileIntent.subscribe, profileIntent.peek, profileIntent.peek);
  const [p, setP] = useState<Profile | null>(null); const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle'); const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!client || !name) return; let dead = false; setState('loading'); setP(null);
    void client.social({ op: 'profile', name }).then((r) => { if (dead) return; if (r.ok) { setP(r.data as Profile); setState('idle'); } else setState('error'); });
    return () => { dead = true; };
  }, [client, name]);
  const act = async (req: Parameters<OnlineGameClient['social']>[0], ok: string) => { const r = await client?.social(req); setMsg(r?.ok ? tr(ok) : tr('That did not work')); };
  const rank = p ? getRankForHonor(p.honor) : undefined; const veh = p?.vehicle ? VEHICLE_TIERS.find((v) => v.id === p.vehicle) : undefined; const self = p?.name === myName;
  return (
    <WindowFrame id="profile" width="min(560px, 96vw)" height="min(560px, 94vh)">
      {state === 'loading' ? <SkeletonRows rows={4} h={48} /> : state === 'error' || !p ? <EmptyState icon="❓" title={tr('Player not found')} /> : (
        <div className="grid gap-3" data-testid="profile-card">
          <div className="flex items-center gap-3">
            {rank && <RankBadge level={rank.level} size={64} />}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap"><b className="text-lg truncate">{p.name}</b>{p.faction && <FactionCrest faction={p.faction} size={20} />}<Badge tone={p.online ? 'good' : 'neutral'}>{p.online ? tr('online') : tr('offline')}</Badge></div>
              <div className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{tr('Level')} {p.level}{p.clan ? <> · <ClanEmblemBadge emblem={p.clan.emblem} size={14} /> [{p.clan.tag}] {p.clan.name}</> : ''}</div>
              {p.titles.length > 0 && <div className="text-[11px]" style={{ color: 'var(--accent-2)' }}>{p.titles.slice(-3).map(titleText).join(' · ')}</div>}
            </div>
          </div>
          {veh && <div className="rounded-xl h-40 overflow-hidden" style={{ background: 'radial-gradient(circle at 50% 45%, var(--c-bg-3), var(--c-bg-0))', border: '1px solid var(--c-line)' }}><HangarPreview vehicle={veh} level={p.level} skin={p.activeSkin ?? undefined} /></div>}
          <div><StatRow label={tr('Vehicle')} value={veh?.tier ?? 0} unit={veh ? ` · ${veh.name}` : ''} /><StatRow label={tr('Power rating')} value={p.power} /><StatRow label={tr('Honor')} value={p.honor} /><StatRow label={tr('Achievements')} value={p.achievements} /></div>
          {msg && <div className="text-[12px]" style={{ color: 'var(--c-warn)' }} role="status">{msg}</div>}
          {!self && (
            <div className="flex flex-wrap gap-2">
              {!p.isFriend && <Button variant="primary" onClick={() => void act({ op: 'friend_request', name: p.name }, 'Friend request sent')}>{tr('Add friend')}</Button>}
              <Button onClick={() => { chatIntent.set('W', p.name); windows.close('profile'); }}>{tr('Whisper')}</Button>
              <Button onClick={() => void act({ op: 'party_invite', name: p.name }, 'Party invite sent')}>{tr('Invite to party')}</Button>
              <Button onClick={() => windows.open('market')}>{tr('Trade')}</Button>
              <Button variant="danger" onClick={() => void act({ op: p.blocked ? 'unblock' : 'block', name: p.name }, p.blocked ? 'Unblocked' : 'Blocked')}>{p.blocked ? tr('Unblock') : tr('Block')}</Button>
            </div>
          )}
        </div>
      )}
    </WindowFrame>
  );
};
