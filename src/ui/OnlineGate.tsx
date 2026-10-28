import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FactionCrest } from './GameIcon.tsx';
import { Button } from './kit/Button.tsx';
import { applyFactionTheme } from './kit/logic.ts';
import { Logo } from './title/Logo.tsx';
import { LoadingScreen } from './title/LoadingScreen.tsx';
import { NewsPanel } from './title/NewsPanel.tsx';
import { useServerInfo } from './title/useServerInfo.ts';
import { soundEngine } from '../audio/soundEngine.ts';
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
  const info = useServerInfo();
  useEffect(() => { if (!client) applyFactionTheme(faction); }, [faction, client]);

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

  const box = 'tt-screen';
  const ST = { coastal: T('Harbours, dunes and salt marshes: open ground to learn on.'), highland: T('Stone passes and cold ridges: terrain gives you cover.'), steppe: T('Wide grass plains and caravan roads: room to move.') } as Record<string, string>;
  const FACTIONS: Array<[string, string]> = [['coastal', T('Coastal Union')], ['highland', T('Highland Union')], ['steppe', T('Steppe Caravan')]];

  if (lost) {
    return (
      <div className={box}><div className="tt-wrap" style={{ gridTemplateColumns: 'minmax(0,1fr)', maxWidth: 380 }}><div className="tt-card">
        <h2>{tr('Disconnected')}</h2>
        <p className="tt-muted">{lost}</p>
        <Button variant="primary" large onClick={() => window.location.reload()}>{tr('Reconnect')}</Button>
      </div></div></div>
    );
  }
  if (phase === 'probing' || phase === 'connecting') return <LoadingScreen stage={phase === 'probing' ? 'server' : 'connect'} />;
  if (phase === 'error') {
    return (
      <div className={box}><div className="tt-wrap" style={{ gridTemplateColumns: 'minmax(0,1fr)', maxWidth: 380 }}><div className="tt-card">
        <Logo size="sm" />
        <h2>{tr('No connection')}</h2>
        <p className="tt-muted">{msg}</p>
        <Button variant="primary" large onClick={() => { const c = getCredential(); if (c) void connect(c); else setPhase('welcome'); }}>{tr('Try again')}</Button>
      </div></div></div>
    );
  }
  const langRow = (
    <div className="tt-topbar">
      <span className="tt-status" data-testid="server-status" role="status">
        <span className={`tt-dot tt-dot--${info.state}`} aria-hidden />
        {info.state === 'online' ? `${tr('Server online')} · ${tr('{n} players', { n: info.online ?? 0 })} · ${info.pingMs} ms` : info.state === 'offline' ? tr('Server not reachable') : tr('Checking server…')}
      </span>
      <Button variant="ghost" onClick={() => setLang(currentLang === 'de' ? 'en' : 'de')} label={currentLang === 'de' ? 'Switch to English' : 'Auf Deutsch umstellen'}>{currentLang === 'de' ? 'English' : 'Deutsch'}</Button>
    </div>
  );
  if (phase === 'recover') {
    return (
      <div className={box}><div className="tt-wrap" style={{ gridTemplateColumns: 'minmax(0,1fr)', maxWidth: 420 }}>
        {langRow}
        <div className="tt-card">
          <Logo size="sm" />
          <h2>{tr('I already have an account')}</h2>
          <p className="tt-muted">{tr('Enter the 20-character recovery code from your old device (Settings, Account).')}</p>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" aria-label={tr('Recovery code')} autoCapitalize="characters" autoComplete="off" spellCheck={false} className="tt-input" />
          {msg && <p className="tt-error" role="alert">{msg}</p>}
          <Button variant="primary" large disabled={code.trim().length < 20} onClick={async () => {
            const r = await recoverAccount(code);
            if (r.ok) { soundEngine.init(); setCredential(r.credential); void connect(r.credential); } else setMsg(tr('That code is not valid.'));
          }}>{tr('Sign in')}</Button>
          <Button variant="ghost" onClick={() => { setMsg(''); setPhase('welcome'); }}>{tr('Back')}</Button>
        </div>
      </div></div>
    );
  }
  return (
    <div className={box} data-testid="title-screen"><div className="tt-wrap">
      <div className="tt-col">
        <Logo tagline={tr('An online tank MMO. Your progress lives on the server.')} />
        <NewsPanel items={info.news} />
      </div>
      <div className="tt-col">
        {langRow}
        <div className="tt-card">
          <h2>{tr('Choose your faction (your start region):')}</h2>
          <div className="tt-factions" role="radiogroup" aria-label={tr('Faction')}>
            {FACTIONS.map(([k, n]) => (
              <button key={k} type="button" role="radio" aria-checked={faction === k} onClick={() => setFaction(k)} className="tt-faction">
                <FactionCrest faction={k} size={36} />{tr(n)}
              </button>
            ))}
          </div>
          <p className="tt-factiontext">{tr(ST[faction])}</p>
          <label className="tt-check">
            <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} />
            {tr('I am at least 13 years old.')}
          </label>
          {msg && <p className="tt-error" role="alert">{msg}</p>}
          <Button variant="primary" large disabled={!age} onClick={async () => {
            soundEngine.init();
            const r = await createGuest(faction);
            if (r.ok) { setCredential(r.credential); void connect(r.credential); } else setMsg(r.error === 'network' ? tr('Could not reach the server.') : tr('Could not create the account.'));
          }}>{tr('Play')}</Button>
          <p className="tt-muted">{tr('No sign-up needed: a guest account is created on this device. You can save a recovery code later.')}</p>
          <Button variant="ghost" onClick={() => { setMsg(''); setPhase('recover'); }}>{tr('I already have an account')}</Button>
        </div>
      </div>
    </div></div>
  );
};
