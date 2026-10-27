const CRED_KEY = 'treadfront_credential';

export const serverBase = (): string => (typeof window !== 'undefined' ? window.location.origin : '');

/** The game is online-only when a server answers; without one (local dev, previews) it falls back to the offline sandbox. */
export async function detectServer(): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(`${serverBase()}/api/time`, { signal: ctl.signal });
    clearTimeout(t);
    return r.ok && ((await r.json()) as any).now > 0;
  } catch { return false; }
}

export const getCredential = (): string | null => { try { return localStorage.getItem(CRED_KEY); } catch { return null; } };
export const setCredential = (c: string): void => { try { localStorage.setItem(CRED_KEY, c); } catch { /* private mode */ } };
export const clearCredential = (): void => { try { localStorage.removeItem(CRED_KEY); } catch { /* ignore */ } };

export async function createGuest(): Promise<{ ok: true; credential: string; name: string } | { ok: false; error: string }> {
  try {
    const r = await fetch(`${serverBase()}/api/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ageConfirmed: true }) });
    const j: any = await r.json();
    return r.ok ? { ok: true, credential: j.credential, name: j.name } : { ok: false, error: j.error || 'failed' };
  } catch { return { ok: false, error: 'network' }; }
}

export async function recoverAccount(code: string): Promise<{ ok: true; credential: string } | { ok: false; error: string }> {
  try {
    const r = await fetch(`${serverBase()}/api/recover`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
    const j: any = await r.json();
    return r.ok ? { ok: true, credential: j.credential } : { ok: false, error: j.error || 'failed' };
  } catch { return { ok: false, error: 'network' }; }
}

export async function requestRecoveryCode(credential: string): Promise<string | null> {
  try {
    const r = await fetch(`${serverBase()}/api/recovery-code`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential }) });
    return r.ok ? ((await r.json()) as any).code : null;
  } catch { return null; }
}
