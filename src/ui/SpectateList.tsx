import React, { useCallback, useEffect, useState } from 'react';
import { tr } from '../i18n.ts';
import type { OnlineGameClient } from '../net/onlineClient.ts';
import { errorText } from '../game/actions.ts';

const btn = 'px-2 py-1 rounded bg-orange-600/80 text-white text-xs';
const row = 'flex items-center justify-between p-2 rounded border border-slate-800 bg-slate-950/40 text-xs';

/** Running arena matches in the arena tab; "Watch" starts the delayed spectator stream. */
export const SpectateList: React.FC<{ client: OnlineGameClient; onWatch: () => void }> = ({ client, onWatch }) => {
  const [matches, setMatches] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => { const r = await client.social({ op: 'spectate_list' }); if (r.ok) setMatches(r.data ?? []); }, [client]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 4000); return () => clearInterval(t); }, [load]);
  const watch = async (id: string) => { const r = await client.social({ op: 'spectate_join', matchId: id }); if (r.ok) onWatch(); else setMsg(errorText(r.error || 'failed')); };
  return (
    <div className="space-y-1.5 border-t border-slate-800 pt-2">
      <div className="text-xs text-slate-300">{tr('Running matches')} {msg && <span className="text-rose-300 ml-2">{msg}</span>}</div>
      {matches.length === 0 && <div className="text-xs text-slate-500">{tr('No match is running right now.')}</div>}
      {matches.map((m) => (
        <div key={m.id} className={row}>
          <span>
            <b className="text-white">{m.mode}</b> <span className="capitalize text-slate-400">{m.league}</span> · {tr('Round')} {m.round} · <b className="text-orange-300">{m.wins.join(' : ')}</b>
            <span className="text-slate-500"> · {m.teams.map((t: any[]) => t.map((p) => p.name).join(', ')).join(' vs ')} · {m.spectators}/{m.capacity} {tr('watching')}</span>
          </span>
          <button className={btn} onClick={() => watch(m.id)}>{tr('Watch')}</button>
        </div>
      ))}
    </div>
  );
};
