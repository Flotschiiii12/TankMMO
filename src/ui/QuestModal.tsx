import React, { useState } from 'react';
import { X, ScrollText } from 'lucide-react';
import { UserProfile } from '../save/profile.ts';
import { soundEngine } from '../audio/soundEngine.ts';
import { errorText, mutateCharacter } from '../game/actions.ts';
import { nowSeconds } from '../game/questBridge.ts';
import { QUEST_BY_ID, QuestObjective } from '../../shared/data/quests.ts';
import { SEASON_POINTS_PER_TIER, SEASON_REWARDS } from '../../shared/data/season.ts';
import * as Q from '../../shared/rules/quests.ts';
import type { CharacterState } from '../../shared/rules/character.ts';

interface Props {
  profile: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onChange: (profile: UserProfile) => void;
}

const objectiveText = (o: QuestObjective, target: number): string => {
  const t = o.target !== undefined ? ` ${String(o.target).replace(/_/g, ' ')}` : '';
  const e = o.elite ? ' elite' : '';
  switch (o.type) {
    case 'kill': return `Defeat ${target}${e}${t} enemies`;
    case 'collect_ore': return `Collect ${target}${t} ore`;
    case 'deliver': return `Deliver ${target} scrap`;
    case 'reach_map': return `Reach map ${o.target}`;
    case 'defeat_boss': return `Defeat a boss${t}`;
    case 'clear_gate': return `Clear a gate${t}`;
    case 'win_arena': return `Win ${target} arena match(es)`;
    case 'craft': return `Craft ${target} item(s)`;
    case 'upgrade': return `Upgrade items ${target} times`;
    case 'explore': return `Discover ${target} secret(s)`;
    case 'escort': return `Complete ${target} convoy escort(s)`;
    case 'use_portal': return `Use portals ${target} times`;
    case 'tutorial': return `Tutorial: ${o.target}`;
  }
};

export const QuestModal: React.FC<Props> = ({ profile, isOpen, onClose, onChange }) => {
  const [tab, setTab] = useState<'active' | 'available' | 'season'>('active');
  const [msg, setMsg] = useState('');
  if (!isOpen) return null;
  const ch = profile.character;

  const run = (fn: (c: CharacterState, rng: any) => any) => {
    soundEngine.playUIClick();
    const { profile: next, result } = mutateCharacter(profile, fn);
    if (result.ok) { onChange(next); setMsg(''); } else setMsg(errorText(result.error));
  };

  const active = Object.values(ch.quests.active);
  const available = Q.availableQuests(ch).filter((q) => q.kind !== 'story' || q.chapter === 0 || true).slice(0, 40);
  const tier = Q.seasonTier(ch);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-3xl max-h-[94vh] flex flex-col p-4 text-slate-200 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2"><ScrollText className="text-orange-500" size={18} /><h3 className="font-semibold text-white text-sm">Quests</h3></div>
          <button onClick={() => { soundEngine.playUIClick(); onClose(); }} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="flex gap-2 mt-2 text-xs">
          {(['active', 'available', 'season'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 rounded capitalize ${tab === t ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>
              {t === 'active' ? `Active (${active.length})` : t === 'available' ? `Available (${available.length})` : `Season ${ch.season.seasonId || ''}`}
            </button>
          ))}
          {msg && <span className="ml-auto text-[11px] text-orange-300 self-center">{msg}</span>}
        </div>

        <div className="mt-2 overflow-y-auto space-y-1.5 pr-1">
          {tab === 'active' && active.length === 0 && <div className="text-xs text-slate-500 p-3">No active quests. Check the Available tab.</div>}
          {tab === 'active' && active.map((aq) => {
            const def = QUEST_BY_ID.get(aq.id)!;
            const rw = Q.scaledReward(def, aq.levelAtAccept);
            return (
              <div key={aq.id} className="p-2.5 rounded border border-slate-800 bg-slate-950/40 text-xs">
                <div className="flex items-center justify-between">
                  <div><span className="text-white font-medium">{def.name}</span> <span className="text-[10px] uppercase text-slate-500">{def.kind}</span></div>
                  <div className="flex gap-2">
                    {aq.ready && <button onClick={() => run((c, r) => Q.claimQuest(c, aq.id, r, nowSeconds()))} className="px-2 py-1 rounded bg-emerald-600/80 text-white">Claim</button>}
                    {def.kind !== 'daily' && def.kind !== 'weekly' && <button onClick={() => run((c) => Q.abandonQuest(c, aq.id))} className="text-[10px] text-slate-500 hover:text-slate-300">abandon</button>}
                  </div>
                </div>
                {def.objectives.map((o, i) => (
                  <div key={i} className="mt-1">
                    <div className="flex justify-between text-[11px] text-slate-300"><span>{objectiveText(o, aq.targets[i])}</span><span className="tabular-nums">{aq.progress[i]} / {aq.targets[i]}</span></div>
                    <div className="h-1 rounded bg-slate-800 mt-0.5"><div className="h-1 rounded bg-orange-500" style={{ width: `${Math.min(100, (aq.progress[i] / aq.targets[i]) * 100)}%` }} /></div>
                  </div>
                ))}
                <div className="mt-1 text-[10px] text-slate-500">Reward: {rw.xp} XP, {rw.scrap} scrap{rw.gateKeys ? `, ${rw.gateKeys} key` : ''}{rw.itemRarity ? `, ${rw.itemRarity} item` : ''}</div>
              </div>
            );
          })}

          {tab === 'available' && available.length === 0 && <div className="text-xs text-slate-500 p-3">Nothing available right now. Level up or finish your current quests.</div>}
          {tab === 'available' && available.map((def) => (
            <div key={def.id} className="flex items-center justify-between p-2.5 rounded border border-slate-800 bg-slate-950/40 text-xs">
              <div>
                <div className="text-white">{def.name} <span className="text-[10px] uppercase text-slate-500">{def.kind}{def.chapter ? ` · ch.${def.chapter}` : ''}</span></div>
                <div className="text-[11px] text-slate-400">{def.objectives.map((o) => objectiveText(o, o.count)).join(' · ')}</div>
              </div>
              <button onClick={() => run((c) => Q.acceptQuest(c, def.id))} className="px-2 py-1 rounded bg-orange-600/80 text-white shrink-0 ml-2">Accept</button>
            </div>
          ))}

          {tab === 'season' && (
            <>
              <div className="text-xs text-slate-300 p-2">Tier <b className="text-orange-400">{tier}</b> / 50 · {ch.season.points % SEASON_POINTS_PER_TIER} / {SEASON_POINTS_PER_TIER} points · today {ch.season.pointsToday} / 150 (daily cap). Points come from daily and weekly quests.</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {SEASON_REWARDS.map((r) => {
                  const claimed = ch.season.claimed.includes(r.tier);
                  const reached = r.tier <= tier;
                  return (
                    <div key={r.tier} className={`flex items-center justify-between p-2 rounded border text-xs ${reached ? 'border-slate-700' : 'border-slate-800 opacity-60'}`}>
                      <div><b>Tier {r.tier}</b> <span className="text-slate-400">{[r.scrap && `${r.scrap} scrap`, r.fragments && `${r.fragments} frag`, r.ore && `${r.ore} ore`, r.gateKeys && `${r.gateKeys} key`, r.seasonMarks && `${r.seasonMarks} marks`, r.skin && `skin`, r.title && `title: ${r.title}`].filter(Boolean).join(', ')}</span></div>
                      <button disabled={!reached || claimed} onClick={() => run((c) => Q.claimSeasonTier(c, r.tier, nowSeconds()))} className={`px-2 py-0.5 rounded ${claimed ? 'text-emerald-400' : reached ? 'bg-emerald-600/80 text-white' : 'text-slate-600'}`}>{claimed ? 'Claimed' : 'Claim'}</button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
