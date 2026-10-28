import React from 'react';

interface DebugPanelProps {
  fps: number;
  drawMs?: number;
  drawWorstMs?: number;
  tickTime: number;
  entityCount: number;
  tickRate: number;
  playerPos?: { x: number; y: number };
}

export const DebugPanel: React.FC<DebugPanelProps> = ({
  fps,
  drawMs,
  drawWorstMs,
  tickTime,
  entityCount,
  tickRate,
  playerPos,
}) => {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none select-none z-50">
      <div className="flex items-center gap-3 px-3 py-1 rounded bg-slate-950/80 border border-slate-800 text-[10px] font-mono tabular-nums text-slate-300">
        <div>
          FPS: <span className={fps < 45 ? 'text-amber-400' : 'text-emerald-400'}>{fps}</span>
        </div>
        <span>·</span>
        <div>
          Draw: <span className={(drawMs ?? 0) > 12 ? 'text-amber-400' : 'text-emerald-400'}>{drawMs ?? 0}ms</span> <span className="text-slate-500">(max {drawWorstMs ?? 0})</span>
        </div>
        <span>·</span>
        <div>
          Tick/Ping: <span className="text-white">{tickTime}ms</span>
        </div>
        <span>·</span>
        <div>
          Sim: <span className="text-orange-400">{tickRate} Hz</span>
        </div>
        <span>·</span>
        <div>
          Entities: <span className="text-white">{entityCount}</span>
        </div>
        {playerPos && (
          <>
            <span>·</span>
            <div>
              Pos: <span className="text-slate-400">{Math.round(playerPos.x)}, {Math.round(playerPos.y)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
