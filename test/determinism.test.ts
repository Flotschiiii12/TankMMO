import { describe, expect, it } from 'vitest';
import {
  createWorld,
  hashWorldState,
  spawnVehicle,
  stepWorld,
} from '../shared/sim/world.ts';
import { SimCommand } from '../shared/types.ts';

describe('Deterministic Simulation & Replay (Section 0 & 15)', () => {
  it('produces bit-identical world state hashes over 300 ticks with identical inputs', () => {
    const seed = 98765;

    // Simulation 1
    const world1 = createWorld({ seed });
    const p1 = spawnVehicle(world1, 'player', 'Player 1', 1, { x: 2000, y: 2000 }, {
      isHostile: false,
    });
    const e1 = spawnVehicle(world1, 'scout_buggy', 'Enemy 1', 1, { x: 2300, y: 2000 }, {
      isHostile: true,
    });

    // Simulation 2
    const world2 = createWorld({ seed });
    const p2 = spawnVehicle(world2, 'player', 'Player 1', 1, { x: 2000, y: 2000 }, {
      isHostile: false,
    });
    const e2 = spawnVehicle(world2, 'scout_buggy', 'Enemy 1', 1, { x: 2300, y: 2000 }, {
      isHostile: true,
    });

    expect(p1.id).toBe(p2.id);
    expect(e1.id).toBe(e2.id);

    // Simulate 300 ticks (~10 seconds of gameplay)
    for (let tick = 0; tick < 300; tick++) {
      const commands1 = new Map<number, SimCommand[]>();
      const commands2 = new Map<number, SimCommand[]>();

      // Synthetic deterministic command sequence
      const cmdList: SimCommand[] = [];

      if (tick < 60) {
        // Drive east
        cmdList.push({ type: 'Drive', seq: tick, x: 1, y: 0 });
      } else if (tick < 120) {
        // Drive north-east and lock target
        cmdList.push({ type: 'Drive', seq: tick, x: 0.7, y: 0.7 });
        cmdList.push({ type: 'SetTarget', seq: tick, targetId: e1.id });
      } else if (tick < 180) {
        // Fire cannon and select ammo
        cmdList.push({ type: 'SelectAmmo', seq: tick, ammo: 'REINFORCED' });
        cmdList.push({ type: 'FireMain', seq: tick });
      } else if (tick === 185) {
        // Pop boost ability
        cmdList.push({ type: 'UseAbility', seq: tick, abilityId: 'boost' });
      } else if (tick === 200) {
        // Pop smoke ability
        cmdList.push({ type: 'UseAbility', seq: tick, abilityId: 'smoke' });
      }

      commands1.set(p1.id, cmdList);
      commands2.set(p2.id, cmdList);

      stepWorld(world1, commands1);
      stepWorld(world2, commands2);

      // Verify hashes match each tick
      expect(hashWorldState(world1)).toBe(hashWorldState(world2));
    }

    // Final state checks
    expect(world1.tick).toBe(300);
    expect(world2.tick).toBe(300);
    expect(p1.pos.x).toBeCloseTo(p2.pos.x, 5);
    expect(p1.pos.y).toBeCloseTo(p2.pos.y, 5);
    expect(p1.hull).toBe(p2.hull);
    expect(p1.armor).toBe(p2.armor);
  });
});
