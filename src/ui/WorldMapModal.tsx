import React, { useEffect, useMemo, useRef, useState } from 'react';
import { tr, T, nm } from '../i18n.ts';
import { MAP_CONNECTIONS, MAP_METADATA_TABLE } from '../../shared/data/maps.ts';
import { WorldEventKind } from '../../shared/sim/events.ts';
import { CurrencyIcon } from './GameIcon.tsx';
import { EventCalendar } from './EventCalendar.tsx';
import { Badge } from './kit/Indicators.tsx';
import { Button } from './kit/Button.tsx';
import { Modal } from './kit/Modal.tsx';
import { SegmentedControl } from './kit/Tabs.tsx';
import { WindowFrame } from './wm/WindowFrame.tsx';
import { useWindowMode } from './wm/useWindows.ts';
import { MAP_SIZE, NODE_POSITIONS, TERRITORY_COLOR, Territory, levelFit, neighborsOf, territoryOf, travelInfo, zoneMarkers } from './world/worldLogic.ts';

interface WorldMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMapId: string | number;
  playerLevel: number;
  onTravelToMap: (mapId: number | string) => void;
  /** maps named by active quests: pulsing yellow ring on the node */
  questMapIds?: number[];
  /** zones the player has been to (the rest is fogged) */
  visitedMaps?: number[];
  scrap?: number;
  /** fast travel only works from a safe zone */
  inSafeZone?: boolean;
}

const EVENT_LABEL: Record<WorldEventKind, string> = { invasion: 'Invasion', convoy_race: 'Convoy race', storm_event: 'Storm', meteor_shower: 'Meteor shower', weekend_xp: 'Weekend XP' };
const REASON: Record<string, string> = { not_in_safe_zone: 'Fast travel only works from a safe zone', not_visited: 'You have not been there yet', same_zone: 'You are already here', unreachable: 'No portal route', not_enough_scrap: 'Not enough scrap', level_too_low: 'Your level is too low (at most 5 below the zone)' };
const FILTERS: Array<[string, Territory | 'all']> = [['All', 'all'], ['Coastal', 'coastal'], ['Highland', 'highland'], ['Steppe', 'steppe'], ['Neutral', 'neutral'], ['PvP', 'pvp'], ['Endgame', 'endgame']];
const BLOBS: Array<{ t: Territory; x: number; y: number; r: number }> = [
  { t: 'coastal', x: 210, y: 160, r: 170 }, { t: 'highland', x: 400, y: 120, r: 130 }, { t: 'steppe', x: 240, y: 360, r: 170 }, { t: 'neutral', x: 640, y: 270, r: 190 },
  { t: 'pvp', x: 720, y: 390, r: 150 }, { t: 'endgame', x: 1040, y: 300, r: 190 }, { t: 'arena', x: 500, y: 440, r: 70 },
];

/** World map: 30 zones on a styled node map with fog for unvisited zones, territory colours, level ranges, markers and fast travel with cost. */
export const WorldMapModal: React.FC<WorldMapModalProps> = ({ isOpen, onClose, currentMapId, playerLevel, onTravelToMap, questMapIds, visitedMaps = [], scrap = 0, inSafeZone = true }) => {
  const mode = useWindowMode();
  const currentId = useMemo(() => {
    if (typeof currentMapId === 'number') return currentMapId;
    for (const meta of Object.values(MAP_METADATA_TABLE)) if (meta.key === currentMapId || `map_${meta.id}` === currentMapId || String(meta.id) === currentMapId) return meta.id;
    return 1;
  }, [currentMapId]);
  const [selected, setSelected] = useState(currentId); const [filter, setFilter] = useState<Territory | 'all'>('all'); const [sheet, setSheet] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const markers = useMemo(() => zoneMarkers(Math.floor(Date.now() / 1000)), [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const visited = useMemo(() => [...new Set([...visitedMaps, currentId])], [visitedMaps, currentId]);
  useEffect(() => { if (isOpen) { setSelected(currentId); const p = NODE_POSITIONS[currentId]; if (p && scroller.current) scroller.current.scrollTo({ left: Math.max(0, p.x - scroller.current.clientWidth / 2), top: Math.max(0, p.y - scroller.current.clientHeight / 2) }); } }, [isOpen, currentId]);
  if (!isOpen) return null;

  const meta = MAP_METADATA_TABLE[selected] ?? MAP_METADATA_TABLE[1];
  const known = visited.includes(meta.id); const terr = territoryOf(meta); const fit = levelFit(playerLevel, meta.levelRange);
  const travel = travelInfo({ from: currentId, to: meta.id, visited, level: playerLevel, scrap, inSafeZone });
  const mk = markers.get(meta.id)!;
  const fitText = { low: tr('Far below your level'), fit: tr('Right for your level'), tough: tr('Tough for your level'), too_high: tr('Too high for your level') }[fit];
  const fitColor = { low: 'var(--c-text-3)', fit: 'var(--c-good)', tough: 'var(--c-warn)', too_high: 'var(--c-bad)' }[fit];

  const card = (
    <div className="grid gap-2 text-sm" data-testid="zone-card">
      <div>
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: TERRITORY_COLOR[terr] }}>{tr('Zone')} {meta.id} · {tr(meta.region)}</span>
        <h3 className="text-lg font-bold">{known ? nm(meta.nameKey, meta.name) : tr('Unknown zone')}</h3>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={fit === 'fit' ? 'good' : fit === 'too_high' ? 'bad' : fit === 'tough' ? 'warn' : 'neutral'}>Lv {meta.levelRange[0]}–{meta.levelRange[1]}</Badge>
        {mk.safe && <Badge tone="good">🛡 {tr('Safe zone')}</Badge>}{mk.pvp && <Badge tone="bad">⚔ PvP</Badge>}{mk.war && <Badge tone="warn">⚑ {tr('Faction war')}</Badge>}{mk.gate && <Badge tone="accent">◈ {tr('Gate')}</Badge>}
        {meta.type === 'ARENA' && <Badge>{tr('Arena')}</Badge>}{known && <Badge>{tr(meta.weather)}</Badge>}
      </div>
      <div className="text-[12px]" style={{ color: fitColor }}>{fitText}</div>
      {!known ? <p className="text-[12px]" style={{ color: 'var(--c-text-3)' }}>{tr('Find the portal in a neighbouring zone to discover this place.')}</p> : null}
      {mk.events.length > 0 && <div className="text-[12px]" style={{ color: 'var(--c-warn)' }}>✦ {tr('Running now')}: {mk.events.map((e) => tr(EVENT_LABEL[e])).join(', ')}</div>}
      {mk.war && <div className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{tr('Three control points: hold them with your faction for the weekly war score.')}</div>}
      <div className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{tr('Connected to')}: {neighborsOf(meta.id).map((n) => <button key={n} type="button" className="underline mr-2 px-2 min-h-[44px] min-w-[44px]" onClick={() => setSelected(n)}>{visited.includes(n) ? nm(MAP_METADATA_TABLE[n].nameKey, MAP_METADATA_TABLE[n].name) : `#${n}`}</button>)}</div>
      <div className="rounded-lg p-2 grid gap-1" style={{ background: 'var(--c-bg-0)', border: '1px solid var(--c-line)' }}>
        {meta.id === currentId ? <span style={{ color: 'var(--c-good)' }}>📍 {tr('You are here')}</span> : (
          <>
            <div className="flex items-center justify-between"><span>{tr('Fast travel')}</span><span className="tabular-nums" style={{ color: ((travel.reason === 'not_enough_scrap') ? 'var(--c-bad)' : 'var(--c-text-2)') }}><CurrencyIcon kind="scrap" size={14} /> {travel.cost.toLocaleString()} · {travel.hops} {tr('hops')}</span></div>
            <Button variant="primary" disabled={!travel.allowed} onClick={() => { onTravelToMap(meta.id); }} data-testid="travel">{tr('Travel')}</Button>
            {!travel.allowed && travel.reason && <span className="text-[11px]" style={{ color: 'var(--c-warn)' }}>{tr(REASON[travel.reason] ?? travel.reason)}</span>}
          </>
        )}
      </div>
      <details><summary className="text-[12px] cursor-pointer" style={{ color: 'var(--c-text-2)' }}>{tr('World events')}</summary><EventCalendar /></details>
    </div>
  );

  const canvas = (
    <div ref={scroller} className="relative overflow-auto rounded-lg h-full" style={{ background: 'radial-gradient(circle at 50% 40%, #0f1b2d, var(--c-bg-0))', border: '1px solid var(--c-line)' }} data-testid="world-canvas">
      <div className="relative select-none" style={{ width: MAP_SIZE.w, height: MAP_SIZE.h + 30 }}>
        <svg className="absolute inset-0 pointer-events-none" width={MAP_SIZE.w} height={MAP_SIZE.h + 30} aria-hidden>
          <defs>{BLOBS.map((b) => <radialGradient key={b.t} id={`blob-${b.t}`}><stop offset="0%" stopColor={TERRITORY_COLOR[b.t]} stopOpacity="0.20" /><stop offset="100%" stopColor={TERRITORY_COLOR[b.t]} stopOpacity="0" /></radialGradient>)}</defs>
          {BLOBS.map((b) => <circle key={b.t} cx={b.x} cy={b.y} r={b.r} fill={`url(#blob-${b.t})`} opacity={filter === 'all' || filter === b.t ? 1 : 0.25} />)}
          {MAP_CONNECTIONS.map(([a, b], i) => { const A = NODE_POSITIONS[a]; const B = NODE_POSITIONS[b]; if (!A || !B) return null; const both = visited.includes(a) && visited.includes(b); const sel = a === selected || b === selected;
            return <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={sel ? 'var(--accent)' : both ? '#475b7e' : '#243047'} strokeWidth={sel ? 3 : both ? 2 : 1.5} strokeDasharray={both ? undefined : '4 5'} />; })}
        </svg>
        {Object.values(MAP_METADATA_TABLE).map((m) => {
          const pos = NODE_POSITIONS[m.id]; if (!pos) return null;
          const seen = visited.includes(m.id); const cur = m.id === currentId; const sel = m.id === selected; const t = territoryOf(m); const z = markers.get(m.id)!; const dim = filter !== 'all' && t !== filter;
          return (
            <button key={m.id} type="button" onClick={() => { setSelected(m.id); if (mode === 'sheet') setSheet(true); }} aria-label={`${seen ? nm(m.nameKey, m.name) : tr('Unknown zone')} (${m.id})`} aria-pressed={sel} data-node={m.id} data-visited={seen || undefined} data-quest-marker={questMapIds?.includes(m.id) ? 'true' : undefined}
              className={`absolute w-11 h-11 rounded-xl flex items-center justify-center font-bold text-xs transition-transform ${sel ? 'scale-110' : 'hover:scale-105'}`} style={{ left: pos.x - 22, top: pos.y - 22, opacity: dim ? 0.3 : 1, background: seen ? (cur ? '#064e3b' : 'var(--c-bg-2)') : 'var(--c-bg-0)', border: `2px ${seen ? 'solid' : 'dashed'} ${sel ? 'var(--accent)' : seen ? TERRITORY_COLOR[t] : 'var(--c-line-strong)'}`, color: seen ? 'var(--c-text)' : 'var(--c-text-3)', boxShadow: questMapIds?.includes(m.id) ? '0 0 0 3px #fde047' : cur ? '0 0 0 3px #34d399' : undefined }}>
              {seen ? m.id : '?'}
              <span className="absolute -top-2 -right-2 flex gap-0.5">{z.safe && <i className="not-italic text-[11px]" title={tr('Safe zone')}>🛡</i>}{z.pvp && <i className="not-italic text-[11px]">⚔</i>}{z.war && <i className="not-italic text-[11px]">⚑</i>}{z.events.length > 0 && <i className="not-italic text-[11px]" style={{ color: 'var(--c-warn)' }}>✦</i>}{z.gate && seen && <i className="not-italic text-[11px]">◈</i>}</span>
              {cur && <span className="absolute -top-5 text-[13px]" aria-hidden>📍</span>}
              <span className="absolute top-full mt-0.5 whitespace-nowrap text-[11px] font-semibold pointer-events-none" style={{ color: seen ? 'var(--c-text)' : 'var(--c-text-3)' }}>{seen ? nm(m.nameKey, m.name) : `Lv ${m.levelRange[0]}+`}</span>
              {seen && <span className="absolute top-full mt-[14px] whitespace-nowrap text-[11px] pointer-events-none" style={{ color: 'var(--c-text-3)' }}>Lv {m.levelRange[0]}–{m.levelRange[1]}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <WindowFrame id="map" title="World Map & Fast Travel" width="min(1180px, 98vw)" height="min(780px, 95vh)" headerExtra={<div className="max-[1000px]:hidden"><SegmentedControl label={tr('Region')} value={filter} onChange={(v) => setFilter(v as Territory | 'all')} options={FILTERS.map(([l, v]) => ({ id: v, label: l === 'All' ? tr('All') : tr(T(l)) }))} /></div>}>
      <div className={mode === 'sheet' ? 'h-full min-h-0' : 'grid gap-3 h-full min-h-0'} style={mode === 'sheet' ? undefined : { gridTemplateColumns: 'minmax(0, 1fr) 300px' }}>
        {canvas}
        {mode === 'sheet' ? <Modal open={sheet} sheet onClose={() => setSheet(false)} title={known ? nm(meta.nameKey, meta.name) : tr('Unknown zone')} closeLabel={tr('Close')}>{card}</Modal> : <div className="overflow-y-auto rounded-lg p-3" style={{ background: 'var(--c-bg-1)', border: '1px solid var(--c-line)' }}>{card}</div>}
      </div>
    </WindowFrame>
  );
};
