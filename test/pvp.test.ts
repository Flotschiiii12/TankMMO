import { describe, expect, it } from 'vitest';
import { getMapById } from '../shared/data/maps.ts';
import { SimRNG } from '../shared/prng.ts';
import { createStarterCharacterForServer } from '../server/starter.ts';
import { spawnPlayerFromCharacter } from '../shared/sim/playerEntity.ts';
import { allianceKey, canEngage, honorForKill, isPvpMap, registerPvpKill } from '../shared/sim/pvp.ts';
import { createWarPoints } from '../shared/sim/war.ts';
import { createWorld, stepWorld } from '../shared/sim/world.ts';
import { SimCommand } from '../shared/types.ts';

const NONE = new Map<number, SimCommand[]>();
function setup(mapId: number, lvlA = 20, lvlB = 20, fa: any = 'coastal', fb: any = 'highland') {
  const w = createWorld({ map: getMapById(mapId) as any, seed: 1, populate: false });
  const ca = createStarterCharacterForServer('A', fa); ca.level = lvlA;
  const cb = createStarterCharacterForServer('B', fb); cb.level = lvlB;
  const a = spawnPlayerFromCharacter(w, ca, { x: 2000, y: 2000 });
  const b = spawnPlayerFromCharacter(w, cb, { x: 2200, y: 2000 });
  a.invulnerableTime = b.invulnerableTime = 0;
  w.safeZones = [];
  return { w, a, b };
}

describe('PvP rules', () => {
  it('PvP exists only on maps 21-29', () => {
    expect([20, 21, 25, 29, 30, 1].map(isPvpMap)).toEqual([false, true, true, true, false, false]);
    for (const id of [1, 14, 20]) { const { w, a, b } = setup(id); expect(canEngage(w, a, b)).toBe(false); }
    const { w, a, b } = setup(23);
    expect(canEngage(w, a, b)).toBe(true);
    expect(canEngage(w, b, a)).toBe(true);
  });

  it('same faction, level < 15, level gap > 5, protection, safe zones and portal radius all block damage', () => {
    let { w, a, b } = setup(23, 20, 20, 'coastal', 'coastal'); expect(canEngage(w, a, b)).toBe(false);
    ({ w, a, b } = setup(23, 14, 14)); expect(canEngage(w, a, b)).toBe(false);
    ({ w, a, b } = setup(23, 20, 26)); expect(canEngage(w, a, b)).toBe(false);
    ({ w, a, b } = setup(23, 20, 25)); expect(canEngage(w, a, b)).toBe(true);
    ({ w, a, b } = setup(23)); b.invulnerableTime = 3; expect(canEngage(w, a, b)).toBe(false); // respawn/jump protection
    ({ w, a, b } = setup(23)); w.safeZones = [{ x: b.pos.x, y: b.pos.y, radius: 100, name: 's' }]; expect(canEngage(w, a, b)).toBe(false);
    ({ w, a, b } = setup(23)); const g = w.map!.gates[0]; b.pos = { x: g.x + 100, y: g.y }; expect(canEngage(w, a, b)).toBe(false);
  });

  it('allied clans are immune to each other only on a war control point', () => {
    const { w, a, b } = setup(23);
    w.war = createWarPoints(23, 4000, 4000);
    a.clanTag = 'AAA'; b.clanTag = 'BBB';
    expect(canEngage(w, a, b)).toBe(true);
    w.alliances.add(allianceKey('aaa', 'BBB'));
    const cp = w.war![0];
    a.pos = { x: cp.x + 800, y: cp.y };
    b.pos = { x: cp.x + 10, y: cp.y };
    expect(canEngage(w, a, b)).toBe(false); // victim on the point
    expect(canEngage(w, b, a)).toBe(true); // the attacker's own position does not matter, the victim is off the point
    b.pos = { x: cp.x + cp.radius + 500, y: cp.y };
    expect(canEngage(w, a, b)).toBe(true); // off the point: normal faction PvP
    w.alliances.clear();
    b.pos = { x: cp.x, y: cp.y };
    expect(canEngage(w, a, b)).toBe(true);
  });

  it('projectiles and machine guns follow the same rules in the simulation', () => {
    const { w, a, b } = setup(23);
    a.mainDamage = 300; b.pos = { x: 2200, y: 2000 };
    a.targetId = undefined;
    const before = b.hull + b.armor;
    for (let i = 0; i < 60; i++) stepWorld(w, new Map([[a.id, i === 0 ? [{ type: 'SetTarget', targetId: b.id }, { type: 'ToggleAutoFire' }] as SimCommand[] : []]]));
    expect(b.hull + b.armor).toBeLessThan(before);
    // same-faction players cannot target each other at all
    const s2 = setup(23, 20, 20, 'steppe', 'steppe');
    stepWorld(s2.w, new Map([[s2.a.id, [{ type: 'SetTarget', targetId: s2.b.id }] as SimCommand[]]]));
    expect(s2.a.targetId).toBeUndefined();
    const hp = s2.b.hull + s2.b.armor;
    for (let i = 0; i < 60; i++) stepWorld(s2.w, NONE);
    expect(s2.b.hull + s2.b.armor).toBe(hp);
  });

  it('kill cap: 3rd kill of the same victim within 30 min gives the killer 1 h of immunity to hit them', () => {
    const { w, a, b } = setup(23);
    expect(registerPvpKill(w, a.id, b.id).capTriggered).toBe(false);
    w.time += 100;
    expect(registerPvpKill(w, a.id, b.id).capTriggered).toBe(false);
    w.time += 100;
    expect(registerPvpKill(w, a.id, b.id).capTriggered).toBe(true);
    expect(canEngage(w, a, b)).toBe(false);
    expect(canEngage(w, b, a)).toBe(true); // only one direction
    w.time += 3601;
    expect(canEngage(w, a, b)).toBe(true);
  });

  it('honor: only within +-5 levels and once per victim per 30 minutes', () => {
    const { w, a, b } = setup(23, 20, 23);
    const log = new Map<number, number>();
    expect(honorForKill(w, a, b, log, 1000)).toBe(20 + 23);
    expect(honorForKill(w, a, b, log, 1500)).toBe(0);
    expect(honorForKill(w, a, b, log, 1000 + 1801)).toBe(43);
    b.level = 40;
    expect(honorForKill(w, a, b, new Map(), 5000)).toBe(0);
    void SimRNG;
  });
});
