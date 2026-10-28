import React, { useEffect, useMemo, useRef, useState } from 'react';
import { tr, nm } from '../../i18n.ts';
import * as C from '../../../shared/rules/character.ts';
import { TALENT_BY_ID, type TalentBranch } from '../../../shared/data/talents.ts';
import { ACHIEVEMENTS_BY_ID } from '../../../shared/data/achievements.ts';
import type { AchievementCategory } from '../../../shared/data/achievements.ts';
import { SEASON_REWARDS } from '../../../shared/data/season.ts';
import type { ClientAction } from '../../../shared/rules/actions.ts';
import { UserProfile } from '../../save/profile.ts';
import { errorText } from '../../game/actions.ts';
import { RarityGem, CurrencyIcon } from '../GameIcon.tsx';
import { Badge, ProgressBar } from '../kit/Indicators.tsx';
import { Button } from '../kit/Button.tsx';
import { EmptyState } from '../kit/States.tsx';
import { Modal } from '../kit/Modal.tsx';
import { SegmentedControl, Tabs } from '../kit/Tabs.tsx';
import { VirtualGrid } from '../kit/Virtual.tsx';
import { rarityStyle } from '../kit/logic.ts';
import { notifications } from '../hud/notify.ts';
import { WindowFrame } from '../wm/WindowFrame.tsx';
import { BRANCHES, CodexKind, NODE_H, NODE_W, achievementRows, codexEntries, codexSummary, filterAchievements, formatDuration, rewardParts, seasonInfo, talentGraph, talentPointsSummary, tierState } from './careerLogic.ts';
import { CareerTab, careerIntent } from './careerIntent.ts';

type Run = (a: ClientAction) => Promise<{ ok: boolean; error?: string }>;
const TALENT_REASON: Record<string, string> = { level_too_low: 'Level too low', no_points: 'No talent points left', prerequisite_missing: 'Needs the talent before it', max_rank: 'Maximum rank' };
const STATE_COLOR = { maxed: 'var(--r-legendary)', available: 'var(--accent)', ranked: 'var(--c-line-strong)', locked: 'var(--c-line)' } as const;
const BRANCH_LABEL: Record<TalentBranch, string> = { offense: 'Offense', defense: 'Defense', logistics: 'Logistics' };
const talentName = (d: { nameKey: string; id: string }) => nm(d.nameKey, d.id.replace(/^(off|def|log)_/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()));
const pct = (v: number, isPercent: boolean) => (isPercent ? `+${Math.round(v * 1000) / 10}%` : `+${v}`);

const Talents: React.FC<{ ch: C.CharacterState; run: Run }> = ({ ch, run }) => {
  const [branch, setBranch] = useState<TalentBranch>('offense'); const [sel, setSel] = useState<string | null>(null); const [respec, setRespec] = useState(false);
  const g = useMemo(() => talentGraph(ch, branch), [ch, branch]);
  const pts = talentPointsSummary(ch); const def = sel ? TALENT_BY_ID.get(sel) : undefined; const node = g.nodes.find((n) => n.def.id === sel);
  return (
    <div className="grid gap-3" data-testid="talent-tree">
      <div className="flex items-center gap-3 flex-wrap">
        <SegmentedControl label={tr('Branch')} value={branch} onChange={(b) => { setBranch(b as TalentBranch); setSel(null); }} options={BRANCHES.map((b) => ({ id: b, label: tr(BRANCH_LABEL[b]) }))} />
        <span className="text-sm">{tr('Talent points available')}: <b data-testid="talent-points" style={{ color: pts.available > 0 ? 'var(--accent-2)' : 'var(--c-text-2)' }}>{pts.available}</b> <span style={{ color: 'var(--c-text-3)' }}>({tr('from level 5, one per level')})</span></span>
        <Button variant="ghost" disabled={pts.spent === 0} onClick={() => setRespec(true)}>{tr('Reset talents')} ({C.respecCost(ch).toLocaleString()} {tr('scrap')})</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="overflow-auto rounded-lg p-3" style={{ background: 'var(--c-bg-0)', border: '1px solid var(--c-line)' }}>
          <div className="relative mx-auto" style={{ width: g.width, height: g.height }}>
            <svg className="absolute inset-0 pointer-events-none" width={g.width} height={g.height} aria-hidden>
              {g.edges.map((e) => { const a = g.nodes.find((n) => n.def.id === e.from)!; const b = g.nodes.find((n) => n.def.id === e.to)!; const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H, x2 = b.x + NODE_W / 2, y2 = b.y, my = (y1 + y2) / 2; return <path key={`${e.from}-${e.to}`} d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`} fill="none" stroke={e.active ? 'var(--accent)' : 'var(--c-line-strong)'} strokeWidth={e.active ? 3 : 2} strokeDasharray={e.active ? undefined : '5 5'} />; })}
            </svg>
            {g.nodes.map((n) => (
              <button key={n.def.id} type="button" onClick={() => setSel(n.def.id)} aria-pressed={sel === n.def.id} data-talent={n.def.id} data-state={n.state} aria-label={`${talentName(n.def)} ${n.rank}/${n.def.maxRank}`}
                className="absolute rounded-xl text-left px-2 py-1 flex flex-col justify-center gap-1" style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H, background: n.state === 'locked' ? 'var(--c-bg-1)' : 'var(--c-bg-2)', border: `2px solid ${sel === n.def.id ? 'var(--c-text)' : STATE_COLOR[n.state]}`, opacity: n.state === 'locked' ? 0.65 : 1, boxShadow: n.state === 'available' ? '0 0 0 2px var(--accent-soft)' : undefined }}>
                <span className="text-[12px] font-semibold leading-tight truncate">{talentName(n.def)}</span>
                <span className="flex gap-1" aria-hidden>{Array.from({ length: n.def.maxRank }, (_, i) => <i key={i} style={{ width: 12, height: 12, borderRadius: 99, background: i < n.rank ? (n.state === 'maxed' ? 'var(--r-legendary)' : 'var(--accent)') : 'var(--c-bg-0)', border: '1px solid var(--c-line-strong)' }} />)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-lg p-3 grid gap-2 content-start" style={{ background: 'var(--c-bg-1)', border: '1px solid var(--c-line)' }} data-testid="talent-detail">
          {!def || !node ? <EmptyState icon="🌳" title={tr('Select a talent')} text={tr('Tap a node to see what it does.')} /> : (
            <>
              <b>{talentName(def)}</b>
              <p className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{nm(def.descKey, '') || `${tr(def.effectPerRank.stat.replace(/_/g, ' '))} ${pct(def.effectPerRank.valuePerRank, def.effectPerRank.isPercent)} ${tr('per rank')}`}</p>
              <div className="text-[12px]">{tr('Per rank')}: <b>{pct(def.effectPerRank.valuePerRank, def.effectPerRank.isPercent)}</b> · {tr('Now')}: <b>{pct(def.effectPerRank.valuePerRank * node.rank, def.effectPerRank.isPercent)}</b> · {tr('Rank')} {node.rank}/{def.maxRank}</div>
              <div className="text-[12px]" style={{ color: 'var(--c-text-3)' }}>{tr('Needs level')} {def.minLevel}{def.prerequisites?.length ? ` · ${tr('Requires')}: ${def.prerequisites.map((p) => talentName(TALENT_BY_ID.get(p)!)).join(', ')}` : ''}</div>
              <Button variant="primary" disabled={node.state !== 'available'} onClick={() => void run({ kind: 'rank_talent', talentId: def.id })}>{node.state === 'maxed' ? tr('Maxed') : tr('Rank up')}</Button>
              {node.state !== 'available' && node.state !== 'maxed' && node.reason && <span className="text-[12px]" style={{ color: 'var(--c-warn)' }}>{tr(TALENT_REASON[node.reason] ?? node.reason)}</span>}
            </>
          )}
        </div>
      </div>
      <Modal open={respec} onClose={() => setRespec(false)} title={tr('Reset all talents?')} closeLabel={tr('Close')} footer={<><Button variant="ghost" onClick={() => setRespec(false)}>{tr('Cancel')}</Button><Button variant="danger" disabled={ch.wallet.scrap < C.respecCost(ch)} onClick={async () => { setRespec(false); await run({ kind: 'respec' }); setSel(null); }}>{tr('Reset')}</Button></>}>
        <p>{tr('You get all {n} points back and can spend them again.', { n: pts.spent })}</p>
        <p className="text-sm mt-2" style={{ color: ch.wallet.scrap >= C.respecCost(ch) ? 'var(--c-text-2)' : 'var(--c-bad)' }}><CurrencyIcon kind="scrap" size={14} /> {C.respecCost(ch).toLocaleString()} {tr('scrap')} ({tr('you have')} {ch.wallet.scrap.toLocaleString()}). {tr('The price rises with every reset.')}</p>
      </Modal>
    </div>
  );
};

const CATEGORIES: Array<AchievementCategory | 'all'> = ['all', 'combat', 'progression', 'exploration', 'crafting', 'economy', 'pvp'];
const Achievements: React.FC<{ ch: C.CharacterState }> = ({ ch }) => {
  const [cat, setCat] = useState<AchievementCategory | 'all'>('all'); const [status, setStatus] = useState<'all' | 'done' | 'open'>('all');
  const rows = useMemo(() => achievementRows(ch), [ch]); const shown = filterAchievements(rows, cat, status); const done = rows.filter((r) => r.done).length;
  return (
    <div className="grid gap-2" data-testid="achievements">
      <ProgressBar kind="accent" value={done} max={rows.length} label={`${done} / ${rows.length}`} large ariaLabel={tr('Achievements')} />
      <div className="overflow-x-auto"><SegmentedControl label={tr('Category')} value={cat} onChange={(v) => setCat(v as typeof cat)} options={CATEGORIES.map((c) => ({ id: c, label: c === 'all' ? tr('All') : tr(c) }))} /></div>
      <SegmentedControl label={tr('Status')} value={status} onChange={(v) => setStatus(v as typeof status)} options={[{ id: 'all', label: tr('All') }, { id: 'open', label: tr('In progress') }, { id: 'done', label: tr('Done') }]} />
      {shown.length === 0 ? <EmptyState icon="🏆" title={tr('Nothing here')} /> : (
        <div className="grid gap-1.5 md:grid-cols-2">
          {shown.map((r) => { const def = ACHIEVEMENTS_BY_ID.get(r.id)!; return (
            <div key={r.id} className="p-2 rounded-lg grid gap-1" style={{ background: 'var(--c-bg-1)', border: `1px solid ${r.done ? 'var(--c-good)' : 'var(--c-line)'}` }}>
              <div className="flex items-center gap-2"><b className="flex-1 text-[13px] truncate">{nm(r.nameKey, r.id.replace('ach_', '').replace(/_/g, ' '))}</b>{r.done && <Badge tone="good">✓ {tr('Done')}</Badge>}</div>
              <div className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>{nm(r.descKey, '')}</div>
              <ProgressBar kind={r.done ? 'hull' : 'accent'} value={r.progress} max={r.target} label={`${Math.floor(r.progress).toLocaleString()} / ${r.target.toLocaleString()}`} ariaLabel={nm(r.nameKey, r.id)} />
              <div className="text-[11px]" style={{ color: 'var(--c-text-2)' }}>{tr('Reward')}: {def.rewardScrap.toLocaleString()} {tr('scrap')}{def.rewardSeasonMarks ? `, ${def.rewardSeasonMarks} ${tr('season marks')}` : ''}{def.rewardTitle ? `, ${tr('title')} "${def.rewardTitle}"` : ''}</div>
            </div>); })}
        </div>
      )}
    </div>
  );
};

const KINDS: Array<[CodexKind, string]> = [['enemy', 'Enemies'], ['item', 'Items'], ['map', 'Zones'], ['vehicle', 'Vehicles']];
const Codex: React.FC<{ ch: C.CharacterState }> = ({ ch }) => {
  const [kind, setKind] = useState<CodexKind>('enemy'); const [onlyKnown, setOnly] = useState(false);
  const entries = useMemo(() => codexEntries(ch, kind).filter((e) => !onlyKnown || e.known), [ch, kind, onlyKnown]); const sum = codexSummary(ch, kind);
  return (
    <div className="grid gap-2" data-testid="codex">
      <div className="overflow-x-auto"><SegmentedControl label={tr('Codex')} value={kind} onChange={(v) => setKind(v as CodexKind)} options={KINDS.map(([k, l]) => ({ id: k, label: `${tr(l)} ${codexSummary(ch, k).have}/${codexSummary(ch, k).total}` }))} /></div>
      <ProgressBar kind="xp" value={sum.have} max={sum.total} label={`${sum.have} / ${sum.total}`} large ariaLabel={tr('Codex')} />
      <Button pressed={onlyKnown} onClick={() => setOnly((v) => !v)}>{tr('Only discovered')}</Button>
      {entries.length === 0 ? <EmptyState icon="📖" title={tr('Nothing discovered yet')} text={tr('Meet enemies, find items and visit zones to fill the codex.')} /> : (
        <VirtualGrid items={entries} cell={104} gap={8} height={320} renderCell={(e) => (
          <div className="rounded-lg p-1.5 flex flex-col items-center justify-center text-center text-[11px]" style={{ width: 104, height: 64, background: e.known ? 'var(--c-bg-2)' : 'var(--c-bg-0)', border: `1px solid ${e.known && e.rarity ? `var(${rarityStyle(e.rarity).cssVar})` : 'var(--c-line)'}`, color: e.known ? 'var(--c-text)' : 'var(--c-text-3)' }} title={e.known ? nm(e.nameKey, e.name) : tr('Not discovered')}>
            {e.known && e.rarity && <RarityGem rarity={e.rarity.toLowerCase()} size={12} />}
            <span className="line-clamp-2">{e.known ? nm(e.nameKey, e.name) : '???'}</span>
          </div>
        )} />
      )}
    </div>
  );
};

const Season: React.FC<{ ch: C.CharacterState; run: Run }> = ({ ch, run }) => {
  const info = seasonInfo(ch, Math.floor(Date.now() / 1000)); const track = useRef<HTMLDivElement>(null);
  useEffect(() => { track.current?.scrollTo({ left: Math.max(0, (info.tier - 2) * 124) }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grid gap-3" data-testid="season">
      <div className="flex items-center gap-3 flex-wrap">
        <div><div className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>{tr('Season')} {ch.season.seasonId || ''}</div><b className="text-2xl" style={{ color: 'var(--accent-2)' }}>{tr('Tier ')}{info.tier} <span className="text-sm" style={{ color: 'var(--c-text-3)' }}>/ 50</span></b></div>
        <div className="flex-1 min-w-[10rem]"><ProgressBar kind="xp" value={info.pointsInTier} max={info.pointsPerTier} label={info.maxed ? tr('Complete') : `${info.pointsInTier} / ${info.pointsPerTier} ${tr('points')}`} large ariaLabel={tr('Season progress')} /><div className="text-[11px] mt-0.5" style={{ color: 'var(--c-text-3)' }}>{tr('today')} {ch.season.pointsToday} · {tr('Time left')}: <b data-testid="season-left">{formatDuration(info.secondsLeft)}</b></div></div>
        <Button variant="primary" disabled={info.claimable.length === 0} onClick={async () => { for (const t of info.claimable) { const r = await run({ kind: 'claim_season_tier', tier: t }); if (!r.ok) break; } notifications.push({ group: 'loot', title: tr('Season rewards claimed'), kind: 'success' }); }}>{tr('Claim all')} ({info.claimable.length})</Button>
      </div>
      {info.nextReward && <div className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{tr('Next reward')} ({tr('Tier ')}{info.nextReward.tier}): {rewardParts(info.nextReward).map((p) => p.amount ? `${p.amount.toLocaleString()} ${tr(p.kind === 'gate_key' ? 'key' : p.kind)}` : tr(p.text ?? p.kind)).join(' · ')}</div>}
      <div ref={track} className="flex gap-2 overflow-x-auto pb-2" role="list" aria-label={tr('Season track')}>
        {SEASON_REWARDS.map((r) => { const st = tierState(ch, r); const special = !!(r.skin || r.title); return (
          <div key={r.tier} role="listitem" data-tier={r.tier} data-state={st} className="shrink-0 rounded-xl p-2 grid gap-1 content-between" style={{ width: 116, minHeight: 124, background: st === 'claimable' ? 'var(--accent-soft)' : 'var(--c-bg-1)', border: `2px solid ${st === 'claimable' ? 'var(--accent)' : st === 'claimed' ? 'var(--c-good)' : special ? 'var(--r-legendary)' : 'var(--c-line)'}`, opacity: st === 'locked' ? 0.7 : 1 }}>
            <div className="flex items-center justify-between"><b>{r.tier}</b>{st === 'claimed' && <span style={{ color: 'var(--c-good)' }}>✓</span>}{st === 'locked' && <span>🔒</span>}</div>
            <div className="text-[11px] grid gap-0.5" style={{ color: 'var(--c-text-2)' }}>{rewardParts(r).map((p, i) => <span key={i}>{p.amount ? `${p.amount.toLocaleString()} ${tr(p.kind === 'gate_key' ? 'key' : p.kind)}` : `✨ ${tr(p.text ?? p.kind)}`}</span>)}</div>
            <Button variant={st === 'claimable' ? 'primary' : 'ghost'} disabled={st !== 'claimable'} onClick={() => void run({ kind: 'claim_season_tier', tier: r.tier })}>{st === 'claimed' ? tr('Claimed') : tr('Claim')}</Button>
          </div>); })}
      </div>
    </div>
  );
};

/** Career window: talent tree, achievements, codex and the season pass. */
export const CareerWindow: React.FC<{ profile: UserProfile; onAction: Run }> = ({ profile, onAction }) => {
  const ch = profile.character; const [tab, setTab] = useState<CareerTab>('talents'); const [msg, setMsg] = useState('');
  useEffect(() => careerIntent.subscribe(() => { const t = careerIntent.take(); if (t) setTab(t); }), []);
  const run: Run = async (a) => { const r = await onAction(a); setMsg(r.ok ? '' : errorText(r.error || 'failed')); return r; };
  const claimable = seasonInfo(ch, Math.floor(Date.now() / 1000)).claimable.length;
  return (
    <WindowFrame id="career" title="Career" width="min(1040px, 98vw)" height="min(720px, 95vh)">
      <div className="flex flex-col h-full min-h-0 gap-2">
        <Tabs label={tr('Career')} value={tab} onChange={(v) => setTab(v as CareerTab)} tabs={[{ id: 'talents', label: tr('Talents'), pip: C.talentPointsAvailable(ch) > 0 }, { id: 'achievements', label: tr('Achievements') }, { id: 'codex', label: tr('Codex') }, { id: 'season', label: tr('Season pass'), pip: claimable }]} />
        {msg && <div className="text-xs" style={{ color: 'var(--c-warn)' }} role="alert">{msg}</div>}
        <div className="flex-1 min-h-0 overflow-y-auto">{tab === 'talents' ? <Talents ch={ch} run={run} /> : tab === 'achievements' ? <Achievements ch={ch} /> : tab === 'codex' ? <Codex ch={ch} /> : <Season ch={ch} run={run} />}</div>
      </div>
    </WindowFrame>
  );
};
