import { describe, expect, it } from 'vitest';
import { getAllMaps, MAP_CONNECTIONS } from '../shared/data/maps.ts';
import { generateProceduralMap } from '../shared/sim/mapGenerator.ts';

// The 30-map world graph from the design document (bidirectional portal edges)
const SPEC_EDGES = '1-2,2-3,3-4,4-14,5-6,6-7,7-8,8-14,9-10,10-11,11-12,12-14,14-13,14-15,15-16,16-17,17-18,18-19,19-20,15-21,17-22,19-23,21-24,22-24,23-24,20-25,24-25,25-26,26-27,27-28,28-29,13-30'.split(',');
const norm = (a: number, b: number) => [a, b].sort((x, y) => x - y).join('-');

describe('World: 30 maps, portal graph, procedural generator', () => {
  const maps = getAllMaps() as any[];

  it('has exactly 30 maps with the planned types and level ranges', () => {
    expect(maps).toHaveLength(30);
    const count = (t: string) => maps.filter((m) => m.type === t).length;
    expect([count('HOME'), count('PVE'), count('HUB'), count('PVP'), count('ENDGAME'), count('ARENA')]).toEqual([3, 16, 1, 4, 5, 1]);
    const byId = new Map(maps.map((m) => [m.id, m]));
    expect(byId.get(1).levelRange).toEqual([1, 5]);
    expect(byId.get(4).levelRange).toEqual([10, 15]);
    expect(byId.get(29).levelRange).toEqual([90, 100]);
  });

  it('portal connections match the design graph exactly', () => {
    const code = new Set((MAP_CONNECTIONS as any[]).map((e) => norm(e.from ?? e[0], e.to ?? e[1])));
    const spec = new Set(SPEC_EDGES.map((e) => norm(...(e.split('-').map(Number) as [number, number]))));
    expect([...spec].filter((e) => !code.has(e))).toEqual([]);
    expect([...code].filter((e) => !spec.has(e))).toEqual([]);
  });

  it('every gate points to an existing map and has a gate back (bidirectional)', () => {
    const byId = new Map(maps.map((m) => [m.id, m]));
    for (const m of maps) {
      for (const g of m.gates) {
        const target = byId.get(g.targetMapId);
        expect(target, `map ${m.id} gate ${g.id}`).toBeDefined();
        expect(target.gates.some((x: any) => x.targetMapId === m.id), `back gate ${g.targetMapId}->${m.id}`).toBe(true);
        expect(g.spawnPoint.x).toBeGreaterThanOrEqual(0);
        expect(g.spawnPoint.x).toBeLessThanOrEqual(target.width);
        expect(g.spawnPoint.y).toBeGreaterThanOrEqual(0);
        expect(g.spawnPoint.y).toBeLessThanOrEqual(target.height);
      }
    }
  });

  it('generates every map deterministically without blocking gates or safe zones', () => {
    for (const m of maps) {
      const a = generateProceduralMap(m.id) as any;
      const b = generateProceduralMap(m.id) as any;
      expect(JSON.stringify(a.obstacles), `map ${m.id} deterministic`).toBe(JSON.stringify(b.obstacles));
      expect(a.obstacles.length, `map ${m.id} has obstacles`).toBeGreaterThan(0);
      for (const o of a.obstacles) {
        if (!o.blocks) continue;
        for (const g of m.gates) expect(Math.hypot(o.x - g.x, o.y - g.y) >= g.radius + o.radius, `map ${m.id} obstacle on gate`).toBe(true);
        for (const z of m.safeZones) if (z.radius) expect(Math.hypot(o.x - z.x, o.y - z.y) >= z.radius * 0.5, `map ${m.id} obstacle in safe zone`).toBe(true);
      }
    }
  });
});
