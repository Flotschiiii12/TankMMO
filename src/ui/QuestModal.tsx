import { WindowFrame } from './wm/WindowFrame.tsx';
import React, { useState } from 'react';
import { tr, nm } from '../i18n.ts';
import { UserProfile } from '../save/profile.ts';
import { soundEngine } from '../audio/soundEngine.ts';
import { errorText } from '../game/actions.ts';
import type { ClientAction } from '../../shared/rules/actions.ts';
import { QUEST_BY_ID, QuestObjective } from '../../shared/data/quests.ts';
import * as Q from '../../shared/rules/quests.ts';
import { StoryJournal } from './Dialogue.tsx';
import { Button } from './kit/Button.tsx';
import { EmptyState } from './kit/States.tsx';
import { Badge, ProgressBar } from './kit/Indicators.tsx';
import { SegmentedControl, Tabs } from './kit/Tabs.tsx';
import { CurrencyChip } from './kit/Currency.tsx';
import { QUEST_KINDS, QuestKindFilter, getTracked, kindMatches, setTracked, trackerOrder } from './career/careerLogic.ts';
import type { QuestDef } from '../../shared/data/quests.ts';

interface Props {
  profile: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: ClientAction) => Promise<{ ok: boolean; error?: string }>;
  onReplay?: (scene: import('../../shared/data/story.ts').StoryScene) => void;
}

const objectiveText = (o: QuestObjective, target: number): string => {
  const t = o.target !== undefined ? ` ${String(o.target).replace(/_/g, ' ')}` : '';
  const e = o.elite ? ` ${tr('elite')}` : '';
  switch (o.type) {
    case 'kill': return tr('Defeat {n}{e}{t} enemies', { n: target, e, t });
    case 'collect_ore': return tr('Collect {n}{t} ore', { n: target, t });
    case 'deliver': return tr('Deliver {n} scrap', { n: target });
    case 'reach_map': return tr('Reach map {t}', { t: String(o.target) });
    case 'defeat_boss': return tr('Defeat a boss{t}', { t });
    case 'clear_gate': return tr('Clear a gate{t}', { t });
    case 'win_arena': return tr('Win {n} arena match(es)', { n: target });
    case 'craft': return tr('Craft {n} item(s)', { n: target });
    case 'upgrade': return tr('Upgrade items {n} times', { n: target });
    case 'explore': return tr('Discover {n} secret(s)', { n: target });
    case 'escort': return tr('Complete {n} convoy escort(s)', { n: target });
    case 'use_portal': return tr('Use portals {n} times', { n: target });
    case 'tutorial': return tr('Tutorial: {t}', { t: String(o.target) });
  }
};

const KIND_LABEL: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', story: 'Story', tutorial: 'Story', all: 'All' };
const RewardLine: React.FC<{ rw: { xp: number; scrap: number; gateKeys?: number; itemRarity?: string } }> = ({ rw }) => (
  <div className="flex items-center gap-1.5 flex-wrap text-[11px]" style={{ color: 'var(--c-text-2)' }} data-testid="reward">
    <span>{tr('Reward')}:</span><Badge tone="accent">{rw.xp.toLocaleString()} XP</Badge><CurrencyChip kind="scrap" value={rw.scrap} />
    {rw.gateKeys ? <CurrencyChip kind="gate_key" value={rw.gateKeys} /> : null}{rw.itemRarity ? <Badge>{tr(rw.itemRarity)} {tr('item')}</Badge> : null}
  </div>
);

/** Quest log: Active / Available / Journal, category filter, tracked-quest pin (shown first in the HUD), reward preview. */
export const QuestModal: React.FC<Props> = ({ profile, isOpen, onAction, onReplay }) => {
  const [tab, setTab] = useState<'active' | 'available' | 'journal'>('active');
  const [kind, setKind] = useState<QuestKindFilter>('all');
  const [tracked, setTrackedState] = useState<string | null>(() => getTracked());
  const [msg, setMsg] = useState('');
  if (!isOpen) return null;
  const ch = profile.character;
  const run = async (action: ClientAction) => { soundEngine.playUIClick(); const r = await onAction(action); setMsg(r.ok ? '' : errorText(r.error || 'failed')); };
  const pin = (id: string) => { const next = tracked === id ? null : id; setTracked(next); setTrackedState(next); window.dispatchEvent(new Event('treadfront-track')); };

  const active = trackerOrder(Object.values(ch.quests.active), tracked).filter((aq) => { const d = QUEST_BY_ID.get(aq.id); return d && kindMatches(d.kind, kind); });
  const allActive = Object.values(ch.quests.active).length;
  const available = Q.availableQuests(ch).slice(0, 60).filter((q) => kindMatches(q.kind, kind));
  const count = (k: QuestKindFilter) => (tab === 'active' ? Object.values(ch.quests.active).filter((aq) => { const d = QUEST_BY_ID.get(aq.id); return d && kindMatches(d.kind, k); }).length : Q.availableQuests(ch).slice(0, 60).filter((q) => kindMatches(q.kind, k)).length);

  const activeCard = (aq: (typeof active)[number]) => {
    const def = QUEST_BY_ID.get(aq.id)!; const rw = Q.scaledReward(def, aq.levelAtAccept); const isTracked = tracked === aq.id;
    return (
      <div key={aq.id} className="p-2.5 rounded-lg grid gap-1.5" style={{ background: 'var(--c-bg-1)', border: `1px solid ${aq.ready ? 'var(--c-good)' : isTracked ? 'var(--accent-line)' : 'var(--c-line)'}` }} data-testid="quest-card">
        <div className="flex items-center gap-2 flex-wrap">
          <b className="flex-1 min-w-0 text-[13px] truncate">{nm(def.nameKey, def.name)}</b><Badge>{tr(KIND_LABEL[def.kind] ?? def.kind)}</Badge>
          <Button variant={isTracked ? 'primary' : 'ghost'} pressed={isTracked} onClick={() => pin(aq.id)} label={isTracked ? tr('Stop tracking') : tr('Track this quest')}>📌</Button>
          {aq.ready && <Button variant="primary" onClick={() => void run({ kind: 'claim_quest', questId: aq.id })}>{tr('Claim')}</Button>}
          {def.kind !== 'daily' && def.kind !== 'weekly' && <Button variant="ghost" onClick={() => void run({ kind: 'abandon_quest', questId: aq.id })}>{tr('abandon')}</Button>}
        </div>
        {def.objectives.map((o, i) => (<div key={i}><div className="flex justify-between text-[11px]" style={{ color: 'var(--c-text-2)' }}><span>{objectiveText(o, aq.targets[i])}</span><span className="tabular-nums">{aq.progress[i]} / {aq.targets[i]}</span></div><ProgressBar kind={aq.ready ? 'hull' : 'accent'} value={aq.progress[i]} max={aq.targets[i]} ariaLabel={objectiveText(o, aq.targets[i])} /></div>))}
        <RewardLine rw={rw} />
      </div>
    );
  };
  const availCard = (def: QuestDef) => {
    const rw = Q.scaledReward(def, ch.level);
    return (
      <div key={def.id} className="p-2.5 rounded-lg grid gap-1.5" style={{ background: 'var(--c-bg-1)', border: '1px solid var(--c-line)' }} data-testid="quest-card">
        <div className="flex items-center gap-2 flex-wrap"><b className="flex-1 min-w-0 text-[13px] truncate">{nm(def.nameKey, def.name)}</b><Badge>{tr(KIND_LABEL[def.kind] ?? def.kind)}{def.chapter ? ` · ${tr('ch.')}${def.chapter}` : ''}</Badge><Button variant="primary" onClick={() => void run({ kind: 'accept_quest', questId: def.id })}>{tr('Accept')}</Button></div>
        <div className="text-[11px]" style={{ color: 'var(--c-text-2)' }}>{def.objectives.map((o) => objectiveText(o, o.count)).join(' · ')}</div>
        <RewardLine rw={rw} />
      </div>
    );
  };

  return (
    <WindowFrame id="quests" width="min(860px, 96vw)" height="min(640px, 94vh)">
      <div className="flex flex-col h-full min-h-0 gap-2">
        <Tabs label={tr('Quests')} value={tab} onChange={(v) => setTab(v as typeof tab)} tabs={[{ id: 'active', label: `${tr('Active')} (${allActive})`, pip: Object.values(ch.quests.active).filter((q) => q.ready).length }, { id: 'available', label: `${tr('Available')} (${Q.availableQuests(ch).slice(0, 60).length})` }, { id: 'journal', label: tr('Journal') }]} />
        {tab !== 'journal' && <div className="overflow-x-auto"><SegmentedControl label={tr('Category')} value={kind} onChange={(v) => setKind(v as QuestKindFilter)} options={QUEST_KINDS.map((k) => ({ id: k, label: `${tr(KIND_LABEL[k])} ${count(k)}` }))} /></div>}
        {msg && <div className="text-xs" style={{ color: 'var(--c-warn)' }} role="alert">{msg}</div>}
        <div className="flex-1 min-h-0 overflow-y-auto grid gap-1.5 content-start" data-testid={`quests-${tab}`}>
          {tab === 'active' && (active.length === 0 ? <EmptyState icon="📜" title={tr('No active quests')} text={tr('Check the Available tab.')} /> : active.map(activeCard))}
          {tab === 'available' && (available.length === 0 ? <EmptyState icon="📭" title={tr('Nothing available right now')} text={tr('Level up or finish your current quests.')} /> : available.map(availCard))}
          {tab === 'journal' && <StoryJournal ch={ch} onReplay={(sc) => onReplay?.(sc)} />}
        </div>
      </div>
    </WindowFrame>
  );
};
