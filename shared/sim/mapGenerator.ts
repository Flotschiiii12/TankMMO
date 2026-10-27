/**
 * Treadfront - Deterministic Procedural Map Generator
 * Pure TypeScript. Shared between Client and Server.
 * 
 * Generates map obstacles, terrain slow zones, road paths, and props
 * deterministically based on map seed, biome, and layout parameters.
 */

import { SimRNG } from '../prng.ts';
import {
  dist,
  distSq,
  MapDef,
  MapObstacle,
  WeatherType,
  TimeOfDay,
} from '../types.ts';
import { getMapById } from '../data/maps.ts';

export interface GeneratedMapInstance {
  mapDef: MapDef;
  obstacles: MapObstacle[];
  slowZones: Array<{
    x: number;
    y: number;
    radius: number;
    type: string;
    speedFactor: number;
  }>;
  weatherModifiers: {
    speedMultiplier: number;
    visionMultiplier: number;
    radarMultiplier: number;
    lightningStrikes: boolean;
  };
}

/**
 * Computes gameplay modifiers for a given weather type and time of day.
 */
export function getWeatherModifiers(weather?: WeatherType, timeOfDay?: TimeOfDay): {
  speedMultiplier: number;
  visionMultiplier: number;
  radarMultiplier: number;
  lightningStrikes: boolean;
} {
  let speedMultiplier = 1.0;
  let visionMultiplier = 1.0;
  let radarMultiplier = 1.0;
  let lightningStrikes = false;

  switch (weather) {
    case 'sandstorm':
    case 'snowstorm':
      speedMultiplier = 0.90; // -10% speed
      visionMultiplier = 0.70; // -30% vision
      radarMultiplier = 0.85;
      break;
    case 'rain':
      speedMultiplier = 0.95; // slight slow
      visionMultiplier = 0.90;
      break;
    case 'storm':
      speedMultiplier = 0.90;
      visionMultiplier = 0.75;
      lightningStrikes = true;
      break;
    case 'fog':
      visionMultiplier = 0.75;
      radarMultiplier = 1.10; // Radar more useful in fog
      break;
    case 'ashfall':
      visionMultiplier = 0.80;
      break;
    default:
      break;
  }

  if (timeOfDay === 'night') {
    visionMultiplier *= 0.80; // Dark night
    radarMultiplier *= 1.20; // Radar high value
  }

  return {
    speedMultiplier,
    visionMultiplier,
    radarMultiplier,
    lightningStrikes,
  };
}

/**
 * Deterministically generates obstacles and slow zones for a map definition.
 */
export function generateProceduralMap(mapInput: MapDef | number | string): GeneratedMapInstance {
  const mapDef = typeof mapInput === 'object' ? mapInput : getMapById(mapInput);
  const seed = mapDef.seed ?? (typeof mapDef.id === 'number' ? 100 + mapDef.id : 1337);
  const rng = new SimRNG(seed);

  const obstacles: MapObstacle[] = [];
  const slowZones: Array<{
    x: number;
    y: number;
    radius: number;
    type: string;
    speedFactor: number;
  }> = [];

  const { width, height, biome, groundParams } = mapDef;
  const centerX = width / 2;
  const centerY = height / 2;

  // Clear areas: Safe zones and gates must have zero blocking obstacles
  const clearAreas: Array<{ x: number; y: number; radius: number }> = [];
  for (const sz of mapDef.safeZones) {
    clearAreas.push({ x: sz.x, y: sz.y, radius: sz.radius + 60 });
  }
  for (const g of mapDef.gates) {
    clearAreas.push({ x: g.x, y: g.y, radius: g.radius + 100 });
  }

  function isClearArea(x: number, y: number, extraRadius = 30): boolean {
    for (const a of clearAreas) {
      if (distSq({ x, y }, { x: a.x, y: a.y }) <= (a.radius + extraRadius) * (a.radius + extraRadius)) {
        return true;
      }
    }
    return false;
  }

  // 1. Water Channels and Rivers (Slow zones)
  if (groundParams?.hasRiver) {
    const riverY = groundParams.riverY || height * 0.35;
    for (let x = 200; x < width - 200; x += 160) {
      const y = riverY + Math.sin(x * 0.0025 + seed) * 120;
      // Leave bridge/crossing around center and around gates
      if (Math.abs(x - centerX) > 180 && !isClearArea(x, y, 60)) {
        slowZones.push({
          x,
          y,
          radius: 95,
          type: 'water',
          speedFactor: 0.60,
        });

        // Add shore harbor crates / docks along the river bank
        if (rng.chance(0.20)) {
          const hId = rng.rangeInt(1, 6);
          const isBlocker = hId === 1 || hId === 2 || hId === 5;
          obstacles.push({
            x: x + rng.rangeFloat(-20, 20),
            y: y + 90,
            radius: isBlocker ? 24 : 14,
            type: 'harbor',
            propId: `harbor_0${hId}`,
            blocks: isBlocker,
          });
        }
      }
    }
  }

  // 2. Mud / Ice Slow Zones based on Biome
  if (biome === 'marsh') {
    // 16 swamp mud pools
    for (let i = 0; i < 16; i++) {
      const x = rng.rangeFloat(400, width - 400);
      const y = rng.rangeFloat(400, height - 400);
      if (!isClearArea(x, y, 80)) {
        slowZones.push({
          x,
          y,
          radius: rng.rangeFloat(90, 160),
          type: 'mud',
          speedFactor: 0.60,
        });
      }
    }
  } else if (biome === 'snow') {
    // Thin ice patches
    for (let i = 0; i < 14; i++) {
      const x = rng.rangeFloat(400, width - 400);
      const y = rng.rangeFloat(400, height - 400);
      if (!isClearArea(x, y, 80)) {
        slowZones.push({
          x,
          y,
          radius: rng.rangeFloat(100, 150),
          type: 'snow',
          speedFactor: 0.70,
        });
      }
    }
  }

  // 3. Buildings / Ruins
  const ruinCount = groundParams?.ruinCount ?? 15;
  for (let i = 0; i < ruinCount; i++) {
    const x = rng.rangeFloat(350, width - 350);
    const y = rng.rangeFloat(350, height - 350);
    if (!isClearArea(x, y, 60)) {
      const bNum = rng.rangeInt(1, 13);
      obstacles.push({
        x,
        y,
        radius: 38,
        type: 'building',
        propId: `building_${String(bNum).padStart(2, '0')}`,
        blocks: true,
        width: 85,
        height: 75,
      });
    }
  }

  // 4. Trees
  const treeCount = groundParams?.treeCount ?? 50;
  for (let i = 0; i < treeCount; i++) {
    const x = rng.rangeFloat(250, width - 250);
    const y = rng.rangeFloat(250, height - 250);
    if (!isClearArea(x, y, 40)) {
      const treeId = rng.rangeInt(1, 5);
      obstacles.push({
        x,
        y,
        radius: 26, // Circle collision radius at base
        type: 'tree',
        propId: `tree_0${treeId}`,
        blocks: true,
      });
    }
  }

  // 5. Rocks (Large Boulders block, small stones do not)
  const rockCount = groundParams?.rockCount ?? 45;
  for (let i = 0; i < rockCount; i++) {
    const x = rng.rangeFloat(250, width - 250);
    const y = rng.rangeFloat(250, height - 250);
    if (!isClearArea(x, y, 35)) {
      const stoneId = rng.rangeInt(1, 6);
      const blocks = stoneId <= 3; // 1-3 are large boulders that block
      obstacles.push({
        x,
        y,
        radius: blocks ? 24 : 12,
        type: 'rock',
        propId: `stone_0${stoneId}`,
        blocks,
      });
    }
  }

  // 6. Plants / Flora (Non-blocking decorative ground props)
  if (biome === 'coastal' || biome === 'highland' || biome === 'valley') {
    for (let i = 0; i < 40; i++) {
      const x = rng.rangeFloat(200, width - 200);
      const y = rng.rangeFloat(200, height - 200);
      if (!isClearArea(x, y, 20)) {
        const plantId = rng.rangeInt(1, 6);
        obstacles.push({
          x,
          y,
          radius: 14,
          type: 'plant',
          propId: `plant_0${plantId}`,
          blocks: false,
        });
      }
    }
  }

  // 7. Campfires near safe zone perimeter
  if (mapDef.safeZones.length > 0) {
    const sz = mapDef.safeZones[0];
    obstacles.push(
      {
        x: sz.x + sz.radius * 0.7,
        y: sz.y + sz.radius * 0.7,
        radius: 16,
        type: 'prop',
        propId: 'fx_12',
        blocks: false,
      },
      {
        x: sz.x - sz.radius * 0.7,
        y: sz.y - sz.radius * 0.7,
        radius: 16,
        type: 'prop',
        propId: 'fx_12',
        blocks: false,
      }
    );
  }

  const weatherModifiers = getWeatherModifiers(mapDef.weather, mapDef.timeOfDay);

  return {
    mapDef: {
      ...mapDef,
      obstacles,
      slowZones,
    },
    obstacles,
    slowZones,
    weatherModifiers,
  };
}
