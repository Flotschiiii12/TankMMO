import React, { useEffect } from 'react';
import { tr } from '../i18n.ts';
import type { OnlineGameClient } from '../net/onlineClient.ts';

const btn = 'px-3 py-2 rounded bg-slate-800/90 border border-slate-600 text-white text-xs active:bg-slate-700';

/** Controls while watching an arena match: follow a fighter, free camera (arrows / WASD), leave. */
export const SpectateBar: React.FC<{ client: OnlineGameClient; onLeave: () => void }> = ({ client, onLeave }) => {
  useEffect(() => {
    const keys = new Set<string>();
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's'].includes(k)) { client.spectateFree(); keys.add(k); }
      if (k === 'q') client.spectateCycle(-1);
      if (k === 'e') client.spectateCycle(1);
    };
    const up = (e: KeyboardEvent) => { keys.delete(e.key.toLowerCase()); };
    const timer = setInterval(() => {
      const dx = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
      const dy = (keys.has('arrowdown') || keys.has('s') ? 1 : 0) - (keys.has('arrowup') || keys.has('w') ? 1 : 0);
      if (dx || dy) client.moveFreeCam(dx * 30, dy * 30);
    }, 33);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { clearInterval(timer); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [client]);

  const hold = (dx: number, dy: number) => {
    let t: ReturnType<typeof setInterval> | undefined;
    const stop = () => { if (t) clearInterval(t); t = undefined; };
    return { onPointerDown: () => { client.spectateFree(); client.moveFreeCam(dx * 30, dy * 30); t = setInterval(() => client.moveFreeCam(dx * 30, dy * 30), 33); }, onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop };
  };

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 select-none" data-testid="spectate-bar">
      <span className="text-[11px] text-orange-300 mr-1">{tr('Spectating (stream is delayed)')}</span>
      <button className={btn} onClick={() => client.spectateCycle(-1)}>◀ {tr('Previous')}</button>
      <button className={btn} onClick={() => client.spectateCycle(1)}>{tr('Next')} ▶</button>
      <button className={btn} onClick={() => client.spectateFree()}>{tr('Free camera')}</button>
      <span className="flex gap-1">
        <button className={btn} {...hold(-1, 0)}>←</button><button className={btn} {...hold(0, -1)}>↑</button><button className={btn} {...hold(0, 1)}>↓</button><button className={btn} {...hold(1, 0)}>→</button>
      </span>
      <button className="px-3 py-2 rounded bg-rose-700/90 text-white text-xs" onClick={onLeave}>{tr('Leave')}</button>
    </div>
  );
};
