import { useEffect, useState } from 'react';
import { serverBase } from '../../net/connect.ts';
import type { NewsItem } from '../../../server/news.ts';

export type { NewsItem };
export interface ServerInfo { state: 'loading' | 'online' | 'offline'; online?: number; protocol?: string; pingMs?: number; news: NewsItem[] }

/** One fetch each for status and news when the title screen opens, and a light status refresh while it stays open. */
export function useServerInfo(): ServerInfo {
  const [info, setInfo] = useState<ServerInfo>({ state: 'loading', news: [] });
  useEffect(() => {
    let alive = true;
    const status = async () => {
      const t0 = performance.now();
      try {
        const r = await fetch(`${serverBase()}/api/status`);
        if (!r.ok) throw new Error('status');
        const j: any = await r.json();
        if (alive) setInfo((p) => ({ ...p, state: 'online', online: Number(j.online) || 0, protocol: String(j.protocol ?? ''), pingMs: Math.round(performance.now() - t0) }));
      } catch { if (alive) setInfo((p) => ({ ...p, state: 'offline' })); }
    };
    void status();
    (async () => {
      try { const r = await fetch(`${serverBase()}/api/news`); const j: any = await r.json(); if (alive && Array.isArray(j.items)) setInfo((p) => ({ ...p, news: j.items })); } catch { /* the panel just stays empty */ }
    })();
    const timer = setInterval(status, 20_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  return info;
}
