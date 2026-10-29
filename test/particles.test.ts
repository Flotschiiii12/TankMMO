import { describe, expect, it } from 'vitest';
import { damageNumberSize, ParticleSystem, PARTICLE_CAP, REDUCED_PARTICLE_CAP, REDUCED_TREAD_CAP, dustColorForBiome } from '../src/render/particles.ts';
import { ammoLook, familyLook, impactLevel, lobHeight, RING_BY_LEVEL, SPARKS_BY_LEVEL } from '../src/render/combatFx.ts';

const P = { x: 100, y: 100 };
function flood(ps: ParticleSystem, n: number) {
  for (let i = 0; i < n; i++) {
    ps.emitDust(P, 0, 1); ps.emitMuzzleFlash(P, 0.3, ['cannon', 'rocket', 'railgun', 'mortar', 'flamethrower', 'rapid_fire'][i % 6]);
    ps.emitHitSparks(P, 15); ps.emitExplosion(P, true, 'boss'); ps.emitRing(P, 60); ps.emitSmokePuff(P); ps.emitFlame(P, 1); ps.emitDamageText(P, '-5');
  }
}

describe('particle system caps', () => {
  it('never holds more than the cap, however many effects are requested in one frame or over time', () => {
    const ps = new ParticleSystem();
    flood(ps, 400);
    expect(ps.activeCount).toBeLessThanOrEqual(PARTICLE_CAP);
    for (let t = 0; t < 200; t++) { flood(ps, 5); ps.update(1 / 60); expect(ps.activeCount).toBeLessThanOrEqual(PARTICLE_CAP); }
    // everything expires
    for (let t = 0; t < 300; t++) ps.update(0.1);
    expect(ps.activeCount).toBe(0);
  });

  it('reduced mode trims particles and tracks to its hard cap, disabled mode only keeps damage numbers', () => {
    const ps = new ParticleSystem(); ps.setReduced(true);
    flood(ps, 100);
    expect(ps.activeCount).toBeLessThanOrEqual(REDUCED_PARTICLE_CAP);
    expect(ps.cap).toBe(REDUCED_PARTICLE_CAP);
    for (let i = 0; i < 100; i++) ps.addTreadMark({ x: i * 20, y: 0 }, 0);
    expect(ps.treadMarkCount).toBe(REDUCED_TREAD_CAP);
    const quiet = new ParticleSystem(); quiet.enabled = false;
    quiet.emitHitSparks(P, 10); quiet.emitExplosion(P, true); quiet.emitRing(P, 40);
    expect(quiet.activeCount).toBe(0);
    quiet.emitDamageText(P, '-12');
    expect(quiet.activeCount).toBe(1);
  });

  it('applies intermediate and off-quality particle and tread budgets', () => {
    const ps = new ParticleSystem();
    ps.setCaps(300, 150, false);
    expect(ps.cap).toBe(300);
    for (let i = 0; i < 200; i++) ps.addTreadMark({ x: i * 20, y: 0 }, 0);
    expect(ps.treadMarkCount).toBe(150);
    ps.setCaps(60, 0, true);
    expect(ps.cap).toBe(60);
    expect(ps.treadMarkCount).toBe(0);
    ps.addTreadMark(P, 0);
    expect(ps.treadMarkCount).toBe(0);
    flood(ps, 100);
    expect(ps.activeCount).toBeLessThanOrEqual(60);
  });

  it('adds impact feedback and rate-limits wreck smoke within the particle cap', () => {
    const ps = new ParticleSystem();
    ps.emitImpact(P, 6, '#f97316', 36, true);
    expect(ps.activeCount).toBeGreaterThan(1);
    const before = ps.activeCount;
    ps.emitWreckSmoke(P, 42, 1);
    const afterFirst = ps.activeCount;
    ps.emitWreckSmoke(P, 42, 1.1);
    expect(ps.activeCount).toBe(afterFirst);
    ps.emitWreckSmoke(P, 42, 2);
    expect(ps.activeCount).toBeGreaterThan(afterFirst);
    expect(ps.activeCount).toBeLessThanOrEqual(PARTICLE_CAP);
    expect(before).toBeLessThan(afterFirst);
  });

  it('keeps informational damage text while reduced motion suppresses moving effects', () => {
    const ps = new ParticleSystem();
    ps.setReducedMotion(true);
    ps.emitExplosion(P, true);
    ps.addTreadMark(P, 0);
    expect(ps.activeCount).toBe(0);
    expect(ps.treadMarkCount).toBe(0);
    ps.emitDamageText(P, '-12');
    expect(ps.activeCount).toBe(1);
  });

  it('keeps rarity reward beams inside the pool and suppresses them for reduced motion', () => {
    const ps = new ParticleSystem();
    ps.emitRewardBeam(P, '#a855f7');
    expect(ps.activeCount).toBe(1);
    ps.setReducedMotion(true);
    ps.emitRewardBeam(P, '#facc15');
    expect(ps.activeCount).toBe(1);
    ps.update(2);
    expect(ps.activeCount).toBe(0);
  });

  it('matches dust to the biome and falls back to valley ground', () => {
    expect(dustColorForBiome('snow')).toBe('#d8e1e9');
    expect(dustColorForBiome('coastal')).not.toBe(dustColorForBiome('ash'));
    expect(dustColorForBiome()).toBe(dustColorForBiome('valley'));
  });

  it('spaces tread marks by vehicle travel distance instead of frame count', () => {
    const ps = new ParticleSystem();
    ps.addTreadMark({ x: 0, y: 0 }, 0, 28);
    ps.addTreadMark({ x: 10, y: 0 }, 0, 28);
    ps.addTreadMark({ x: 20, y: 0 }, 0, 28);
    expect(ps.treadMarkCount).toBe(2);
  });
});

describe('combat look tables', () => {
  it('scales damage numbers by damage and gives critical hits stronger emphasis', () => {
    expect(damageNumberSize(1000)).toBeGreaterThan(damageNumberSize(10));
    expect(damageNumberSize(100, true)).toBeGreaterThan(damageNumberSize(100));
  });

  it('every ammo type and weapon family has a look, unknown ones fall back', () => {
    for (const a of ['STANDARD', 'REINFORCED', 'ARMOR_PIERCING', 'SHAPED_CHARGE', 'EXPLOSIVE']) expect(ammoLook(a).color).toMatch(/^#/);
    expect(new Set(['STANDARD', 'REINFORCED', 'ARMOR_PIERCING', 'SHAPED_CHARGE', 'EXPLOSIVE'].map((a) => ammoLook(a).color)).size).toBe(5);
    for (const f of ['cannon', 'rapid_fire', 'rocket', 'mortar', 'railgun', 'flamethrower']) expect(familyLook(f).scale).toBeGreaterThan(0);
    expect(ammoLook('NOPE')).toBe(ammoLook('STANDARD')); expect(familyLook(undefined)).toBe(familyLook('cannon'));
    expect(familyLook('rocket').smoke).toBe(true); expect(familyLook('railgun').beam).toBe(true); expect(familyLook('mortar').arc).toBe(true);
  });

  it('impact effects grow with the share of health a hit removed', () => {
    expect([10, 40, 100, 300].map((d) => impactLevel(d, 1000))).toEqual([0, 1, 2, 3]);
    expect(SPARKS_BY_LEVEL[3]).toBeGreaterThan(SPARKS_BY_LEVEL[0]);
    expect(RING_BY_LEVEL[0]).toBe(0); expect(RING_BY_LEVEL[3]).toBeGreaterThan(RING_BY_LEVEL[2]);
    expect(lobHeight(0, 100)).toBeCloseTo(0, 5); expect(lobHeight(50, 100)).toBeCloseTo(1, 5); expect(lobHeight(100, 100)).toBeCloseTo(0, 5);
  });
});
