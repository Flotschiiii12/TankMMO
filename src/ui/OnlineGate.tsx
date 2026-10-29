import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FactionCrest } from './GameIcon.tsx';
import { Button } from './kit/Button.tsx';
import { applyFactionTheme } from './kit/logic.ts';
import { ART, ArtSlot } from './kit/art.tsx';
import { Logo } from './title/Logo.tsx';
import { LoadingScreen } from './title/LoadingScreen.tsx';
import { NewsPanel } from './title/NewsPanel.tsx';
import { useServerInfo } from './title/useServerInfo.ts';
import { soundEngine } from '../audio/soundEngine.ts';
import { tr, T, currentLang, setLang } from '../i18n.ts';
import { createGuest, clearCredential, detectServer, getCredential, recoverAccount, serverBase, setCredential } from '../net/connect.ts';
import { OnlineGameClient } from '../net/onlineClient.ts';
import { MAX_AUTO_RECONNECT_ATTEMPTS, reconnectDelayMs } from '../net/reconnectPolicy.ts';
import { createDefaultProfile, LocalStorageProfileStore } from '../save/profile.ts';
import { getVehicleById, STARTER_VEHICLE_ID } from '../data/vehicles.ts';
import { HangarPreview } from './hangar/HangarPreview.tsx';
import { prefersReducedMotion } from './motion/motion.ts';
import { graphicsQualityFor, type GraphicsQuality } from './perfMonitor.ts';

type Phase = 'probing' | 'welcome' | 'recover' | 'connecting' | 'error' | 'offline';

const MESSAGES: Record<string, string> = {
  update_required: T('A new version of the game is available. Please reload the page / update the app.'),
  banned: T('This account is banned.'),
  logged_in_elsewhere: T('You signed in from another device.'),
  rate_limited: T('Too many attempts. Please wait a moment.'),
};
const TERMINAL_CONNECT_ERRORS = new Set([
  'bad_credentials', 'unknown', 'closed_4404', 'update_required', 'banned',
  'logged_in_elsewhere', 'closed_4403', 'rate_limited', 'closed_4429',
]);

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
  const [reconnectState, setReconnectState] = useState<'waiting' | 'connecting' | 'exhausted'>('waiting');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [reconnectMessage, setReconnectMessage] = useState('');
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const started = useRef(false);
  const activeClient = useRef<OnlineGameClient | null>(null);
  const info = useServerInfo();
  const [savedSettings] = useState(() => new LocalStorageProfileStore().load().settings);
  const graphicsQuality: GraphicsQuality = graphicsQualityFor(savedSettings);
  const reducedMotion = !!savedSettings.reduceMotion || prefersReducedMotion() || graphicsQuality === 'low' || graphicsQuality === 'off';
  useEffect(() => {
    document.documentElement.classList.toggle('low-graphics', graphicsQuality === 'low' || graphicsQuality === 'off');
    document.documentElement.classList.toggle('reduced-effects', graphicsQuality === 'low' || graphicsQuality === 'off');
    document.documentElement.classList.toggle('reduced-motion', !!savedSettings.reduceMotion || graphicsQuality === 'off');
  }, [graphicsQuality, savedSettings.reduceMotion]);
  useEffect(() => { if (!client) applyFactionTheme(faction); }, [faction, client]);

  const connect = useCallback(async (credential: string, automatic = false): Promise<'connected' | 'retry' | 'stop'> => {
    if (!automatic) setPhase('connecting');
    const c = new OnlineGameClient(serverBase(), credential, createDefaultProfile());
    activeClient.current = c;
    try {
      await c.connect();
      if (c.status !== 'online') throw new Error(c.closeReason || 'connection_failed');
      c.onClose(() => {
        if (activeClient.current !== c) return;
        activeClient.current = null;
        setLost(tr(MESSAGES[c.closeReason] || (c.closeCode === 4409 ? MESSAGES.logged_in_elsewhere : T('Connection lost. Trying to reconnect…'))));
        setReconnectState('waiting');
        setReconnectAttempt(0);
        setReconnectMessage('');
      });
      setClient(c);
      setLost('');
      setReconnectState('waiting');
      setReconnectAttempt(0);
      setReconnectMessage('');
      return 'connected';
    } catch (e: unknown) {
      const reason = e instanceof Error ? e.message : String(e || '');
      c.disconnect();
      if (activeClient.current === c) activeClient.current = null;
      if (automatic) {
        if (reason === 'bad_credentials' || reason === 'unknown' || reason === 'closed_4404') {
          clearCredential();
          setClient(null);
          setLost('');
          setPhase('welcome');
          setMsg(tr('This device is no longer signed in. Start a new account or use your recovery code.'));
          return 'stop';
        }
        if (TERMINAL_CONNECT_ERRORS.has(reason)) {
          setReconnectMessage(tr(MESSAGES[reason] || T('Could not reconnect automatically. Check your connection and try again.')));
          return 'stop';
        }
        return 'retry';
      }
      if (reason === 'bad_credentials' || reason === 'unknown' || reason === 'closed_4404') { clearCredential(); setPhase('welcome'); setMsg(tr('This device is no longer signed in. Start a new account or use your recovery code.')); return 'stop'; }
      setMsg(tr(MESSAGES[reason] || T('Could not connect to the server.')));
      setPhase('error');
      return 'stop';
    }
  }, []);

  useEffect(() => () => {
    activeClient.current?.disconnect();
    activeClient.current = null;
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

  useEffect(() => {
    if (!lost || !client) return;
    let cancelled = false;
    let stopped = false;
    let inFlight = false;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const clearRetry = () => {
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      retryTimer = undefined;
    };
    const attemptReconnect = async () => {
      if (cancelled || stopped || inFlight || attempts >= MAX_AUTO_RECONNECT_ATTEMPTS) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setReconnectState('waiting');
        return;
      }
      const savedCredential = getCredential();
      if (!savedCredential) {
        stopped = true;
        setReconnectMessage(tr('Reconnect needs your saved sign-in. Please sign in again.'));
        setReconnectState('exhausted');
        return;
      }
      inFlight = true;
      setReconnectAttempt(attempts + 1);
      setReconnectState('connecting');
      const result = await connect(savedCredential, true);
      inFlight = false;
      if (cancelled || result === 'connected') return;
      if (result === 'stop') {
        stopped = true;
        setReconnectState('exhausted');
        return;
      }
      attempts++;
      if (attempts >= MAX_AUTO_RECONNECT_ATTEMPTS) {
        stopped = true;
        setReconnectMessage(tr('Could not reconnect automatically. Check your connection and try again.'));
        setReconnectState('exhausted');
        return;
      }
      setReconnectState('waiting');
      retryTimer = setTimeout(() => { void attemptReconnect(); }, reconnectDelayMs(attempts));
    };
    const onOnline = () => {
      clearRetry();
      void attemptReconnect();
    };
    const onOffline = () => {
      clearRetry();
      setReconnectState('waiting');
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    if (typeof navigator === 'undefined' || navigator.onLine) {
      retryTimer = setTimeout(() => { void attemptReconnect(); }, reconnectDelayMs(0));
    }
    return () => {
      cancelled = true;
      clearRetry();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [lost, client, reconnectTrigger, connect]);

  if (phase === 'offline') return <>{children(null)}</>;
  if (client && !lost) return <>{children(client)}</>;

  const box = 'tt-screen';
  const ST = { coastal: T('Harbours, dunes and salt marshes: open ground to learn on.'), highland: T('Stone passes and cold ridges: terrain gives you cover.'), steppe: T('Wide grass plains and caravan roads: room to move.') } as Record<string, string>;
  const FACTIONS: Array<[string, string]> = [['coastal', T('Coastal Union')], ['highland', T('Highland Union')], ['steppe', T('Steppe Caravan')]];

  if (lost) {
    const networkOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const status = reconnectState === 'connecting'
      ? tr('Reconnecting…')
      : reconnectMessage || (networkOffline
        ? tr('Waiting for a network connection…')
        : reconnectAttempt
          ? tr('Reconnect attempt {attempt} of {max} failed. Trying again automatically…', { attempt: reconnectAttempt, max: MAX_AUTO_RECONNECT_ATTEMPTS })
          : tr('Reconnecting automatically…'));
    return (
      <div className={box}><div className="tt-wrap" style={{ gridTemplateColumns: 'minmax(0,1fr)', maxWidth: 380 }}><div className="tt-card">
        <h2>{tr('Disconnected')}</h2>
        <p className="tt-muted tt-critical-message">{lost}</p>
        <p className="tt-muted tt-critical-message" role="status" data-testid="reconnect-status">{status}</p>
        {reconnectState !== 'connecting' && <Button variant="primary" large onClick={() => {
          setReconnectMessage('');
          setReconnectAttempt(0);
          setReconnectState('waiting');
          setReconnectTrigger((current) => current + 1);
        }}>{tr('Try again')}</Button>}
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
    <div className={`${box} tt-screen--welcome`} data-testid="title-screen" data-faction={faction}>
      <ArtSlot src={ART.titleBg(faction)} className="k-bgart" />
      <div className="tt-screen__scenery" aria-hidden>{['coastal', 'highland', 'steppe'].map((scene) => <div key={scene} className={`tt-screen__scene tt-screen__scene--${scene}${faction === scene ? ' is-active' : ''}`} />)}</div>
      <div className="tt-wrap" style={{ position: 'relative' }}>
      <div className="tt-col">
        <Logo tagline={tr('An online tank MMO. Your progress lives on the server.')} />
        <div className="tt-hero" data-testid="title-hero" aria-hidden>
          <HangarPreview vehicle={getVehicleById(STARTER_VEHICLE_ID)} level={1} reduceMotion={reducedMotion} effects={!reducedMotion && (graphicsQuality === 'high' || graphicsQuality === 'medium')} />
        </div>
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
          <p className="tt-factiontext">{tr(ST[faction])}<br />{tr('Your faction determines your start region and appearance, not your combat stats.')}</p>
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
