import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AccountRepo } from './db.ts';

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

const NAME_RE = /^[A-Za-z0-9_\-]{3,16}$/;
const BANNED_WORDS = ['fuck', 'shit', 'nazi', 'hitler', 'admin', 'moderator'];
export function validName(name: string): { ok: true } | { ok: false; error: string } {
  if (!NAME_RE.test(name)) return { ok: false, error: 'invalid_name' };
  const low = name.toLowerCase();
  if (BANNED_WORDS.some((w) => low.includes(w))) return { ok: false, error: 'name_not_allowed' };
  return { ok: true };
}

export interface Credential { accountId: string; secret: string; credential: string; name: string }

/** Guest accounts: credential "<accountId>.<secret>"; only sha256(secret) is stored. */
export class AccountService {
  constructor(private accounts: AccountRepo, private now: () => number = () => Date.now()) {}

  createGuest(ageConfirmed: boolean, startFaction = 'coastal'): { ok: true; cred: Credential } | { ok: false; error: string } {
    if (!ageConfirmed) return { ok: false, error: 'age_gate' };
    for (let attempt = 0; attempt < 20; attempt++) {
      const id = randomBytes(9).toString('hex');
      const name = `Driver-${String(this.accounts.count() + 1 + attempt).padStart(7, '0')}`;
      const secret = randomBytes(24).toString('hex');
      try {
        this.accounts.create({ id, name, secretHash: sha256(secret), createdAt: this.now(), startFaction });
        return { ok: true, cred: { accountId: id, secret, credential: `${id}.${secret}`, name } };
      } catch { /* name collision: retry */ }
    }
    return { ok: false, error: 'try_again' };
  }

  verify(accountId: string, secret: string): { ok: true; account: NonNullable<ReturnType<AccountRepo['get']>> } | { ok: false; error: string } {
    const a = this.accounts.get(accountId);
    if (!a || !safeEqualHex(a.secretHash, sha256(secret))) return { ok: false, error: 'bad_credentials' };
    if (a.bannedUntil > this.now()) return { ok: false, error: 'banned' };
    return { ok: true, account: a };
  }

  /** Shown to the player once; only the hash is stored. A new code invalidates the old one. */
  createRecoveryCode(accountId: string): string {
    const raw = randomBytes(10).toString('hex').toUpperCase();
    const code = raw.match(/.{1,4}/g)!.join('-');
    this.accounts.setRecoveryHash(accountId, sha256(code.replace(/-/g, '')));
    return code;
  }

  /** Sign in on a new device: rotates the secret (old devices are signed out) and returns the new credential. */
  signInWithRecovery(code: string): { ok: true; cred: Credential } | { ok: false; error: string } {
    const a = this.accounts.getByRecoveryHash(sha256(code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')));
    if (!a) return { ok: false, error: 'bad_code' };
    if (a.bannedUntil > this.now()) return { ok: false, error: 'banned' };
    const secret = randomBytes(24).toString('hex');
    this.accounts.setSecretHash(a.id, sha256(secret));
    return { ok: true, cred: { accountId: a.id, secret, credential: `${a.id}.${secret}`, name: a.name } };
  }

  rename(accountId: string, name: string): { ok: true } | { ok: false; error: string } {
    const v = validName(name);
    if (!v.ok) return v;
    const taken = this.accounts.getByName(name);
    if (taken && taken.id !== accountId) return { ok: false, error: 'name_taken' };
    this.accounts.setName(accountId, name);
    return { ok: true };
  }
}
