/**
 * Treadfront - Client Map Catalog
 * Powered by /shared/data/maps.ts and /shared/sim/mapGenerator.ts
 * Provides all 30 world zones, procedural obstacle layouts, gates, and safe zones.
 */

import { getAllMaps, getMapById as getSharedMapById, WORLD_MAP_CATALOG } from '../../shared/data/maps.ts';
import { generateProceduralMap } from '../../shared/sim/mapGenerator.ts';
import { MapDef, MapObstacle, MapSlowZone } from '../sim/types.ts';

// Cache of generated map definitions
const generatedCache: Record<string | number, MapDef> = {};

export function buildClientMapDef(rawMap: any): MapDef {
  const generated = generateProceduralMap(rawMap);
  const m = generated.mapDef;

  const obstacles: MapObstacle[] = generated.obstacles.map((obs) => ({
    x: obs.x,
    y: obs.y,
    radius: obs.radius,
    type: (obs.type === 'rock' ? 'rock' : obs.type === 'tree' ? 'tree' : obs.type === 'plant' ? 'plant' : obs.type === 'harbor' ? 'harbor' : obs.type === 'prop' ? 'prop' : 'building') as any,
    propId: obs.propId,
    blocks: obs.blocks !== false,
    width: obs.width,
    height: obs.height,
  }));

  const slowZones: MapSlowZone[] = generated.slowZones.map((sz) => ({
    x: sz.x,
    y: sz.y,
    radius: sz.radius,
    type: (sz.type === 'snow' ? 'snow' : sz.type === 'water' ? 'water' : 'mud') as any,
    speedFactor: sz.speedFactor,
  }));

  // Primary safe zone for backward compatibility
  const primarySafeZone = m.safeZones && m.safeZones.length > 0
    ? { x: m.safeZones[0].x, y: m.safeZones[0].y, radius: m.safeZones[0].radius }
    : undefined;

  const clientMap: MapDef = {
    id: m.key || String(m.id),
    numericId: typeof m.id === 'number' ? m.id : m.numericId || 1,
    key: m.key,
    name: m.name,
    biome: m.biome,
    width: m.width,
    height: m.height,
    safeZone: primarySafeZone,
    safeZones: m.safeZones,
    landmark: m.secrets && m.secrets.length > 0 ? {
      name: m.secrets[0].name,
      x: m.secrets[0].x,
      y: m.secrets[0].y,
      type: m.biome === 'coastal' ? 'lighthouse' : m.biome === 'canyon' ? 'canyon_arch' : m.biome === 'snow' ? 'frozen_waterfall' : 'watchtower',
    } : undefined,
    gates: m.gates.map((g) => ({
      id: g.id,
      name: g.name,
      x: g.x,
      y: g.y,
      radius: g.radius,
      targetMapId: String(g.targetMapId),
      targetGateId: g.targetGateId || '',
      spawnPoint: g.spawnPoint,
      minLevel: g.minLevel,
      safeZoneRadius: g.safeZoneRadius,
    })),
    obstacles,
    slowZones,
    enemySpawns: m.enemySpawns.map((s) => ({
      type: s.type as any,
      count: s.count,
      levelRange: s.levelRange,
      area: s.area,
    })),
    bossSpawn: m.bossSpawn ? {
      type: (m.bossSpawn.type || 'siege_crawler') as any,
      name: m.bossSpawn.name,
      level: m.bossSpawn.level,
      pos: m.bossSpawn.pos,
    } : undefined,
    weather: m.weather,
    timeOfDay: m.timeOfDay,
  };

  return clientMap;
}

// Build and populate MAP_CATALOG for all 30 maps
export const MAP_CATALOG: Record<string | number, MapDef> = {};

for (const sharedMap of getAllMaps()) {
  const clientDef = buildClientMapDef(sharedMap);
  const numId = typeof sharedMap.id === 'number' ? sharedMap.id : sharedMap.numericId || 1;
  const key = sharedMap.key || `map_${numId}`;

  MAP_CATALOG[numId] = clientDef;
  MAP_CATALOG[key] = clientDef;
  MAP_CATALOG[String(numId)] = clientDef;
}

// Aliases for initial prototype keys
MAP_CATALOG['green_valley'] = MAP_CATALOG[1] || MAP_CATALOG['gravel_bay'];
MAP_CATALOG['canyon_flats'] = MAP_CATALOG[10] || MAP_CATALOG['copper_canyon'];
MAP_CATALOG['frostline_pass'] = MAP_CATALOG[17] || MAP_CATALOG['frost_border'];
MAP_CATALOG['ash_city'] = MAP_CATALOG[25] || MAP_CATALOG['ruined_city_vaelmar'];

export function getClientMapById(id: string | number): MapDef {
  if (MAP_CATALOG[id]) {
    return MAP_CATALOG[id];
  }
  const shared = getSharedMapById(id);
  const def = buildClientMapDef(shared);
  MAP_CATALOG[id] = def;
  return def;
}
