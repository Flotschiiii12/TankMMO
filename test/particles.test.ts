import { describe, expect, it } from 'vitest';
import { ParticleSystem, PARTICLE_CAP, REDUCED_PARTICLE_CAP } from '../src/render/particles.ts';
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

  it('reduced mode lowers the cap, disabled mode only keeps the damage numbers', () => {
    const ps = new ParticleSystem(); ps.setReduced(true);
    flood(ps, 100);
    expect(ps.activeCount).toBeLessThanOrEqual(REDUCED_PARTICLE_CAP + 100); // numbers may exceed the soft cap but never the hard one
    expect(ps.activeCount).toBeLessThanOrEqual(PARTICLE_CAP);
    const quiet = new ParticleSystem(); quiet.enabled = false;
    quiet.emitHitSparks(P, 10); quiet.emitExplosion(P, true); quiet.emitRing(P, 40);
    expect(quiet.activeCount).toBe(0);
    quiet.emitDamageText(P, '-12');
    expect(quiet.activeCount).toBe(1);
  });
});

describe('combat look tables', () => {
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
