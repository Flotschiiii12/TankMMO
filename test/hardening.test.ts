import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp } from '../server/app.ts';
import { FailureBackoff, clientIp } from '../server/throttle.ts';
import { checkShot, movementBound, teleportCorrection } from '../server/plausibility.ts';
import { PROTOCOL_VERSION } from '../shared/protocol.ts';
import { allowedAbilities } from '../shared/rules/abilities.ts';
import * as C from '../shared/rules/character.ts';
import { SimRNG } from '../shared/prng.ts';

process.env.LOAD_TEST = '1';
let ctx: ReturnType<typeof createApp>;
let port: number;
beforeEach(async () => { ctx = createApp({ adminToken: 'x' }); port = await ctx.game.listen(0); });
afterEach(async () => { await ctx.game.close(); });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function guest() {
  return (await (await fetch(`http://127.0.0.1:${port}/api/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ageConfirmed: true }) })).json()) as any;
}
class P {
  ws!: WebSocket; msgs: any[] = []; n = 0; id = ''; name = ''; seq = 0; closeCode?: number; cred = '';
  static async make(g?: any): Promise<P> {
    g ??= await guest();
    const p = new P(); p.id = g.accountId; p.name = g.name; p.cred = g.credential;
    await p.connect();
    return p;
  }
  async connect(waitForCharacter = true) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ws.on('message', (d) => this.msgs.push(JSON.parse(d.toString())));
    this.ws.on('close', (c) => { this.closeCode = c; });
    await new Promise<void>((r) => this.ws.on('open', () => r()));
    const [a, s] = this.cred.split('.');
    this.ws.send(JSON.stringify({ type: 'c_join', protocolVersion: PROTOCOL_VERSION, accountId: a, secret: s }));
    if (waitForCharacter) await this.until(() => this.msgs.some((m) => m.type === 's_character'));
  }
  async until(f: () => boolean, ms = 3000) { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout'); ctx.game.stepAll(); await wait(3); } }
  async req(req: any): Promise<any> {
    const id = ++this.n; this.ws.send(JSON.stringify({ type: 'c_social', id, req }));
    await this.until(() => this.msgs.some((m) => m.type === 's_social_result' && m.id === id));
    return this.msgs.find((m) => m.type === 's_social_result' && m.id === id);
  }
  cmd(...commands: any[]) { this.ws.send(JSON.stringify({ type: 'c_input', seq: ++this.seq, commands, clientTime: 0 })); }
  get st() { return ctx.game.getSessionState(this.id)!; }
}

describe('ability gating', () => {
  it('abilities come from the vehicle class and equipped modules; others are ignored', async () => {
    const p = await P.make();
    const ent = p.st.entity;
    expect([...allowedAbilities(p.st.character)].sort()).toEqual(['boost', 'overcharge', 'repair_kit', 'smoke']); // starter is a medium
    p.cmd({ type: 'UseAbility', abilityId: 'emergency_shield' }, { type: 'UseAbility', abilityId: 'fortify' }, { type: 'UseAbility', abilityId: '__proto__' });
    await wait(30); for (let i = 0; i < 5; i++) ctx.game.stepAll();
    expect(ent.statusEffects.some((s) => s.type === 'invulnerable' || s.type === 'fortified')).toBe(false); // was exploitable: 2 s invulnerability every 45 s for everyone
    expect(ent.abilityCooldowns.emergency_shield).toBeUndefined();
    p.cmd({ type: 'UseAbility', abilityId: 'smoke' });
    await wait(30); for (let i = 0; i < 5; i++) ctx.game.stepAll();
    expect(ent.statusEffects.some((s) => s.type === 'smoked')).toBe(true);

    // equipping the module grants the ability
    const ch = p.st.character; ch.level = 60;
    const made = C.createItem(ch, 'mod_emergency_shield', 'Common', new SimRNG(1));
    expect(made.ok).toBe(true);
    if (made.ok) {
      const slot = C.slotKeysFor(ch.activeVehicle).find((s) => s.type === 'module')!;
      expect(C.equipItem(ch, ch.activeVehicle, slot.key, made.item.uid).ok).toBe(true);
    }
    expect(allowedAbilities(ch).has('emergency_shield')).toBe(true);
    p.cmd({ type: 'UseAbility', abilityId: 'emergency_shield' });
    await wait(30); for (let i = 0; i < 5; i++) ctx.game.stepAll();
    expect(ent.statusEffects.some((s) => s.type === 'invulnerable')).toBe(true);
    p.ws.close();
  });

  it('special ammo cannot be selected without stock', async () => {
    const p = await P.make();
    const ent = p.st.entity;
    ent.ammoInventory.EXPLOSIVE = 0; ent.selectedAmmo = 'STANDARD';
    p.cmd({ type: 'SelectAmmo', ammo: 'EXPLOSIVE' });
    await wait(30); for (let i = 0; i < 5; i++) ctx.game.stepAll();
    expect(ent.selectedAmmo).toBe('STANDARD');
    ent.ammoInventory.EXPLOSIVE = 5;
    p.cmd({ type: 'SelectAmmo', ammo: 'EXPLOSIVE' });
    await wait(30); for (let i = 0; i < 5; i++) ctx.game.stepAll();
    expect(ent.selectedAmmo).toBe('EXPLOSIVE');
    p.ws.close();
  });
});

describe('trade distance rule', () => {
  it('needs both players in a safe zone or close together; re-checked when confirming', async () => {
    const a = await P.make(); const b = await P.make();
    ctx.social.requestFriend(a.id, b.id); ctx.social.acceptFriend(b.id, a.id);
    expect((await a.req({ op: 'trade_open', name: b.name })).ok).toBe(true); // both spawn in the safe zone
    await a.req({ op: 'trade_cancel' });
    // b drives far out of the safe zone
    const world = ctx.game.getWorld(b.id)!; world.safeZones = [];
    const ea = a.st.entity; const eb = b.st.entity;
    eb.pos = { x: ea.pos.x + 1500, y: ea.pos.y }; ctx.game.forgetPositions();
    expect((await a.req({ op: 'trade_open', name: b.name })).error).toBe('too_far'); // was allowed from anywhere
    eb.pos = { x: ea.pos.x + 300, y: ea.pos.y }; ctx.game.forgetPositions();
    expect((await a.req({ op: 'trade_open', name: b.name })).ok).toBe(true); // close together is fine
    expect((await a.req({ op: 'trade_set', items: [], scrap: 0 })).ok).toBe(true);
    eb.pos = { x: ea.pos.x + 1500, y: ea.pos.y }; ctx.game.forgetPositions(); // walks away before the second confirmation
    await a.req({ op: 'trade_confirm' });
    const res = await b.req({ op: 'trade_confirm' });
    expect(res.error).toBe('too_far');
    a.ws.close(); b.ws.close();
  });
});

describe('failed-login throttling', () => {
  it('backs off exponentially after a free allowance and never blocks accounts that already logged in from the IP', async () => {
    const known = await P.make(); // logged in successfully from 127.0.0.1 before the attack
    const fresh = await guest();
    const now = Date.now();
    for (let i = 0; i < 20; i++) expect(ctx.game.joinThrottle.fail('127.0.0.1', now)).toBe(0); // free: typos behind a shared NAT
    expect(ctx.game.joinThrottle.fail('127.0.0.1', now)).toBe(1000);
    expect(ctx.game.joinThrottle.fail('127.0.0.1', now)).toBe(2000);
    expect(ctx.game.joinThrottle.fail('127.0.0.1', now)).toBe(4000);

    const blocked = await P.make(fresh).catch((e) => e);
    expect(String(blocked)).toMatch(/timeout/); // never got a character
    // the throttled socket was closed with 4429
    const raw = new WebSocket(`ws://127.0.0.1:${port}/ws`); const codes: number[] = [];
    raw.on('close', (c) => codes.push(c));
    await new Promise<void>((r) => raw.on('open', () => r()));
    const [a, s] = fresh.credential.split('.');
    raw.send(JSON.stringify({ type: 'c_join', protocolVersion: PROTOCOL_VERSION, accountId: a, secret: s }));
    await wait(100);
    expect(codes).toEqual([4429]);

    // the known player can still reconnect during the block
    known.ws.close(); await wait(50);
    const again = new P(); again.id = known.id; again.name = known.name; again.cred = known.cred;
    await again.connect();
    expect(again.msgs.some((m) => m.type === 's_character')).toBe(true);
    again.ws.close();
  }, 20_000);

  it('FailureBackoff: doubles, caps, decays, and keys are independent', () => {
    const b = new FailureBackoff({ free: 2, baseMs: 100, maxMs: 1000, decayMs: 5000 });
    expect([1, 2, 3, 4, 5, 6, 7].map(() => b.fail('ip', 0))).toEqual([0, 0, 100, 200, 400, 800, 1000]);
    expect(b.blockedFor('ip', 500)).toBe(500);
    expect(b.blockedFor('other', 0)).toBe(0);
    expect(b.blockedFor('ip', 6000)).toBe(0); // idle long enough: forgiven
    expect(b.fail('ip', 6000)).toBe(0);
  });

  it('clientIp only trusts X-Forwarded-For hops it was told about', () => {
    const req: any = { headers: { 'x-forwarded-for': '6.6.6.6, 1.2.3.4' }, socket: { remoteAddress: '10.0.0.1' } };
    delete process.env.TRUST_PROXY;
    expect(clientIp(req)).toBe('10.0.0.1');
    process.env.TRUST_PROXY = '1';
    expect(clientIp(req)).toBe('1.2.3.4'); // the proxy appended the real address; the forged left entry is ignored
    delete process.env.TRUST_PROXY;
  });
});

describe('instance failure isolation', () => {
  it('a throwing instance is logged, quarantined after repeated failures, and its players move to a fresh instance', async () => {
    const a = await P.make(); const b = await P.make();
    const before = a.st.instanceId;
    const broken = new Set([before]);
    ctx.game.testFault = (inst) => { if (broken.has(inst.id)) throw new Error('boom'); };
    expect(() => { for (let i = 0; i < 6; i++) ctx.game.stepAll(); }).not.toThrow(); // used to propagate out of the tick loop
    expect(ctx.game.quarantined).toContain(before);
    expect(a.st.instanceId).not.toBe(before);
    expect(b.st.instanceId).toBe(a.st.instanceId); // both landed together in the replacement
    await a.until(() => a.msgs.some((m) => m.type === 's_error' && m.code === 'instance_recovered'));
    // the new instance simulates normally and the player keeps the character
    const pos0 = { ...a.st.entity.pos };
    a.cmd({ type: 'Drive', x: 1, y: 0 });
    await wait(40); for (let i = 0; i < 30; i++) ctx.game.stepAll();
    expect(a.st.entity.pos.x).toBeGreaterThan(pos0.x);
    a.ws.close(); b.ws.close();
  });
});

describe('plausibility checks', () => {
  it('pure helpers: teleports and impossible shots are recognised, normal motion is not', () => {
    const ent: any = { pos: { x: 100, y: 100 }, maxSpeed: 200, radius: 30, mainReloadTime: 2, mainRange: 700 };
    expect(teleportCorrection(ent, { x: 90, y: 100 })).toBeUndefined();
    expect(teleportCorrection({ ...ent, pos: { x: 100 + movementBound(ent) + 1, y: 100 } }, { x: 100, y: 100 })).toEqual({ x: 100, y: 100 });
    expect(teleportCorrection(ent, undefined)).toBeUndefined();
    const ev: any = { type: 'projectile_fired', shooterId: 1, pos: { x: 100, y: 100 }, angle: 0, speed: 900, range: 700, ammoType: 'STANDARD', isSecondary: false };
    expect(checkShot(ev, ent, -Infinity, 10).ok).toBe(true);
    expect(checkShot(ev, ent, 9.5, 10)).toMatchObject({ ok: false, reason: 'rate' });
    expect(checkShot({ ...ev, pos: { x: 900, y: 100 } }, ent, -Infinity, 10)).toMatchObject({ ok: false, reason: 'origin' });
    expect(checkShot({ ...ev, range: 5000 }, ent, -Infinity, 10)).toMatchObject({ ok: false, reason: 'range' });
    expect(checkShot(ev, undefined, -Infinity, 10)).toMatchObject({ ok: false, reason: 'no_shooter' });
  });

  it('a vehicle moved outside the rules is put back instead of being accepted', async () => {
    const p = await P.make();
    for (let i = 0; i < 3; i++) ctx.game.stepAll();
    const e = p.st.entity; const home = { ...e.pos };
    e.pos = { x: home.x + 3000, y: home.y + 3000 }; // what a memory edit / sim bug would do
    ctx.game.stepAll();
    expect(Math.hypot(e.pos.x - home.x, e.pos.y - home.y)).toBeLessThan(200);
    expect(ctx.game.plausibility.moveCorrections).toBe(1);
    p.ws.close();
  });

  it('a gun firing faster than its reload is dropped; honest fire is untouched', async () => {
    const p = await P.make();
    const e = p.st.entity;
    e.invulnerableTime = 0; ctx.game.getWorld(p.id)!.safeZones = []; // firing is not allowed inside a safe zone
    const live = () => [...ctx.game.getWorld(p.id)!.entities.values()].filter((x) => x.kind === 'projectile' && (x as any).sourceEntityId === e.id).length;
    // cheat: reload reset every tick (memory edit) -> a shell every tick
    for (let i = 0; i < 20; i++) { e.mainReloadRemaining = 0; p.cmd({ type: 'FireMain' }); await wait(5); ctx.game.stepAll(); }
    expect(ctx.game.plausibility.shotsDropped).toBeGreaterThan(5);
    expect(live()).toBeLessThanOrEqual(4);
    // honest: respect the reload
    const dropped = ctx.game.plausibility.shotsDropped;
    for (let i = 0; i < Math.ceil(e.mainReloadTime * 30 * 4); i++) { if (i % Math.ceil(e.mainReloadTime * 30 + 1) === 0) p.cmd({ type: 'FireMain' }); await wait(2); ctx.game.stepAll(); }
    expect(ctx.game.plausibility.shotsDropped).toBe(dropped);
    p.ws.close();
  });

  it('hostile Drive/FireMain streams cannot exceed top speed or the reload rate', async () => {
    const p = await P.make();
    const e = p.st.entity;
    ctx.game.getWorld(p.id)!.safeZones = [];
    for (let i = 0; i < 5; i++) ctx.game.stepAll();
    let last = { ...e.pos }; let worst = 0; let shots = 0;
    for (let i = 0; i < 90; i++) {
      p.cmd({ type: 'Drive', x: 1e9, y: -1e9 }, { type: 'FireMain' }, { type: 'FireMain' }, { type: 'ToggleAutoFire' });
      await wait(3); ctx.game.stepAll();
      worst = Math.max(worst, Math.hypot(e.pos.x - last.x, e.pos.y - last.y)); last = { ...e.pos };
      for (const ev of ctx.game.getWorld(p.id)!.events) if (ev.type === 'projectile_fired' && ev.shooterId === e.id && !ev.isSecondary) shots++;
    }
    expect(worst).toBeLessThanOrEqual(e.maxSpeed * 1.5 / 30 + 1);
    expect(ctx.game.plausibility.moveCorrections).toBe(0);
    expect(ctx.game.plausibility.shotsDropped).toBe(0);
    expect(shots).toBeGreaterThan(0);
    expect(shots).toBeLessThanOrEqual(Math.floor(3 / e.mainReloadTime) + 2);
    p.ws.close();
  });
});

describe('client address normalisation', () => {
  it('IPv4-mapped IPv6 addresses map to the plain IPv4 key, everything else is kept', async () => {
    const { normalizeIp } = await import('../server/throttle.ts');
    expect(normalizeIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeIp('::FFFF:203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeIp('203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1');
    expect(normalizeIp('::1')).toBe('::1');
  });
});
