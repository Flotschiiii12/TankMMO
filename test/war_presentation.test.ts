import { describe, expect, it } from 'vitest';
import { getMapById } from '../shared/data/maps.ts';
import { createStarterCharacterForServer } from '../server/starter.ts';
import { openDatabase, SqliteWarRepo } from '../server/db.ts';
import { LATEST_SCHEMA_VERSION, currentVersion } from '../server/migrations.ts';
import { spawnPlayerFromCharacter } from '../shared/sim/playerEntity.ts';
import { honorOutcome } from '../shared/sim/pvp.ts';
import { CAPTURE_PER_SECOND, CAPTURE_SECONDS, contributesTo, createWarPoints, stepWar, WAR_REWARD } from '../shared/sim/war.ts';
import { weekEndsAt, weekKey } from '../shared/rules/quests.ts';
import { createWorld } from '../shared/sim/world.ts';

function setup(lvlA = 20, lvlB = 20) {
  const w = createWorld({ map: getMapById(23) as any, seed: 1, populate: false });
  const ca = createStarterCharacterForServer('A', 'coastal'); ca.level = lvlA;
  const cb = createStarterCharacterForServer('B', 'highland'); cb.level = lvlB;
  const a = spawnPlayerFromCharacter(w, ca, { x: 2000, y: 2000 });
  const b = spawnPlayerFromCharacter(w, cb, { x: 2200, y: 2000 });
  w.safeZones = [];
  return { w, a, b };
}

describe('capture maths', () => {
  it('one faction takes an empty point in CAPTURE_SECONDS and the result is the same on every run', () => {
    const run = () => {
      const { w, a } = setup();
      w.war = createWarPoints(23, 4000, 4000);
      a.pos = { x: w.war[0].x, y: w.war[0].y };
      let t = 0;
      while (!w.war[0].owner && t < 60) { stepWar(w, 1 / 30); t += 1 / 30; }
      return { owner: w.war[0].owner, t: Math.round(t * 10) / 10 };
    };
    const r = run();
    expect(r.owner).toBe('coastal');
    expect(Math.abs(r.t - CAPTURE_SECONDS)).toBeLessThan(1);
    expect(run()).toEqual(r);
    expect(CAPTURE_SECONDS).toBe(Math.ceil(100 / CAPTURE_PER_SECOND));
  });
  it('two factions on one point mark it contested and nobody captures', () => {
    const { w, a, b } = setup();
    w.war = createWarPoints(23, 4000, 4000);
    a.pos = { x: w.war[0].x, y: w.war[0].y }; b.pos = { x: w.war[0].x + 20, y: w.war[0].y };
    for (let i = 0; i < 30 * 30; i++) stepWar(w, 1 / 30);
    expect(w.war[0].contested).toBe(true);
    expect(w.war[0].owner).toBeUndefined();
  });
  it('contribution counts for the own faction on or taking a point, not for a far away or fresh enemy point', () => {
    const p = createWarPoints(23, 4000, 4000)[0];
    const at = { x: p.x, y: p.y };
    expect(contributesTo(p, { x: p.x + 5000, y: p.y }, 'coastal')).toBe(false);
    expect(contributesTo(p, at, 'coastal')).toBe(false); // nothing taken yet
    p.progress.coastal = 10; expect(contributesTo(p, at, 'coastal')).toBe(true);
    p.owner = 'highland'; expect(contributesTo(p, at, 'highland')).toBe(true);
  });
});

describe('honor reasons', () => {
  it('names why honor is withheld', () => {
    const { w, a, b } = setup(20, 20);
    const seen = new Map<number, number>();
    expect(honorOutcome(w, a, b, seen, 1000)).toEqual({ honor: 40 });
    expect(honorOutcome(w, a, b, seen, 1100)).toEqual({ honor: 0, reason: 'repeat_target' });
    b.level = 30;
    expect(honorOutcome(w, a, b, new Map(), 1000)).toEqual({ honor: 0, reason: 'level_gap' });
  });
});

describe('weekly war claim storage', () => {
  it('claims exactly once per week and account, contributions add up, scores stay per week', () => {
    const db = openDatabase(':memory:');
    expect(currentVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    const repo = new SqliteWarRepo(db);
    repo.addContribution('w10', 'acc1', 70); repo.addContribution('w10', 'acc1', 60);
    expect(repo.contribution('w10', 'acc1')).toBe(130);
    expect(repo.contribution('w10', 'acc2')).toBe(0);
    expect(repo.contribution('w11', 'acc1')).toBe(0);
    repo.add('w10', 'coastal', 5); repo.add('w10', 'coastal', 7);
    expect(repo.scores('w10').coastal).toBe(12);
    expect(repo.hasClaimed('w10', 'acc1')).toBe(false);
    expect(repo.claim('w10', 'acc1', 1)).toBe(true);
    expect(repo.claim('w10', 'acc1', 2)).toBe(false);
    expect(repo.hasClaimed('w10', 'acc1')).toBe(true);
    expect(repo.claim('w11', 'acc1', 3)).toBe(true);
    expect(WAR_REWARD.scrap).toBeGreaterThan(0);
  });
  it('the week ends on the next Monday 00:00 UTC and the key changes exactly there', () => {
    const t = 20_000 * 86400 + 12345;
    const end = weekEndsAt(t);
    expect(end).toBeGreaterThan(t); expect(end - t).toBeLessThanOrEqual(7 * 86400);
    expect(end % 86400).toBe(0);
    expect(weekKey(end - 1)).not.toBe(weekKey(end));
  });
});
