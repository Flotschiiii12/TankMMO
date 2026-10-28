import React, { useMemo } from 'react';
import { SimEntity, Vec2 } from '../sim/types.ts';

interface RadarProps {
  player: SimEntity | null;
  entities: SimEntity[];
  mapWidth: number;
  mapHeight: number;
  partyNames?: string[];
  colorBlind?: boolean;
}

export const Radar: React.FC<RadarProps> = ({ player, entities, mapWidth, mapHeight, partyNames, colorBlind }) => {
  const radarRadius = 46;
  const radarRange = 1200 * (player?.radarMult ?? 1); // World units displayed on radar (recon drones widen it)

  const playerPos = player ? player.pos : { x: 2000, y: 2000 };
  const playerAngle = player ? player.chassisAngle : 0;

  // Sector ID calculation (e.g. A-1 to H-8 based on 500x500 grid)
  const sectorLabel = useMemo(() => {
    const colLetter = String.fromCharCode(65 + Math.min(7, Math.floor(playerPos.x / (mapWidth / 8))));
    const rowNum = 1 + Math.min(7, Math.floor(playerPos.y / (mapHeight / 8)));
    return `${colLetter}-${rowNum}`;
  }, [playerPos.x, playerPos.y, mapWidth, mapHeight]);

  const { enemyCount, allyCount, dots } = useMemo(() => {
    let enemies = 0;
    let allies = 0;
    const computedDots: Array<{ x: number; y: number; color: string; size: number }> = [];

    for (const ent of entities) {
      if (ent.id === player?.id || ent.kind === 'mine') continue;
      const dx = ent.pos.x - playerPos.x;
      const dy = ent.pos.y - playerPos.y;
      const dist = Math.hypot(dx, dy);

      if (ent.hull > 0) {
        if (ent.isHostile) enemies++;
        else if (ent.kind === 'npc_driver') allies++;
      }

      if (dist <= radarRange) {
        const ratio = dist / radarRange;
        const angle = Math.atan2(dy, dx);
        const r = ratio * (radarRadius - 4);
        const x = radarRadius + Math.cos(angle) * r;
        const y = radarRadius + Math.sin(angle) * r;

        let color = colorBlind ? '#f59e0b' : '#ef4444'; // Hostile (red, or amber for colour-blind mode)
        let size = 2.5;

        if (ent.kind === 'loot_crate') {
          color = '#ffffff'; // White loot
          size = 2;
        } else if (ent.kind === 'gate') {
          color = '#38bdf8'; // Cyan gate
          size = 3.5;
        } else if (ent.kind === 'boss') {
          color = '#f97316'; // Boss orange
          size = 4.5;
        } else if (!ent.isHostile) {
          color = partyNames?.includes(ent.name) ? '#22c55e' : '#60a5fa'; // party green, other players blue
          size = partyNames?.includes(ent.name) ? 3.5 : 2.5;
        }

        computedDots.push({ x, y, color, size });
      }
    }

    return { enemyCount: enemies, allyCount: allies, dots: computedDots };
  }, [entities, player?.id, playerPos.x, playerPos.y, partyNames, colorBlind]);

  return (
    <div className="relative flex flex-col items-center pointer-events-none select-none">
      {/* Radar Circular Scope */}
      <div
        className="relative rounded-full border border-orange-500/30 bg-slate-950/70 shadow-sm"
        style={{ width: radarRadius * 2, height: radarRadius * 2 }}
      >
        {/* Crosshair guidelines */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-full h-px bg-white/5" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-full w-px bg-white/5" />
        </div>

        {/* Outer thin ring */}
        <div className="absolute inset-1.5 rounded-full border border-white/10" />

        {/* Entities dots */}
        {dots.map((d, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left: d.x - d.size / 2,
              top: d.y - d.size / 2,
              width: d.size,
              height: d.size,
              backgroundColor: d.color,
            }}
          />
        ))}

        {/* Player central arrow */}
        <div
          className="absolute"
          style={{
            left: radarRadius - 5,
            top: radarRadius - 5,
            transform: `rotate(${playerAngle + Math.PI / 2}rad)`,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <polygon points="5,0 9,9 5,7 1,9" fill="#f97316" />
          </svg>
        </div>
      </div>

      {/* Sector and Hostile Counter readout */}
      <div className="flex items-center gap-2 mt-1 text-[11px] font-medium tracking-wide text-slate-400">
        <span className="text-orange-400 font-semibold">{sectorLabel}</span>
        <span>·</span>
        <span className="tabular-nums text-slate-300">
          <span className="text-red-400 font-medium">{enemyCount}</span> / <span className="text-blue-400">{allyCount}</span>
        </span>
      </div>
    </div>
  );
};
