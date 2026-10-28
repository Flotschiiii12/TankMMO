import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FactionCrest } from './GameIcon.tsx';
import { tr, T, currentLang, setLang } from '../i18n.ts';
import { createGuest, clearCredential, detectServer, getCredential, recoverAccount, serverBase, setCredential } from '../net/connect.ts';
import { OnlineGameClient } from '../net/onlineClient.ts';
import { createDefaultProfile } from '../save/profile.ts';

type Phase = 'probing' | 'welcome' | 'recover' | 'connecting' | 'error' | 'offline';

const MESSAGES: Record<string, string> = {
  update_required: T('A new version of the game is available. Please reload the page / update the app.'),
  banned: T('This account is banned.'),
  logged_in_elsewhere: T('You signed in from another device.'),
};

/**
 * Online-only flow: detect the server, sign in (guest account with 13+ gate, or recovery code), connect, then hand the
 * connected client to the game. Without a server (local dev) the offline sandbox starts instead.
 */
export const OnlineGate: React.FC<{ children: (online: OnlineGameClient | null) => React.ReactNode }> = ({ children }) => {
  const [phase, setPhase] = useState<Phase>('probing');
  const [msg, setMsg] = useState('');
  const [age, setAge] = useState(false);
  const [faction, setFaction] = useState('coastal');
  const [code, setCode] = useState('');
  const [client, setClient] = useState<OnlineGameClient | null>(null);
  const [lost, setLost] = useState('');
  const started = useRef(false);

  const connect = useCallback(async (credential: string) => {
    setPhase('connecting');
    const c = new OnlineGameClient(serverBase(), credential, createDefaultProfile());
    try {
      await c.connect();
      c.onClose(() => setLost(tr(MESSAGES[c.closeReason] || (c.closeCode === 4409 ? MESSAGES.logged_in_elsewhere : T('Connection lost.')))));
      setClient(c);
    } catch (e: any) {
      const reason = String(e?.message || '');
      if (reason === 'bad_credentials' || reason === 'unknown' || reason === 'closed_4404') { clearCredential(); setPhase('welcome'); setMsg(tr('This device is no longer signed in. Start a new account or use your recovery code.')); return; }
      setMsg(tr(MESSAGES[reason] || T('Could not connect to the server.')));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      if (!(await detectServer())) { setPhase('offline'); return; }
      const cred = getCredential();
      if (cred) await connect(cred); else setPhase('welcome');
    })();
  }, [connect]);

  if (phase === 'offline') return <>{children(null)}</>;
  if (client && !lost) return <>{children(client)}</>;

  // m-auto on the card centres it but still lets a short landscape phone scroll to the bottom
  const box = 'fixed inset-0 z-[100] bg-slate-950 text-slate-200 flex overflow-y-auto p-4';
  const card = 'm-auto w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3';
  const btn = 'w-full py-2.5 rounded-lg text-sm font-semibold bg-orange-500 text-slate-950 disabled:bg-slate-800 disabled:text-slate-500';

  if (lost) {
    return (
      <div className={box}><div className={card}>
        <h2 className="text-lg font-bold text-white">{tr('Disconnected')}</h2>
        <p className="text-sm text-slate-400">{lost}</p>
        <button className={btn} onClick={() => window.location.reload()}>{tr('Reconnect')}</button>
      </div></div>
    );
  }
  if (phase === 'probing' || phase === 'connecting') return <div className={box}><div className="text-sm text-slate-400">{phase === 'probing' ? tr('Looking for the server…') : tr('Connecting…')}</div></div>;
  if (phase === 'error') {
    return (
      <div className={box}><div className={card}>
        <h2 className="text-lg font-bold text-white">{tr('No connection')}</h2>
        <p className="text-sm text-slate-400">{msg}</p>
        <button className={btn} onClick={() => { const c = getCredential(); if (c) void connect(c); else setPhase('welcome'); }}>{tr('Try again')}</button>
      </div></div>
    );
  }
  if (phase === 'recover') {
    return (
      <div className={box}><div className={card}>
        <h2 className="text-lg font-bold text-white">{tr('I already have an account')}</h2>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" className="w-full h-11 px-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-sm outline-none focus:border-orange-500" />
        {msg && <p className="text-xs text-rose-400">{msg}</p>}
        <button className={btn} disabled={code.trim().length < 20} onClick={async () => {
          const r = await recoverAccount(code);
          if (r.ok) { setCredential(r.credential); void connect(r.credential); } else setMsg(tr('That code is not valid.'));
        }}>{tr('Sign in')}</button>
        <button className="w-full text-xs text-slate-500" onClick={() => { setMsg(''); setPhase('welcome'); }}>{tr('Back')}</button>
      </div></div>
    );
  }
  return (
    <div className={box}><div className={card}>
      <h1 className="text-xl font-bold text-white tracking-tight">Treadfront</h1>
      <p className="text-sm text-slate-400">{tr('An online tank MMO. Your progress lives on the server.')}</p>
      <div className="text-xs text-slate-400">{tr('Choose your faction (your start region):')}</div>
      <div className="grid grid-cols-3 gap-1.5">
        {[['coastal', T('Coastal Union')], ['highland', T('Highland Union')], ['steppe', T('Steppe Caravan')]].map(([k, n]) => (
          <button key={k} onClick={() => setFaction(k)} className={`py-2 rounded-lg text-[11px] border flex flex-col items-center gap-1 ${faction === k ? 'border-orange-500 text-orange-300' : 'border-slate-800 text-slate-400'}`}><FactionCrest faction={k} size={44} />{tr(n)}</button>
        ))}
      </div>
      <label className="flex items-start gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} className="mt-0.5" />
        {tr('I am at least 13 years old.')}
      </label>
      {msg && <p className="text-xs text-orange-300">{msg}</p>}
      <button className={btn} disabled={!age} onClick={async () => {
        const r = await createGuest(faction);
        if (r.ok) { setCredential(r.credential); void connect(r.credential); } else setMsg(r.error === 'network' ? tr('Could not reach the server.') : tr('Could not create the account.'));
      }}>{tr('Play')}</button>
      <button className="w-full text-xs text-slate-500" onClick={() => setLang(currentLang === 'de' ? 'en' : 'de')}>{currentLang === 'de' ? 'English' : 'Deutsch'}</button>
      <button className="w-full text-xs text-slate-500 underline" onClick={() => { setMsg(''); setPhase('recover'); }}>{tr('I already have an account')}</button>
    </div></div>
  );
};
