import { MAP_CATALOG } from '../data/maps.ts';
import { getVehicleById } from '../data/vehicles.ts';
import { createWorld, stepWorld, World } from './world.ts';
import { createWorld as createScratchWorld, spawnVehicle } from '../../shared/sim/world.ts';
import { SimCommand, SimEntity, vec2 } from './types.ts';

export class MapInstance {
  readonly id: string;
  readonly mapId: string;
  readonly maxCapacity: number;
  world: World;

  constructor(mapId: string, instanceId: string, maxCapacity = 100) {
    this.id = instanceId;
    this.mapId = mapId;
    this.maxCapacity = maxCapacity;
    this.world = createWorld(mapId, 1000 + mapId.length * 37);
  }

  /** Client view model of the map (obstacle/gate lists for rendering and routing). */
  get mapDef() {
    return MAP_CATALOG[this.mapId] || MAP_CATALOG['green_valley'];
  }

  step(commandsByEntity: Map<number, SimCommand[]>, dt: number) {
    stepWorld(this.world, commandsByEntity, dt);
  }

  getPlayer(playerId: number): SimEntity | undefined {
    return this.world.entities.get(playerId);
  }

  removeEntity(entityId: number): SimEntity | undefined {
    const ent = this.world.entities.get(entityId);
    if (ent) {
      this.world.entities.delete(entityId);
    }
    return ent;
  }

  insertPlayer(player: SimEntity) {
    this.world.entities.set(player.id, player);
  }
}

export class Realm {
  private instances = new Map<string, MapInstance>();

  constructor() {
    // Initialize default instances for all 4 maps
    for (const mapId of Object.keys(MAP_CATALOG)) {
      this.instances.set(mapId, new MapInstance(mapId, `inst_${mapId}_1`));
    }
  }

  getInstance(mapId: string): MapInstance {
    let inst = this.instances.get(mapId);
    if (!inst) {
      inst = new MapInstance(mapId, `inst_${mapId}_1`);
      this.instances.set(mapId, inst);
    }
    return inst;
  }

  createPlayerEntity(
    id: number,
    name: string,
    vehicleTierId: string,
    level: number,
    equippedBonus: { dpsBonus: number; hullBonus: number; armorBonus: number; speedBonus: number }
  ): SimEntity {
    const stats = getVehicleById(vehicleTierId);
    const levelMult = 1 + (level - 1) * 0.05;
    const scratch = createScratchWorld({ populate: false });
    const ent = spawnVehicle(scratch, 'player', name, level, { x: 2000, y: 2000 }, {
      tier: stats.tier,
      vehicleClass: stats.vehicleClass,
      mainDamage: Math.round(stats.damage * (1 + equippedBonus.dpsBonus / 380)),
      clanTag: 'CMD',
      maxHull: Math.round((stats.baseHull + equippedBonus.hullBonus) * levelMult),
      maxArmor: Math.round((stats.baseArmor + equippedBonus.armorBonus) * levelMult),
      maxSpeed: stats.maxSpeed + equippedBonus.speedBonus,
      turnRate: stats.turnRate,
      turretTurnRate: stats.turretTurnRate,
      mainReloadTime: stats.reloadTime,
      radius: 26 + stats.tier * 2,
    });
    ent.mainRange = stats.range;
    ent.id = id;
    ent.invulnerableTime = 5.0;
    return ent;
  }

  routeGate(
    fromMapId: string,
    gateId: string,
    targetMapId: string,
    player: SimEntity
  ): { targetInstance: MapInstance; newPos: { x: number; y: number } } {
    const fromInst = this.getInstance(fromMapId);
    fromInst.removeEntity(player.id);

    const targetInst = this.getInstance(targetMapId);
    const targetMapDef = targetInst.mapDef;

    // Find destination gate position
    const matchingGate =
      targetMapDef.gates.find((g) => String(g.targetMapId) === String(fromMapId)) ||
      targetMapDef.gates[0];

    const spawnPos = matchingGate && matchingGate.spawnPoint
      ? { ...matchingGate.spawnPoint }
      : matchingGate
      ? { x: matchingGate.x + 80, y: matchingGate.y + 80 }
      : { x: targetMapDef.width / 2, y: targetMapDef.height / 2 };

    player.pos = { ...spawnPos };
    player.vel = vec2();
    player.gateHoldTimer = 0;
    player.invulnerableTime = 5.0; // 5s spawn protection after jumping

    targetInst.insertPlayer(player);

    return { targetInstance: targetInst, newPos: spawnPos };
  }

  teleportPlayer(
    fromMapId: string,
    targetMapId: string,
    player: SimEntity
  ): { targetInstance: MapInstance; newPos: { x: number; y: number } } {
    const fromInst = this.getInstance(fromMapId);
    fromInst.removeEntity(player.id);

    const targetInst = this.getInstance(targetMapId);
    const targetMapDef = targetInst.mapDef;

    const spawnPos = targetMapDef.safeZone
      ? { x: targetMapDef.safeZone.x, y: targetMapDef.safeZone.y }
      : targetMapDef.safeZones && targetMapDef.safeZones.length > 0
      ? { x: targetMapDef.safeZones[0].x, y: targetMapDef.safeZones[0].y }
      : { x: targetMapDef.width / 2, y: targetMapDef.height / 2 };

    player.pos = { ...spawnPos };
    player.vel = vec2();
    player.gateHoldTimer = 0;
    player.invulnerableTime = 5.0;

    targetInst.insertPlayer(player);

    return { targetInstance: targetInst, newPos: spawnPos };
  }
}

