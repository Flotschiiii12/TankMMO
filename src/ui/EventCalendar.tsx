import React from 'react';
import { tr, nm } from '../i18n.ts';
import { upcomingEvents } from '../../shared/sim/events.ts';
import { MAP_METADATA_TABLE } from '../../shared/data/maps.ts';

const fmtTime = (sec: number): string => new Date(sec * 1000).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
const fmtIn = (sec: number): string => { const m = Math.max(0, Math.round(sec / 60)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };

/** Next occurrences of every scheduled event with local start times and what each one gives (computed from the schedule). */
export const EventCalendar: React.FC<{ now?: number; limit?: number }> = ({ now = Date.now() / 1000, limit = 10 }) => {
  const list = upcomingEvents(now, 24 * 3600, limit);
  return (
    <details className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-xs" data-testid="event-calendar">
      <summary className="cursor-pointer font-semibold text-amber-300">{tr('Event calendar')}</summary>
      <div className="mt-2 space-y-1.5">
        {list.map((e) => {
          const running = e.startsAt <= now;
          const maps = e.mapIds?.map((id) => nm(MAP_METADATA_TABLE[id]?.nameKey, MAP_METADATA_TABLE[id]?.name ?? String(id))).join(', ') ?? tr('every map');
          return (
            <div key={`${e.kind}@${e.startsAt}`} className="rounded border border-slate-800 p-1.5">
              <div className="flex justify-between gap-2"><b className="text-slate-100">{nm(`event.${e.kind}.name`, e.kind.replace(/_/g, ' '))}</b><span className={running ? 'text-emerald-400' : 'text-slate-400'}>{running ? tr('running now') : `${fmtTime(e.startsAt)} · ${tr('starts in')} ${fmtIn(e.startsAt - now)}`}</span></div>
              <div className="text-[11px] text-slate-400">{tr('Maps')}: {maps}</div>
              <div className="text-[11px] text-slate-300">{nm(`event.${e.kind}.reward`, '')}</div>
            </div>
          );
        })}
      </div>
    </details>
  );
};
