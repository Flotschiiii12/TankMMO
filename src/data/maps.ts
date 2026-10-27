import { MapDef, MapObstacle, MapSlowZone } from '../sim/types.ts';

// Deterministic obstacle generation helpers to ensure varied, rich maps without giant hardcoded arrays
function generateBiomedObstacles(
  biome: 'green_valley' | 'canyon_flats' | 'frostline_pass' | 'ash_city',
  width: number,
  height: number
): { obstacles: MapObstacle[]; slowZones: MapSlowZone[] } {
  const obstacles: MapObstacle[] = [];
  const slowZones: MapSlowZone[] = [];

  if (biome === 'green_valley') {
    // River across the map around y = 1400 with a crossing/bridge at x = 2000
    for (let x = 300; x < width - 300; x += 180) {
      if (Math.abs(x - 2000) > 160) {
        slowZones.push({
          x,
          y: 1400 + Math.sin(x * 0.003) * 120,
          radius: 95,
          type: 'water',
          speedFactor: 0.6,
        });
      }
    }
    // Trees and rock clusters (leaving safe zone center clear)
    for (let i = 0; i < 48; i++) {
      const angle = (i / 48) * Math.PI * 2;
      const dist = 600 + (i % 7) * 400;
      const x = 2000 + Math.cos(angle) * dist;
      const y = 2000 + Math.sin(angle) * dist;
      if (x > 150 && x < width - 150 && y > 150 && y < height - 150) {
        obstacles.push({
          x,
          y,
          radius: (i % 3 === 0 ? 38 : 26),
          type: i % 2 === 0 ? 'tree' : 'rock',
        });
      }
    }
    // Small village ruins northeast of base
    obstacles.push(
      { x: 2600, y: 1600, radius: 45, type: 'ruin', width: 90, height: 70 },
      { x: 2750, y: 1620, radius: 40, type: 'ruin', width: 80, height: 60 },
      { x: 2680, y: 1740, radius: 42, type: 'wall', width: 120, height: 24 }
    );
  } else if (biome === 'canyon_flats') {
    // Dry riverbed / mud slow zones
    for (let x = 400; x < width - 400; x += 220) {
      slowZones.push({
        x,
        y: 2800 + Math.sin(x * 0.002) * 200,
        radius: 120,
        type: 'mud',
        speedFactor: 0.65,
      });
    }
    // Sandstone pillars & canyon rock walls
    for (let i = 0; i < 55; i++) {
      const x = 400 + ((i * 379) % (width - 800));
      const y = 400 + ((i * 541) % (height - 800));
      obstacles.push({
        x,
        y,
        radius: 35 + (i % 4) * 12,
        type: 'rock',
      });
    }
  } else if (biome === 'frostline_pass') {
    // Ice lake in central valley (low friction / snow slow surroundings)
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      slowZones.push({
        x: 2500 + Math.cos(a) * 450,
        y: 2500 + Math.sin(a) * 450,
        radius: 130,
        type: 'snow',
        speedFactor: 0.7,
      });
    }
    // Snowy pine clusters and ice spires
    for (let i = 0; i < 60; i++) {
      const x = 350 + ((i * 431) % (width - 700));
      const y = 350 + ((i * 617) % (height - 700));
      obstacles.push({
        x,
        y,
        radius: 28 + (i % 3) * 14,
        type: i % 2 === 0 ? 'tree' : 'rock',
      });
    }
  } else if (biome === 'ash_city') {
    // Ruined city blocks with asphalt and rubble slow zones
    for (let i = 0; i < 22; i++) {
      const x = 600 + ((i * 513) % (width - 1200));
      const y = 600 + ((i * 479) % (height - 1200));
      slowZones.push({
        x,
        y,
        radius: 110,
        type: 'mud',
        speedFactor: 0.65,
      });
    }
    // High-density skyscraper ruins and barricade walls
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 6; col++) {
        if ((row + col) % 2 === 1) {
          obstacles.push({
            x: 800 + col * 750 + (row % 2) * 50,
            y: 800 + row * 750,
            radius: 55,
            type: 'building',
            width: 110,
            height: 90,
          });
        }
      }
    }
  }

  return { obstacles, slowZones };
}

const gv = generateBiomedObstacles('green_valley', 4000, 4000);
const cf = generateBiomedObstacles('canyon_flats', 4500, 4500);
const fp = generateBiomedObstacles('frostline_pass', 5000, 5000);
const ac = generateBiomedObstacles('ash_city', 5500, 5500);

export const MAP_CATALOG: Record<string, MapDef> = {
  green_valley: {
    id: 'green_valley',
    name: 'Green Valley',
    biome: 'green_valley',
    width: 4000,
    height: 4000,
    safeZone: {
      x: 2000,
      y: 2000,
      radius: 400,
    },
    landmark: {
      name: 'Highland Watchtower',
      x: 2000,
      y: 900,
      type: 'watchtower',
    },
    gates: [
      {
        id: 'gv_to_cf',
        name: 'Canyon Pass Tunnel',
        x: 3700,
        y: 2000,
        radius: 90,
        targetMapId: 'canyon_flats',
        targetGateId: 'cf_to_gv',
      },
    ],
    obstacles: gv.obstacles,
    slowZones: gv.slowZones,
    enemySpawns: [
      {
        type: 'scout_buggy',
        count: 10,
        levelRange: [1, 4],
        area: { x: 500, y: 500, width: 3000, height: 3000 },
      },
      {
        type: 'gunner_truck',
        count: 7,
        levelRange: [3, 6],
        area: { x: 700, y: 700, width: 2600, height: 2600 },
      },
      {
        type: 'bunker_turret',
        count: 4,
        levelRange: [4, 7],
        area: { x: 2800, y: 1500, width: 800, height: 900 },
      },
      {
        type: 'loot_convoy',
        count: 2,
        levelRange: [3, 5],
        area: { x: 900, y: 2800, width: 2200, height: 800 },
      },
    ],
  },

  canyon_flats: {
    id: 'canyon_flats',
    name: 'Canyon Flats',
    biome: 'canyon_flats',
    width: 4500,
    height: 4500,
    landmark: {
      name: 'Titan Arch Plateau',
      x: 2250,
      y: 1750,
      type: 'canyon_arch',
    },
    gates: [
      {
        id: 'cf_to_gv',
        name: 'Valley Gate Tunnel',
        x: 350,
        y: 2250,
        radius: 90,
        targetMapId: 'green_valley',
        targetGateId: 'gv_to_cf',
      },
      {
        id: 'cf_to_fp',
        name: 'Glacier Causeway',
        x: 4150,
        y: 2250,
        radius: 90,
        targetMapId: 'frostline_pass',
        targetGateId: 'fp_to_cf',
      },
    ],
    obstacles: cf.obstacles,
    slowZones: cf.slowZones,
    enemySpawns: [
      {
        type: 'scout_buggy',
        count: 8,
        levelRange: [5, 8],
        area: { x: 600, y: 600, width: 3300, height: 3300 },
      },
      {
        type: 'gunner_truck',
        count: 9,
        levelRange: [6, 10],
        area: { x: 800, y: 800, width: 2900, height: 2900 },
      },
      {
        type: 'artillery',
        count: 5,
        levelRange: [7, 11],
        area: { x: 1000, y: 1000, width: 2500, height: 2500 },
      },
      {
        type: 'bunker_turret',
        count: 4,
        levelRange: [8, 12],
        area: { x: 3400, y: 1900, width: 700, height: 700 },
      },
      {
        type: 'loot_convoy',
        count: 2,
        levelRange: [7, 10],
        area: { x: 1000, y: 3200, width: 2500, height: 800 },
      },
    ],
    bossSpawn: {
      type: 'siege_crawler',
      name: 'Siege Crawler Behemoth',
      level: 12,
      pos: { x: 3300, y: 1500 },
    },
  },

  frostline_pass: {
    id: 'frostline_pass',
    name: 'Frostline Pass',
    biome: 'frostline_pass',
    width: 5000,
    height: 5000,
    landmark: {
      name: 'Frozen Cascade Glacier',
      x: 2500,
      y: 1100,
      type: 'frozen_waterfall',
    },
    gates: [
      {
        id: 'fp_to_cf',
        name: 'South Ridge Tunnel',
        x: 400,
        y: 2500,
        radius: 90,
        targetMapId: 'canyon_flats',
        targetGateId: 'cf_to_fp',
      },
      {
        id: 'fp_to_ac',
        name: 'Ashland Rail Line',
        x: 4600,
        y: 2500,
        radius: 90,
        targetMapId: 'ash_city',
        targetGateId: 'ac_to_fp',
      },
    ],
    obstacles: fp.obstacles,
    slowZones: fp.slowZones,
    enemySpawns: [
      {
        type: 'gunner_truck',
        count: 10,
        levelRange: [12, 17],
        area: { x: 800, y: 800, width: 3400, height: 3400 },
      },
      {
        type: 'artillery',
        count: 7,
        levelRange: [14, 20],
        area: { x: 1000, y: 1000, width: 3000, height: 3000 },
      },
      {
        type: 'bunker_turret',
        count: 6,
        levelRange: [15, 22],
        area: { x: 1200, y: 1200, width: 2600, height: 2600 },
      },
      {
        type: 'loot_convoy',
        count: 2,
        levelRange: [14, 18],
        area: { x: 1200, y: 3500, width: 2600, height: 900 },
      },
    ],
    bossSpawn: {
      type: 'storm_walker',
      name: 'Storm Walker Mech-Colossus',
      level: 20,
      pos: { x: 3700, y: 3500 },
    },
  },

  ash_city: {
    id: 'ash_city',
    name: 'Ash City Ruins',
    biome: 'ash_city',
    width: 5500,
    height: 5500,
    landmark: {
      name: 'Shattered Megatower',
      x: 2750,
      y: 1900,
      type: 'collapsed_skyscraper',
    },
    gates: [
      {
        id: 'ac_to_fp',
        name: 'Frostline Highway Ramp',
        x: 500,
        y: 2750,
        radius: 90,
        targetMapId: 'frostline_pass',
        targetGateId: 'fp_to_ac',
      },
    ],
    obstacles: ac.obstacles,
    slowZones: ac.slowZones,
    enemySpawns: [
      {
        type: 'scout_buggy',
        count: 9,
        levelRange: [20, 25],
        area: { x: 1000, y: 1000, width: 3500, height: 3500 },
      },
      {
        type: 'gunner_truck',
        count: 10,
        levelRange: [22, 28],
        area: { x: 1000, y: 1000, width: 3500, height: 3500 },
      },
      {
        type: 'artillery',
        count: 8,
        levelRange: [24, 30],
        area: { x: 1200, y: 1200, width: 3100, height: 3100 },
      },
      {
        type: 'bunker_turret',
        count: 8,
        levelRange: [25, 30],
        area: { x: 1400, y: 1400, width: 2700, height: 2700 },
      },
      {
        type: 'loot_convoy',
        count: 3,
        levelRange: [24, 28],
        area: { x: 1200, y: 3800, width: 3100, height: 1000 },
      },
    ],
    bossSpawn: {
      type: 'fortress_train',
      name: 'Fortress Dreadnought Rail-Titan',
      level: 28,
      pos: { x: 4200, y: 4000 },
    },
  },
};
