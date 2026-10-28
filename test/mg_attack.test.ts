import { describe, expect, it } from 'vitest';
import { getAllMaps } from '../shared/data/maps.ts';
import { createWorld, spawnVehicle, stepWorld } from '../shared/sim/world.ts';
import { SimCommand } from '../shared/types.ts';

const NONE = new Map<number, SimCommand[]>();
const maps = getAllMaps() as any[];

/** A player parked 120 units from a hostile truck on an open PvE map (outside every safe zone). */
function setup() {
  const w: any = createWorld({ map: maps.find((m) => m.numericId === 14 || m.id === 14) ?? maps[13], seed: 3 });
  for (const e of [...w.entities.values()]) if (e.isHostile) w.entities.delete(e.id);
  const pos = { x: 3000, y: 1800 };
  const p = spawnVehicle(w, 'player', 'P', 20, pos, { maxHull: 1e9, maxArmor: 1e9 });
  p.mgDamage = 50; p.mgRange = 300; p.mgReloadTime = 0.2;
  const e = spawnVehicle(w, 'gunner_truck', 'T', 20, { x: pos.x + 120, y: pos.y }, { maxHull: 5000, maxArmor: 0, isHostile: true });
  e.aiState = 'idle';
  return { w, p, e };
}

describe('machine gun only fires once the attack was started', () => {
  it('driving up to an enemy does not damage it', () => {
    const { w, e } = setup();
    for (let i = 0; i < 90; i++) stepWorld(w, NONE);
    expect(e.hull).toBe(5000);
  });
  it('auto-fire or a locked target starts the machine gun', () => {
    const a = setup(); a.p.autoFire = true;
    for (let i = 0; i < 90; i++) stepWorld(a.w, NONE);
    expect(a.e.hull).toBeLessThan(5000);
    const b = setup(); b.p.targetId = b.e.id;
    for (let i = 0; i < 90; i++) stepWorld(b.w, NONE);
    expect(b.e.hull).toBeLessThan(5000);
  });
});
