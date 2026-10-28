import { describe, expect, it } from 'vitest';
import { activeEvents, CONVOY_RACE_CONVOYS, EVENT_RULES, INVASION_SCRAP_CAP, invasionReward, isWeekendXp, STORM_ORE_BONUS, stormStrikeDamage, upcomingEvents, WEEKEND_XP_MULTIPLIER, WORLD_BOSS_MAPS, WORLD_BOSS_PERIOD_SECONDS } from '../shared/sim/events.ts';
import { getMapById } from '../shared/data/maps.ts';
import { createStarterCharacterForServer } from '../server/starter.ts';
import { spawnPlayerFromCharacter } from '../shared/sim/playerEntity.ts';
import { createWorld, isPosInSafeZone, stepWorld, World } from '../shared/sim/world.ts';
import type { SimCommand } from '../shared/types.ts';

const NONE = new Map<number, SimCommand[]>();
const day = 86400;

describe('event schedule maths', () => {
  it('lists running and upcoming events in order, inside the horizon, with exact boundaries', () => {
    const t = 3 * 3600 + 5; // inside the first invasion window? offset 0, period 3 h -> window starts at 3 h
    const list = upcomingEvents(t, 6 * 3600, 50);
    expect(list.length).toBeGreaterThan(5);
    for (let i = 1; i < list.length; i++) expect(list[i].startsAt).toBeGreaterThanOrEqual(list[i - 1].startsAt);
    for (const e of list) { expect(e.endsAt).toBeGreaterThan(t); expect(e.startsAt).toBeLessThanOrEqual(t + 6 * 3600); }
    const inv = EVENT_RULES.find((r) => r.kind === 'invasion')!;
    // a window is running from its first second to its last, and gone at the end second
    expect(upcomingEvents(3 * 3600, 60, 50).some((e) => e.kind === 'invasion' && e.startsAt === 3 * 3600)).toBe(true);
    expect(upcomingEvents(3 * 3600 + inv.durationSeconds - 1, 1, 50).some((e) => e.kind === 'invasion')).toBe(true);
    expect(upcomingEvents(3 * 3600 + inv.durationSeconds, 1, 50).some((e) => e.kind === 'invasion' && e.startsAt === 3 * 3600)).toBe(false);
    // the list agrees with activeEvents() at the same moment
    for (const probe of [0, 1, 3600, 7200 + 31, 100_000, 1_800_000_123]) {
      const running = upcomingEvents(probe, 1, 100).filter((e) => e.startsAt <= probe && e.kind !== 'world_boss').map((e) => e.kind).sort();
      expect(running, `t=${probe}`).toEqual(activeEvents(probe).map((e) => e.kind).sort());
    }
  });

  it('weekend XP covers exactly Saturday and Sunday (UTC), also across the week boundary', () => {
    // epoch day 0 = Thursday 1970-01-01: Saturday = day 2, Sunday = day 3, next Saturday = day 9
    expect([1, 2, 3, 4].map((d) => isWeekendXp(d * day + 100))).toEqual([false, true, true, false]);
    expect(isWeekendXp(2 * day - 1)).toBe(false); expect(isWeekendXp(2 * day)).toBe(true);
    expect(isWeekendXp(4 * day - 1)).toBe(true); expect(isWeekendXp(4 * day)).toBe(false);
    expect(isWeekendXp(9 * day + 5)).toBe(true);
    const fri = upcomingEvents(2 * day - 10, 20, 10).find((e) => e.kind === 'weekend_xp');
    expect(fri).toMatchObject({ startsAt: 2 * day, endsAt: 3 * day });
    expect(WEEKEND_XP_MULTIPLIER).toBe(1.5);
  });

  it('the world boss rotates over its maps every period and the calendar says where', () => {
    const slots = upcomingEvents(0, 3 * WORLD_BOSS_PERIOD_SECONDS, 100).filter((e) => e.kind === 'world_boss');
    expect(slots.map((s) => s.mapIds![0])).toEqual([0, 1, 2, 3].map((i) => WORLD_BOSS_MAPS[i % WORLD_BOSS_MAPS.length]));
    expect(slots[1].startsAt - slots[0].startsAt).toBe(WORLD_BOSS_PERIOD_SECONDS);
  });

  it('rewards are capped and need a real contribution', () => {
    expect([0, 2, 3, 5, 10, 1000].map(invasionReward)).toEqual([0, 0, 120, 200, 400, INVASION_SCRAP_CAP]);
    expect(stormStrikeDamage(1)).toBeLessThan(stormStrikeDamage(50));
    expect(STORM_ORE_BONUS).toBeLessThanOrEqual(1.5);
  });
});

function worldAt(mapId: number, clock: number, populate = true): World {
  const w = createWorld({ map: getMapById(mapId) as any, seed: 21, populate, clockOffset: clock });
  return w;
}
const run = (w: World, seconds: number) => { for (let i = 0; i < seconds * 30; i++) stepWorld(w, NONE); };
const ofEvent = (w: World) => [...w.entities.values()].filter((e) => e.fromEvent || e.fromInvasion);

describe('events in the simulation', () => {
  it('invasion: raiders appear only outside safe zones, are capped, and vanish when it ends', () => {
    const inv = EVENT_RULES.find((r) => r.kind === 'invasion')!;
    const start = 3 * 3600 * 4; // window start
    const w = worldAt(1, start + inv.durationSeconds - 130);
    run(w, 100);
    const raiders = [...w.entities.values()].filter((e) => e.fromInvasion && e.hull > 0);
    expect(raiders.length).toBeGreaterThan(0); expect(raiders.length).toBeLessThanOrEqual(10);
    for (const r of raiders) expect(isPosInSafeZone(w, r.pos)).toBe(false);
    run(w, 60);
    expect(w.events.length >= 0).toBe(true);
    expect(ofEvent(w)).toHaveLength(0);
    expect(w.pve.activeEvents.filter((id) => id.startsWith('invasion'))).toHaveLength(0);
  });

  it('meteor shower: four crystal deposits outside the safe zones, none left afterwards', () => {
    const r = EVENT_RULES.find((x) => x.kind === 'meteor_shower')!;
    const start = r.offsetSeconds + r.periodSeconds * 10;
    const w = worldAt(16, start + r.durationSeconds - 40, false);
    run(w, 5);
    const nodes = [...w.entities.values()].filter((e) => e.fromEvent && e.kind === 'resource_node');
    expect(nodes).toHaveLength(4);
    for (const n of nodes) { expect(isPosInSafeZone(w, n.pos)).toBe(false); expect(n.nodeType).toBe('crystal'); }
    nodes[0].nodeOreRemaining = 10; // partly mined
    run(w, 50);
    expect(ofEvent(w)).toHaveLength(0);
  });

  it('convoy race: the convoys start away from safe zones, are marked as event entities and are removed at the end', () => {
    const r = EVENT_RULES.find((x) => x.kind === 'convoy_race')!;
    const start = r.offsetSeconds + r.periodSeconds * 10;
    const w = worldAt(14, start + r.durationSeconds - 30, false);
    run(w, 3);
    const convoys = [...w.entities.values()].filter((e) => e.fromEvent && e.kind === 'loot_convoy');
    expect(convoys).toHaveLength(CONVOY_RACE_CONVOYS);
    for (const c of convoys) { expect(isPosInSafeZone(w, c.pos)).toBe(false); expect(c.isHostile).toBe(true); }
    run(w, 40);
    expect(ofEvent(w)).toHaveLength(0);
  });

  it('storm: lightning warns with a ring near a player, never strikes inside a safe zone, and pays more ore while it lasts', () => {
    const r = EVENT_RULES.find((x) => x.kind === 'storm_event')!;
    const start = r.offsetSeconds + r.periodSeconds * 10;
    const w = worldAt(17, start + 5, false);
    w.safeZones = [];
    const ch = createStarterCharacterForServer('P', 'coastal');
    const me = spawnPlayerFromCharacter(w, ch, { x: 2000, y: 2000 }); me.invulnerableTime = 1e9;
    let seen = 0; let nearest = Infinity;
    for (let i = 0; i < 20 * 30; i++) { stepWorld(w, NONE); for (const e of w.entities.values()) if (e.kind === 'telegraph' && e.fromEvent) { seen++; nearest = Math.min(nearest, Math.hypot(e.pos.x - me.pos.x, e.pos.y - me.pos.y)); } }
    expect(seen).toBeGreaterThan(0);
    expect(nearest).toBeLessThan(260); // strikes land near the player
    expect(w.pve.nextStormStrike).toBeGreaterThan(w.time);
    // a player standing in a safe zone is never targeted
    const w2 = worldAt(17, start + 5, false);
    w2.safeZones = [{ x: 2000, y: 2000, radius: 1500, name: 's' } as any];
    const me2 = spawnPlayerFromCharacter(w2, createStarterCharacterForServer('Q', 'coastal'), { x: 2000, y: 2000 }); me2.invulnerableTime = 1e9;
    run(w2, 30);
    expect([...w2.entities.values()].filter((e) => e.kind === 'telegraph')).toHaveLength(0);
    // after the storm the ring entities are gone
    run(w, r.durationSeconds);
    expect(ofEvent(w)).toHaveLength(0);
  });
});

// ------------------------------------------------------------------------------------------------ server side

import { afterEach, beforeEach } from 'vitest';
import WebSocket from 'ws';
import { createApp } from '../server/app.ts';
import { PROTOCOL_VERSION } from '../shared/protocol.ts';

process.env.LOAD_TEST = '1';
let ctx: ReturnType<typeof createApp>; let port: number; let nowMs = 0;
const startServer = async (clockMs: number) => { nowMs = clockMs; ctx = createApp({ adminToken: 'x', clock: { nowMs: () => nowMs } }); port = await ctx.game.listen(0); };
afterEach(async () => { await ctx?.game.close(); });
void beforeEach;

async function join() {
  const g = (await (await fetch(`http://127.0.0.1:${port}/api/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ageConfirmed: true }) })).json()) as any;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); const msgs: any[] = [];
  await new Promise<void>((r) => ws.on('open', () => r()));
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
  const [a, sec] = g.credential.split('.');
  ws.send(JSON.stringify({ type: 'c_join', protocolVersion: PROTOCOL_VERSION, accountId: a, secret: sec }));
  for (let i = 0; i < 500 && !msgs.some((m) => m.type === 's_character'); i++) { ctx.game.stepAll(); await new Promise((r) => setTimeout(r, 4)); }
  return { id: g.accountId as string, ws, msgs };
}

describe('event rewards on the server', () => {
  it('weekend XP: the same kill gives 50 % more experience on a Saturday than on a Friday', async () => {
    const gainOn = async (clockSeconds: number) => {
      await startServer(clockSeconds * 1000);
      const p = await join(); const s = (ctx.game as any).sessions.get(p.id);
      const victim: any = { id: 9999, kind: 'scout_buggy', level: 1, isElite: false, archetypeId: 'scout_buggy', isHostile: true };
      s.character.level = 1; s.character.xp = 0;
      (ctx.game as any).rewardKill(s, victim);
      const xp = s.character.xp; p.ws.close(); await ctx.game.close();
      return xp;
    };
    const friday = await gainOn(1 * day + 3600); const saturday = await gainOn(2 * day + 3600);
    expect(friday).toBeGreaterThan(0);
    expect(saturday).toBe(Math.round(friday * WEEKEND_XP_MULTIPLIER));
  });

  it('invasion: killing three or more raiders pays scrap when the event ends, standing around pays nothing', async () => {
    const inv = EVENT_RULES.find((r) => r.kind === 'invasion')!;
    const startAt = 3 * 3600 * 20;
    await startServer((startAt + inv.durationSeconds - 4) * 1000);
    const a = await join(); const b = await join();
    const sa = (ctx.game as any).sessions.get(a.id); const sb = (ctx.game as any).sessions.get(b.id);
    for (let i = 0; i < 45; i++) { nowMs += 1000 / 30; ctx.game.stepAll(); } // the event has started (counters reset)
    const scrapA = sa.character.wallet.scrap; const scrapB = sb.character.wallet.scrap;
    for (let i = 0; i < 4; i++) (ctx.game as any).rewardKill(sa, { id: 7000 + i, kind: 'scout_buggy', level: 1, isElite: false, archetypeId: 'scout_buggy', isHostile: true, fromInvasion: true });
    (ctx.game as any).rewardKill(sb, { id: 7100, kind: 'scout_buggy', level: 1, isElite: false, archetypeId: 'scout_buggy', isHostile: true, fromInvasion: true });
    for (let i = 0; i < 30 * 6; i++) { nowMs += 1000 / 30; ctx.game.stepAll(); }
    await new Promise((r) => setTimeout(r, 50));
    // (both also earn the same one-time "first blood" achievement scrap, so compare the two)
    expect((sa.character.wallet.scrap - scrapA) - (sb.character.wallet.scrap - scrapB)).toBe(invasionReward(4));
    expect(a.msgs.some((m) => m.type === 's_social_event' && m.kind === 'event_reward' && m.data.scrap === 160)).toBe(true);
    a.ws.close(); b.ws.close();
  });
});
