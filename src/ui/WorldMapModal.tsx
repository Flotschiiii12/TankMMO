/**
 * Treadfront - World Map Modal
 * Interactive tactical node-graph map of all 30 world zones.
 * Displays portal topology, safe zones, biome types, level brackets,
 * current player location, and single-player roaming fast travel.
 */

import { tr, T, nm } from '../i18n.ts';
import { EventCalendar } from './EventCalendar.tsx';
import React, { useState, useMemo } from 'react';
import {
  Compass,
  MapPin,
  Shield,
  Swords,
  CloudRain,
  Sun,
  Snowflake,
  Wind,
  Flame,
  Zap,
  ArrowRight,
  X,
  Sparkles,
  Mountain,
} from 'lucide-react';
import { MAP_CONNECTIONS, MAP_METADATA_TABLE, MapMetadata } from '../../shared/data/maps.ts';

interface WorldMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMapId: string | number;
  playerLevel: number;
  onTravelToMap: (mapId: number | string) => void;
  /** maps named by active quests: pulsing yellow ring on the node */
  questMapIds?: number[];
}

// 2D Tactical Layout Coordinates for all 30 nodes on the World Map canvas
const NODE_POSITIONS: Record<number, { x: number; y: number }> = {
  // Region 1: Coastal Union (West / Northwest)
  1: { x: 80, y: 110 },
  2: { x: 170, y: 150 },
  3: { x: 260, y: 190 },
  4: { x: 350, y: 240 },

  // Region 2: Highland Union (North / Northwest)
  5: { x: 320, y: 60 },
  6: { x: 380, y: 110 },
  7: { x: 440, y: 160 },
  8: { x: 470, y: 220 },

  // Region 3: Steppe Caravan (Southwest)
  9: { x: 90, y: 390 },
  10: { x: 190, y: 370 },
  11: { x: 290, y: 340 },
  12: { x: 380, y: 310 },

  // Neutral Middle Chain
  13: { x: 500, y: 340 }, // Crossfield Hub
  14: { x: 480, y: 270 }, // Green Crossing
  15: { x: 580, y: 250 }, // River Delta
  16: { x: 670, y: 240 }, // Red Canyon
  17: { x: 750, y: 220 }, // Frost Border
  18: { x: 820, y: 190 }, // Glacier Lakes
  19: { x: 850, y: 280 }, // Old Highway
  20: { x: 890, y: 360 }, // Glowworm Swamp

  // PvP Borderlands
  21: { x: 610, y: 360 }, // Bridgehead
  22: { x: 720, y: 350 }, // Customs Station
  23: { x: 810, y: 380 }, // Ashfield
  24: { x: 740, y: 440 }, // No Man's Land

  // Endgame
  25: { x: 950, y: 440 }, // Ruined City Vaelmar
  26: { x: 1040, y: 410 }, // Obsidian Desert
  27: { x: 1080, y: 320 }, // Storm Coast
  28: { x: 1060, y: 210 }, // Iron Crown
  29: { x: 1120, y: 130 }, // The Burning Valley

  // Arena
  30: { x: 500, y: 440 }, // The Pit
};

export const WorldMapModal: React.FC<WorldMapModalProps> = ({
  isOpen,
  onClose,
  currentMapId,
  playerLevel,
  onTravelToMap,
  questMapIds,
}) => {
  // Resolve current numeric map id
  const currentNumericId = useMemo(() => {
    if (typeof currentMapId === 'number') return currentMapId;
    for (const meta of Object.values(MAP_METADATA_TABLE)) {
      if (meta.key === currentMapId || `map_${meta.id}` === currentMapId) {
        return meta.id;
      }
    }
    if (currentMapId === 'green_valley') return 1;
    if (currentMapId === 'canyon_flats') return 10;
    if (currentMapId === 'frostline_pass') return 17;
    if (currentMapId === 'ash_city') return 25;
    return 1;
  }, [currentMapId]);

  const [selectedMapId, setSelectedMapId] = useState<number>(currentNumericId);
  const [activeRegionFilter, setActiveRegionFilter] = useState<string>('ALL');

  if (!isOpen) return null;

  const selectedMeta = MAP_METADATA_TABLE[selectedMapId] || MAP_METADATA_TABLE[1];

  const getBiomeColor = (biome: string) => {
    switch (biome) {
      case 'coastal':
        return '#3b82f6';
      case 'highland':
        return '#22c55e';
      case 'steppe':
        return '#eab308';
      case 'canyon':
        return '#f97316';
      case 'snow':
        return '#38bdf8';
      case 'marsh':
        return '#14b8a6';
      case 'desert':
        return '#d97706';
      case 'ash':
      case 'volcanic':
        return '#ef4444';
      case 'ruins':
        return '#a855f7';
      case 'arena':
        return '#ec4899';
      default:
        return '#10b981';
    }
  };

  const getWeatherIcon = (weather: string) => {
    switch (weather) {
      case 'rain':
        return <CloudRain className="w-3.5 h-3.5 text-blue-400" />;
      case 'storm':
        return <Zap className="w-3.5 h-3.5 text-yellow-400" />;
      case 'snowstorm':
        return <Snowflake className="w-3.5 h-3.5 text-cyan-300" />;
      case 'sandstorm':
        return <Wind className="w-3.5 h-3.5 text-amber-400" />;
      case 'ashfall':
        return <Flame className="w-3.5 h-3.5 text-red-400" />;
      default:
        return <Sun className="w-3.5 h-3.5 text-amber-300" />;
    }
  };

  // Connected adjacent maps
  const connectedNeighbors = MAP_CONNECTIONS.filter(
    ([a, b]) => a === selectedMapId || b === selectedMapId
  ).map(([a, b]) => (a === selectedMapId ? b : a));

  const isLevelAdequate = playerLevel >= selectedMeta.levelRange[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-6xl h-[94vh] max-h-[820px] bg-slate-900 border border-slate-700/80 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950/90 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-sky-500/20 border border-sky-500/40 text-sky-400">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide uppercase">
                  {tr('World Map & Portal Graph')}
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {tr('30 Zones')}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {tr('Connected portal network. Standing in portal circle for 3s initiates transit.')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Region Filter Chips */}
            <div className="hidden md:flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
              {['ALL', T('Coastal'), T('Highland'), T('Steppe'), T('Neutral'), T('PvP'), T('Endgame')].map((r) => (
                <button
                  key={r}
                  onClick={() => setActiveRegionFilter(r)}
                  className={`px-2.5 py-1 rounded-md transition font-medium ${
                    activeRegionFilter === r
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {r === 'ALL' ? tr('All') : tr(r)}
                </button>
              ))}
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition"
              title={tr('Close Map (Esc / M)')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Node Graph Interactive Canvas View */}
          <div className="flex-1 relative bg-slate-950 overflow-auto border-b lg:border-b-0 lg:border-r border-slate-800">
            {/* Background Grid Pattern */}
            <div
              className="absolute inset-0 opacity-15 pointer-events-none"
              style={{
                backgroundImage:
                  'radial-gradient(circle, #38bdf8 1px, transparent 1px)',
                backgroundSize: '28px 28px',
              }}
            />

            <div className="relative min-w-[1200px] h-[520px] p-6 select-none">
              {/* SVG Edges connecting map nodes */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <defs>
                  <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity="0.6" />
                  </linearGradient>
                </defs>

                {MAP_CONNECTIONS.map(([a, b], idx) => {
                  const posA = NODE_POSITIONS[a];
                  const posB = NODE_POSITIONS[b];
                  if (!posA || !posB) return null;

                  const isConnectedToSelected = a === selectedMapId || b === selectedMapId;
                  const isCurrentHop = a === currentNumericId || b === currentNumericId;

                  return (
                    <line
                      key={`edge_${a}_${b}_${idx}`}
                      x1={posA.x}
                      y1={posA.y}
                      x2={posB.x}
                      y2={posB.y}
                      stroke={isConnectedToSelected ? '#38bdf8' : isCurrentHop ? '#10b981' : '#334155'}
                      strokeWidth={isConnectedToSelected ? 3.5 : isCurrentHop ? 2.5 : 1.5}
                      strokeDasharray={isConnectedToSelected ? '6 4' : 'none'}
                      strokeOpacity={isConnectedToSelected ? 0.95 : 0.65}
                    />
                  );
                })}
              </svg>

              {/* Map Nodes */}
              {Object.values(MAP_METADATA_TABLE).map((meta) => {
                const pos = NODE_POSITIONS[meta.id];
                if (!pos) return null;

                const isCurrent = meta.id === currentNumericId;
                const isSelected = meta.id === selectedMapId;
                const isHub = meta.type === 'HUB';
                const isHome = meta.type === 'HOME';
                const isPvP = meta.type === 'PVP';
                const isEndgame = meta.type === 'ENDGAME';
                const isArena = meta.type === 'ARENA';

                const biomeColor = getBiomeColor(meta.biome);

                return (
                  <button
                    data-quest-marker={questMapIds?.includes(meta.id) ? 'true' : undefined}
                    key={`node_${meta.id}`}
                    onClick={() => setSelectedMapId(meta.id)}
                    style={{ left: `${pos.x - 22}px`, top: `${pos.y - 22}px` }}
                    className={`absolute w-11 h-11 rounded-xl flex flex-col items-center justify-center transition-all duration-150 group z-10 ${
                      questMapIds?.includes(meta.id) && !isSelected && !isCurrent
                        ? 'ring-2 ring-yellow-300 animate-pulse'
                        : isSelected
                        ? 'ring-4 ring-sky-400 ring-offset-2 ring-offset-slate-950 scale-110 shadow-lg shadow-sky-500/30'
                        : isCurrent
                        ? 'ring-2 ring-emerald-400 scale-105 shadow-md shadow-emerald-500/20'
                        : 'hover:scale-105 hover:ring-2 hover:ring-slate-400'
                    }`}
                  >
                    {/* Node Background */}
                    <div
                      className="w-full h-full rounded-xl flex items-center justify-center border font-bold text-xs"
                      style={{
                        backgroundColor: isCurrent ? '#064e3b' : isSelected ? '#0f172a' : '#1e293b',
                        borderColor: isSelected ? '#38bdf8' : isCurrent ? '#10b981' : biomeColor,
                        color: isCurrent ? '#34d399' : '#f8fafc',
                      }}
                    >
                      {meta.id}
                    </div>

                    {/* Safe Zone Badge Icon */}
                    {(isHome || isHub) && (
                      <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow">
                        <Shield className="w-2.5 h-2.5" />
                      </div>
                    )}

                    {/* PvP Swords Badge */}
                    {isPvP && (
                      <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center shadow">
                        <Swords className="w-2.5 h-2.5" />
                      </div>
                    )}

                    {/* Arena Badge */}
                    {isArena && (
                      <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-pink-600 text-white flex items-center justify-center shadow">
                        <Mountain className="w-2.5 h-2.5" />
                      </div>
                    )}

                    {/* Current Player Beacon Pin */}
                    {isCurrent && (
                      <div className="absolute -top-4 text-emerald-400 animate-bounce">
                        <MapPin className="w-4 h-4 fill-emerald-400 text-emerald-950" />
                      </div>
                    )}

                    {/* Small Node Name Label */}
                    <div className="absolute -bottom-5 whitespace-nowrap text-[11px] font-semibold text-slate-300 drop-shadow-md pointer-events-none group-hover:text-white">
                      {nm(meta.nameKey, meta.name)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Map Inspection & Roam Panel */}
          <div className="w-full lg:w-80 shrink-0 bg-slate-900/95 flex flex-col p-4 overflow-y-auto border-t lg:border-t-0 border-slate-800">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">
                  {tr('Zone')} {selectedMeta.id} · {tr(selectedMeta.region)}
                </span>
                <h3 className="text-xl font-bold text-white tracking-tight mt-0.5">
                  {nm(selectedMeta.nameKey, selectedMeta.name)}
                </h3>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-md border border-slate-700">
                {getWeatherIcon(selectedMeta.weather)}
                <span className="text-xs text-slate-300 capitalize">
                  {selectedMeta.weather}
                </span>
              </div>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded border"
                style={{
                  backgroundColor: `${getBiomeColor(selectedMeta.biome)}22`,
                  borderColor: `${getBiomeColor(selectedMeta.biome)}66`,
                  color: getBiomeColor(selectedMeta.biome),
                }}
              >
                {selectedMeta.biome.toUpperCase()}
              </span>

              <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {tr('Level')} {selectedMeta.levelRange[0]}-{selectedMeta.levelRange[1]}
              </span>

              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                  selectedMeta.type === 'HOME'
                    ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                    : selectedMeta.type === 'HUB'
                    ? 'bg-sky-950/80 border-sky-500/50 text-sky-300'
                    : selectedMeta.type === 'PVP'
                    ? 'bg-red-950/80 border-red-500/50 text-red-300'
                    : selectedMeta.type === 'ENDGAME'
                    ? 'bg-purple-950/80 border-purple-500/50 text-purple-300'
                    : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                {tr(selectedMeta.type)}
              </span>
            </div>

            <p className="text-xs text-slate-400 mt-3 leading-relaxed">
              {nm(`${selectedMeta.nameKey}.desc`, selectedMeta.description)}
            </p>
            <EventCalendar />

            {/* Zone Telemetry */}
            <div className="mt-4 space-y-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">{tr('Atmosphere / Time:')}</span>
                <span className="text-slate-200 capitalize font-medium">
                  {selectedMeta.timeOfDay} · {selectedMeta.weather}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{tr('Safe Zone Protected:')}</span>
                <span className={selectedMeta.type === 'HOME' || selectedMeta.type === 'HUB' ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                  {selectedMeta.type === 'HOME' || selectedMeta.type === 'HUB' ? tr('Yes (Allied Base)') : tr('Portals Only (400u)')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{tr('Dimensions:')}</span>
                <span className="text-slate-200 font-mono">
                  {selectedMeta.width} × {selectedMeta.height} px
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{tr('Server Capacity:')}</span>
                <span className="text-slate-200">
                  {selectedMeta.instanceCapacity} {tr('drivers / inst')}
                </span>
              </div>
            </div>

            {/* Connected Portals */}
            <div className="mt-4">
              <span className="text-xs font-semibold text-slate-300 block mb-1.5">
                Connected Portals ({connectedNeighbors.length})
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {connectedNeighbors.map((nid) => {
                  const targetMeta = MAP_METADATA_TABLE[nid];
                  if (!targetMeta) return null;
                  return (
                    <button
                      key={`conn_${nid}`}
                      onClick={() => setSelectedMapId(nid)}
                      className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-left transition text-xs"
                    >
                      <div className="font-bold text-white flex items-center justify-between">
                        <span>{targetMeta.id}. {nm(targetMeta.nameKey, targetMeta.name)}</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                      </div>
                      <span className="text-[11px] text-slate-400">
                        Lv.{targetMeta.levelRange[0]}-{targetMeta.levelRange[1]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Travel / Roam Action */}
            <div className="mt-auto pt-4">
              {selectedMeta.id === currentNumericId ? (
                <div className="w-full py-2.5 px-3 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 text-center text-xs font-bold flex items-center justify-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {tr('Currently Here')}
                </div>
              ) : (
                <button
                  onClick={() => {
                    onTravelToMap(selectedMeta.id);
                    onClose();
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-sky-600/30"
                >
                  <Sparkles className="w-4 h-4" />
                  {tr('Roam to')} {nm(selectedMeta.nameKey, selectedMeta.name)}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
