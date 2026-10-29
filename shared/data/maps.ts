/**
 * Treadfront - 30 Map Catalog & Portal Graph
 * Pure TypeScript. Shared between Client and Server.
 * 
 * Defines all 30 world zones, biomes, portal topology, safe zones,
 * weather/time-of-day presets, resource nodes, enemy spawn groups,
 * and ground generation parameters.
 */

import {
  BiomeType,
  BossSpawnDef,
  EnemySpawnDef,
  FactionId,
  GateDef,
  GroundGenerationParams,
  MapDef,
  MapColorGrade,
  MapType,
  ResourceNodeDef,
  SafeZone,
  SecretSpotDef,
  WeatherType,
  TimeOfDay,
  OreType,
  DEFAULT_SUN_DIRECTION,
  Vec2,
  vec2,
} from '../types.ts';

export interface MapMetadata {
  id: number;
  key: string;
  nameKey: string;
  name: string;
  region: string;
  levelRange: [number, number];
  type: MapType;
  faction: FactionId;
  biome: BiomeType;
  weather: WeatherType;
  timeOfDay: TimeOfDay;
  sunDirection?: Vec2;
  colorGrade?: MapColorGrade;
  width: number;
  height: number;
  seed: number;
  instanceCapacity: number;
  hubGateId?: string;
  description: string;
}

// ----------------------------------------------------
// Raw Graph Connections (Bidirectional portal graph)
// ----------------------------------------------------
export const MAP_CONNECTIONS: Array<[number, number]> = [
  // Coastal Union Chain
  [1, 2], [2, 3], [3, 4], [4, 14],
  // Highland Union Chain
  [5, 6], [6, 7], [7, 8], [8, 14],
  // Steppe Caravan Chain
  [9, 10], [10, 11], [11, 12], [12, 14],
  // Neutral Middle Chain
  [14, 13],
  [14, 15], [15, 16], [16, 17], [17, 18], [18, 19], [19, 20],
  // Borderlands Gateways
  [15, 21], [17, 22], [19, 23],
  [21, 24], [22, 24], [23, 24],
  // Transition to Endgame
  [20, 25], [24, 25],
  // Endgame Progression Chain
  [25, 26], [26, 27], [27, 28], [28, 29],
  // Arena Portal
  [13, 30],
];

// Helper to calculate gate positions deterministically on map edges
function getGateCoordinate(
  mapWidth: number,
  mapHeight: number,
  sourceId: number,
  targetId: number
): { x: number; y: number } {
  // If targetId > sourceId, place mostly East/South, else West/North
  const diff = targetId - sourceId;
  const margin = 320;
  if (targetId === 30) {
    // Arena portal in hub
    return { x: mapWidth / 2, y: mapHeight / 2 - 500 };
  }
  if (sourceId === 30) {
    return { x: mapWidth / 2, y: mapHeight - margin };
  }

  if (diff > 0) {
    // Going forward (East/South)
    const angle = (targetId * 0.73) % (Math.PI * 0.8) - 0.4;
    return {
      x: mapWidth - margin,
      y: Math.max(margin, Math.min(mapHeight - margin, mapHeight / 2 + Math.sin(angle) * (mapHeight * 0.35))),
    };
  } else {
    // Going backward (West/North)
    const angle = (targetId * 0.73) % (Math.PI * 0.8) - 0.4;
    return {
      x: margin,
      y: Math.max(margin, Math.min(mapHeight - margin, mapHeight / 2 + Math.sin(angle) * (mapHeight * 0.35))),
    };
  }
}

// ----------------------------------------------------
// 30 Map Master Definitions
// ----------------------------------------------------
export const MAP_METADATA_TABLE: Record<number, MapMetadata> = {
  1: {
    id: 1,
    key: 'gravel_bay',
    nameKey: 'map_gravel_bay',
    name: 'Gravel Bay',
    region: 'Coastal Union',
    levelRange: [1, 5],
    type: 'HOME',
    faction: 'coastal_union',
    biome: 'coastal',
    weather: 'clear',
    timeOfDay: 'noon',
    sunDirection: { x: -0.65, y: -0.76 },
    colorGrade: { r: 255, g: 239, b: 218, a: 0.035 },
    width: 4000,
    height: 4000,
    seed: 101,
    instanceCapacity: 100,
    description: 'Home anchorage of the Coastal Union. Gentle tides and sandy gravel flats.',
  },
  2: {
    id: 2,
    key: 'dune_path',
    nameKey: 'map_dune_path',
    name: 'Dune Path',
    region: 'Coastal Union',
    levelRange: [3, 8],
    type: 'PVE',
    faction: 'coastal_union',
    biome: 'coastal',
    weather: 'clear',
    timeOfDay: 'dawn',
    width: 4200,
    height: 4200,
    seed: 102,
    instanceCapacity: 100,
    description: 'Rolling coastal sand dunes patrolled by scavenger buggies.',
  },
  3: {
    id: 3,
    key: 'salt_marsh',
    nameKey: 'map_salt_marsh',
    name: 'Salt Marsh',
    region: 'Coastal Union',
    levelRange: [6, 12],
    type: 'PVE',
    faction: 'coastal_union',
    biome: 'marsh',
    weather: 'fog',
    timeOfDay: 'dusk',
    sunDirection: { x: -0.9, y: -0.3 },
    colorGrade: { r: 187, g: 220, b: 207, a: 0.04 },
    width: 4400,
    height: 4400,
    seed: 103,
    instanceCapacity: 100,
    description: 'Brackish wetlands where vehicles wade through slowing water channels.',
  },
  4: {
    id: 4,
    key: 'lighthouse_cape',
    nameKey: 'map_lighthouse_cape',
    name: 'Lighthouse Cape',
    region: 'Coastal Union',
    levelRange: [10, 15],
    type: 'PVE',
    faction: 'coastal_union',
    biome: 'coastal',
    weather: 'rain',
    timeOfDay: 'sunset',
    width: 4500,
    height: 4500,
    seed: 104,
    instanceCapacity: 100,
    description: 'Towering lighthouse promontory guarding the tunnel to Crossfield.',
  },

  5: {
    id: 5,
    key: 'birch_vale',
    nameKey: 'map_birch_vale',
    name: 'Birch Vale',
    region: 'Highland Union',
    levelRange: [1, 5],
    type: 'HOME',
    faction: 'highland_union',
    biome: 'highland',
    weather: 'clear',
    timeOfDay: 'noon',
    width: 4000,
    height: 4000,
    seed: 105,
    instanceCapacity: 100,
    description: 'Home base of the Highland Union nestled in dense birch groves and granite hills.',
  },
  6: {
    id: 6,
    key: 'quarry_valley',
    nameKey: 'map_quarry_valley',
    name: 'Quarry Valley',
    region: 'Highland Union',
    levelRange: [3, 8],
    type: 'PVE',
    faction: 'highland_union',
    biome: 'highland',
    weather: 'clear',
    timeOfDay: 'noon',
    width: 4200,
    height: 4200,
    seed: 106,
    instanceCapacity: 100,
    description: 'Old industrial open-pit stone quarry filled with iron ore veins.',
  },
  7: {
    id: 7,
    key: 'mist_forest',
    nameKey: 'map_mist_forest',
    name: 'Mist Forest',
    region: 'Highland Union',
    levelRange: [6, 12],
    type: 'PVE',
    faction: 'highland_union',
    biome: 'highland',
    weather: 'fog',
    timeOfDay: 'dawn',
    colorGrade: { r: 255, g: 220, b: 173, a: 0.035 },
    width: 4400,
    height: 4400,
    seed: 107,
    instanceCapacity: 100,
    description: 'A dense highland pine forest blanketed in permanent mountain fog.',
  },
  8: {
    id: 8,
    key: 'eagle_pass',
    nameKey: 'map_eagle_pass',
    name: 'Eagle Pass',
    region: 'Highland Union',
    levelRange: [10, 15],
    type: 'PVE',
    faction: 'highland_union',
    biome: 'highland',
    weather: 'storm',
    timeOfDay: 'sunset',
    colorGrade: { r: 255, g: 190, b: 154, a: 0.03 },
    width: 4500,
    height: 4500,
    seed: 108,
    instanceCapacity: 100,
    description: 'A fortified mountain gap connecting the Highlands to the central plains.',
  },

  9: {
    id: 9,
    key: 'wheat_sea',
    nameKey: 'map_wheat_sea',
    name: 'Wheat Sea',
    region: 'Steppe Caravan',
    levelRange: [1, 5],
    type: 'HOME',
    faction: 'steppe_caravan',
    biome: 'steppe',
    weather: 'clear',
    timeOfDay: 'noon',
    width: 4000,
    height: 4000,
    seed: 109,
    instanceCapacity: 100,
    description: 'Home base of the Steppe Caravan. Vast golden grain fields and trade depots.',
  },
  10: {
    id: 10,
    key: 'copper_canyon',
    nameKey: 'map_copper_canyon',
    name: 'Copper Canyon',
    region: 'Steppe Caravan',
    levelRange: [3, 8],
    type: 'PVE',
    faction: 'steppe_caravan',
    biome: 'canyon',
    weather: 'clear',
    timeOfDay: 'sunset',
    width: 4200,
    height: 4200,
    seed: 110,
    instanceCapacity: 100,
    description: 'Winding reddish canyon beds rich in raw copper deposit clusters.',
  },
  11: {
    id: 11,
    key: 'salt_pans',
    nameKey: 'map_salt_pans',
    name: 'Salt Pans',
    region: 'Steppe Caravan',
    levelRange: [6, 12],
    type: 'PVE',
    faction: 'steppe_caravan',
    biome: 'steppe',
    weather: 'sandstorm',
    timeOfDay: 'noon',
    width: 4400,
    height: 4400,
    seed: 111,
    instanceCapacity: 100,
    description: 'Blinding white salt flats where dust devils sweep across the terrain.',
  },
  12: {
    id: 12,
    key: 'windmill_plateau',
    nameKey: 'map_windmill_plateau',
    name: 'Windmill Plateau',
    region: 'Steppe Caravan',
    levelRange: [10, 15],
    type: 'PVE',
    faction: 'steppe_caravan',
    biome: 'steppe',
    weather: 'clear',
    timeOfDay: 'dawn',
    width: 4500,
    height: 4500,
    seed: 112,
    instanceCapacity: 100,
    description: 'High windswept mesa dotted with power generators and convoy hubs.',
  },

  13: {
    id: 13,
    key: 'crossfield',
    nameKey: 'map_crossfield',
    name: 'Crossfield Hub',
    region: 'Neutral Middle',
    levelRange: [1, 100],
    type: 'HUB',
    faction: 'neutral',
    biome: 'valley',
    weather: 'clear',
    timeOfDay: 'noon',
    width: 5000,
    height: 5000,
    seed: 113,
    instanceCapacity: 100,
    description: 'The great central safe city. Full workshop, auction house, and arena portal.',
  },
  14: {
    id: 14,
    key: 'green_crossing',
    nameKey: 'map_green_crossing',
    name: 'Green Crossing',
    region: 'Neutral Middle',
    levelRange: [15, 22],
    type: 'PVE',
    faction: 'neutral',
    biome: 'valley',
    weather: 'clear',
    timeOfDay: 'noon',
    sunDirection: { x: -0.2, y: -0.98 },
    width: 4500,
    height: 4500,
    seed: 114,
    instanceCapacity: 100,
    description: 'Major arterial transit junction where supply convoys regularly move.',
  },
  15: {
    id: 15,
    key: 'river_delta',
    nameKey: 'map_river_delta',
    name: 'River Delta',
    region: 'Neutral Middle',
    levelRange: [18, 26],
    type: 'PVE',
    faction: 'neutral',
    biome: 'marsh',
    weather: 'rain',
    timeOfDay: 'dusk',
    width: 4800,
    height: 4800,
    seed: 115,
    instanceCapacity: 100,
    description: 'Sprawling river braids and muddy shallows that slow ground traction.',
  },
  16: {
    id: 16,
    key: 'red_canyon',
    nameKey: 'map_red_canyon',
    name: 'Red Canyon',
    region: 'Neutral Middle',
    levelRange: [22, 30],
    type: 'PVE',
    faction: 'neutral',
    biome: 'canyon',
    weather: 'clear',
    timeOfDay: 'sunset',
    width: 4800,
    height: 4800,
    seed: 116,
    instanceCapacity: 100,
    description: 'High ochre cliffs where entrenched enemy artillery batteries shell the roads.',
  },
  17: {
    id: 17,
    key: 'frost_border',
    nameKey: 'map_frost_border',
    name: 'Frost Border',
    region: 'Neutral Middle',
    levelRange: [26, 34],
    type: 'PVE',
    faction: 'neutral',
    biome: 'snow',
    weather: 'snowstorm',
    timeOfDay: 'dawn',
    width: 5000,
    height: 5000,
    seed: 117,
    instanceCapacity: 100,
    description: 'Freezing mountain foothills plagued by fierce blizzard whiteouts.',
  },
  18: {
    id: 18,
    key: 'glacier_lakes',
    nameKey: 'map_glacier_lakes',
    name: 'Glacier Lakes',
    region: 'Neutral Middle',
    levelRange: [30, 38],
    type: 'PVE',
    faction: 'neutral',
    biome: 'snow',
    weather: 'clear',
    timeOfDay: 'noon',
    width: 5000,
    height: 5000,
    seed: 118,
    instanceCapacity: 100,
    description: 'Crystal blue glacial ponds and thin frozen ice sheets that hamper mobility.',
  },
  19: {
    id: 19,
    key: 'old_highway',
    nameKey: 'map_old_highway',
    name: 'Old Highway',
    region: 'Neutral Middle',
    levelRange: [34, 42],
    type: 'PVE',
    faction: 'neutral',
    biome: 'valley',
    weather: 'rain',
    timeOfDay: 'sunset',
    width: 5200,
    height: 5200,
    seed: 119,
    instanceCapacity: 100,
    description: 'An ancient cracked multilane highway where the roaming World Boss appears.',
  },
  20: {
    id: 20,
    key: 'glowworm_swamp',
    nameKey: 'map_glowworm_swamp',
    name: 'Glowworm Swamp',
    region: 'Neutral Middle',
    levelRange: [38, 46],
    type: 'PVE',
    faction: 'neutral',
    biome: 'marsh',
    weather: 'fog',
    timeOfDay: 'night',
    colorGrade: { r: 143, g: 166, b: 213, a: 0.035 },
    width: 5200,
    height: 5200,
    seed: 120,
    instanceCapacity: 100,
    description: 'Eerie night marsh with luminescent spores and rare equipment salvages.',
  },

  21: {
    id: 21,
    key: 'bridgehead',
    nameKey: 'map_bridgehead',
    name: 'Bridgehead Alpha',
    region: 'PvP Borderlands',
    levelRange: [25, 100],
    type: 'PVP',
    faction: 'neutral',
    biome: 'canyon',
    weather: 'clear',
    timeOfDay: 'dusk',
    width: 5200,
    height: 5200,
    seed: 121,
    instanceCapacity: 100,
    description: 'Contested suspension bridgehead over the canyon abyss. Faction PvP active.',
  },
  22: {
    id: 22,
    key: 'customs_station',
    nameKey: 'map_customs_station',
    name: 'Customs Station',
    region: 'PvP Borderlands',
    levelRange: [30, 100],
    type: 'PVP',
    faction: 'neutral',
    biome: 'ruins',
    weather: 'fog',
    timeOfDay: 'dawn',
    width: 5400,
    height: 5400,
    seed: 122,
    instanceCapacity: 100,
    description: 'Fortified border checkpoint with watchtowers and contested capture points.',
  },
  23: {
    id: 23,
    key: 'ashfield',
    nameKey: 'map_ashfield',
    name: 'Ashfield',
    region: 'PvP Borderlands',
    levelRange: [40, 100],
    type: 'PVP',
    faction: 'neutral',
    biome: 'ash',
    weather: 'ashfall',
    timeOfDay: 'sunset',
    width: 5400,
    height: 5400,
    seed: 123,
    instanceCapacity: 100,
    description: 'Dense volcanic ash plains holding extremely rich titanium and crystal veins.',
  },
  24: {
    id: 24,
    key: 'no_mans_land',
    nameKey: 'map_no_mans_land',
    name: "No Man's Land",
    region: 'PvP Borderlands',
    levelRange: [50, 100],
    type: 'PVP',
    faction: 'neutral',
    biome: 'ruins',
    weather: 'storm',
    timeOfDay: 'night',
    sunDirection: { x: 0.4, y: -0.92 },
    width: 5600,
    height: 5600,
    seed: 124,
    instanceCapacity: 100,
    description: 'Cratered battleground of the weekly Faction War over control points.',
  },

  25: {
    id: 25,
    key: 'ruined_city_vaelmar',
    nameKey: 'map_ruined_city_vaelmar',
    name: 'Ruined City Vaelmar',
    region: 'Endgame',
    levelRange: [60, 70],
    type: 'ENDGAME',
    faction: 'neutral',
    biome: 'ruins',
    weather: 'ashfall',
    timeOfDay: 'dusk',
    width: 5600,
    height: 5600,
    seed: 125,
    instanceCapacity: 100,
    description: 'A fallen high-tech metropolis with shattered skyscrapers and elite mechs.',
  },
  26: {
    id: 26,
    key: 'obsidian_desert',
    nameKey: 'map_obsidian_desert',
    name: 'Obsidian Desert',
    region: 'Endgame',
    levelRange: [65, 75],
    type: 'ENDGAME',
    faction: 'neutral',
    biome: 'desert',
    weather: 'sandstorm',
    timeOfDay: 'noon',
    width: 5600,
    height: 5600,
    seed: 126,
    instanceCapacity: 100,
    description: 'Glossy black glass sand dunes battered by violent silica sandstorms.',
  },
  27: {
    id: 27,
    key: 'storm_coast',
    nameKey: 'map_storm_coast',
    name: 'Storm Coast',
    region: 'Endgame',
    levelRange: [70, 80],
    type: 'ENDGAME',
    faction: 'neutral',
    biome: 'coastal',
    weather: 'storm',
    timeOfDay: 'night',
    width: 5800,
    height: 5800,
    seed: 127,
    instanceCapacity: 100,
    description: 'Raging typhoon cliffs with random lightning strikes and the Colossus Boss.',
  },
  28: {
    id: 28,
    key: 'iron_crown',
    nameKey: 'map_iron_crown',
    name: 'Iron Crown',
    region: 'Endgame',
    levelRange: [80, 90],
    type: 'ENDGAME',
    faction: 'neutral',
    biome: 'volcanic',
    weather: 'ashfall',
    timeOfDay: 'sunset',
    width: 5800,
    height: 5800,
    seed: 128,
    instanceCapacity: 100,
    description: 'Ring of molten iron foundries and defensive gate bunkers.',
  },
  29: {
    id: 29,
    key: 'burning_valley',
    nameKey: 'map_burning_valley',
    name: 'The Burning Valley',
    region: 'Endgame',
    levelRange: [90, 100],
    type: 'ENDGAME',
    faction: 'neutral',
    biome: 'volcanic',
    weather: 'ashfall',
    timeOfDay: 'night',
    width: 6000,
    height: 6000,
    seed: 129,
    instanceCapacity: 100,
    description: 'Peak endgame Caldera where the most legendary war machines prowl.',
  },

  30: {
    id: 30,
    key: 'the_pit',
    nameKey: 'map_the_pit',
    name: 'The Pit Arena',
    region: 'Arena',
    levelRange: [1, 100],
    type: 'ARENA',
    faction: 'neutral',
    biome: 'arena',
    weather: 'clear',
    timeOfDay: 'noon',
    width: 3200,
    height: 3200,
    seed: 130,
    instanceCapacity: 100,
    description: 'Enclosed gladiator battleground for ranked 1v1, 3v3, and 5v5 matches.',
  },
};

// ----------------------------------------------------
// Generate Full MapDef Objects (Deterministic)
// ----------------------------------------------------
export function generateMapCatalog(): Record<number, MapDef> {
  const catalog: Record<number, MapDef> = {};

  for (let id = 1; id <= 30; id++) {
    const meta = MAP_METADATA_TABLE[id];
    if (!meta) continue;

    // 1. Safe Zones
    const safeZones: SafeZone[] = [];
    if (meta.type === 'HOME' || meta.type === 'HUB') {
      safeZones.push({
        name: `${meta.name} Safe Perimeter`,
        x: meta.width / 2,
        y: meta.height / 2,
        radius: meta.type === 'HUB' ? 650 : 450,
        repairRate: 0.25,
        faction: meta.faction,
      });
    }

    // 2. Portals connected to this map
    const gates: GateDef[] = [];
    const connectedPairs = MAP_CONNECTIONS.filter(([a, b]) => a === id || b === id);

    for (const [a, b] of connectedPairs) {
      const targetId = a === id ? b : a;
      const targetMeta = MAP_METADATA_TABLE[targetId];
      if (!targetMeta) continue;

      const pos = getGateCoordinate(meta.width, meta.height, id, targetId);
      const targetSpawn = getGateCoordinate(targetMeta.width, targetMeta.height, targetId, id);
      // Spawn slightly offset from target gate center to prevent instant loop
      const spawnPoint = {
        x: targetSpawn.x > targetMeta.width / 2 ? targetSpawn.x - 140 : targetSpawn.x + 140,
        y: targetSpawn.y > targetMeta.height / 2 ? targetSpawn.y - 140 : targetSpawn.y + 140,
      };

      gates.push({
        id: `gate_${id}_to_${targetId}`,
        name: `Gate to ${targetMeta.name}`,
        x: pos.x,
        y: pos.y,
        radius: 100,
        targetMapId: targetId,
        spawnPoint,
        targetGateId: `gate_${targetId}_to_${id}`,
        minLevel: targetMeta.levelRange[0],
        safeZoneRadius: 400, // Section 6: every portal has a 400-unit safe zone radius!
      });

      // Also add portal safe zone circle
      safeZones.push({
        name: `Gate to ${targetMeta.name} Buffer`,
        x: pos.x,
        y: pos.y,
        radius: 400,
        repairRate: 0.15,
        faction: 'neutral',
      });
    }

    // 3. Resource Nodes (Iron, Copper, Titanium, Crystal)
    const resourceNodes: ResourceNodeDef[] = [];
    const oreTypesForMap = getOreTypesForLevel(meta.levelRange[0]);
    const nodeCount = meta.type === 'HUB' || meta.type === 'ARENA' ? 0 : 12;

    for (let i = 0; i < nodeCount; i++) {
      const angle = (i / nodeCount) * Math.PI * 2 + (meta.seed * 0.17);
      const distFromCenter = 700 + ((i * 193 + meta.seed * 37) % (Math.floor(meta.width * 0.38)));
      const oreType = oreTypesForMap[i % oreTypesForMap.length];
      const maxOre = 50 + (meta.id * 8);

      resourceNodes.push({
        id: `ore_${id}_${i}`,
        type: oreType,
        x: meta.width / 2 + Math.cos(angle) * distFromCenter,
        y: meta.height / 2 + Math.sin(angle) * distFromCenter,
        radius: 28,
        maxOre,
        currentOre: maxOre,
        respawnSeconds: 90,
      });
    }

    // 4. Explorer Secrets / Landmarks
    const secrets: SecretSpotDef[] = [
      {
        id: `secret_${id}_1`,
        name: `${meta.name} Signal Tower`,
        x: meta.width * 0.25,
        y: meta.height * 0.25,
        description: `Discovered ancient monitoring equipment overlooking ${meta.name}.`,
        rewardXp: 150 * meta.id,
      },
      {
        id: `secret_${id}_2`,
        name: `${meta.name} Supply Cache`,
        x: meta.width * 0.75,
        y: meta.height * 0.75,
        description: `Unearthed buried container with military grade spare parts.`,
        rewardXp: 200 * meta.id,
      },
    ];

    // 5. Loot Spots
    const lootSpots: Array<{ x: number; y: number; tier: number }> = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + (id * 0.31);
      lootSpots.push({
        x: meta.width / 2 + Math.cos(a) * (500 + i * 140),
        y: meta.height / 2 + Math.sin(a) * (500 + i * 140),
        tier: Math.max(1, Math.min(10, Math.ceil(meta.id / 3))),
      });
    }

    // 6. Enemy Spawns (scaled to map level)
    const enemySpawns: EnemySpawnDef[] = [];
    if (meta.type !== 'HUB' && meta.type !== 'ARENA') {
      const minLvl = meta.levelRange[0];
      const maxLvl = meta.levelRange[1];

      // Buggies
      enemySpawns.push({
        type: 'scout_buggy',
        area: { x: 500, y: 500, width: meta.width - 1000, height: meta.height - 1000 },
        count: 7,
        levelRange: [minLvl, Math.min(maxLvl, minLvl + 2)],
        respawnSeconds: 25,
      });

      // Gunner Trucks
      enemySpawns.push({
        type: 'gunner_truck',
        area: { x: 700, y: 700, width: meta.width - 1400, height: meta.height - 1400 },
        count: 6,
        levelRange: [Math.min(maxLvl, minLvl + 1), maxLvl],
        respawnSeconds: 30,
      });

      // Bunkers / Artillery
      if (meta.id >= 4) {
        enemySpawns.push({
          type: 'bunker_turret',
          area: { x: 800, y: 800, width: meta.width - 1600, height: meta.height - 1600 },
          count: 4,
          levelRange: [minLvl + 1, maxLvl],
          respawnSeconds: 40,
        });
      }
      if (meta.id >= 8) {
        enemySpawns.push({
          type: 'artillery',
          area: { x: 900, y: 900, width: meta.width - 1800, height: meta.height - 1800 },
          count: 3,
          levelRange: [minLvl + 2, maxLvl],
          respawnSeconds: 35,
        });
      }
      if (meta.id >= 3) {
        enemySpawns.push({
          type: 'loot_convoy',
          area: { x: 800, y: meta.height - 1200, width: meta.width - 1600, height: 600 },
          count: 2,
          levelRange: [minLvl, maxLvl],
          respawnSeconds: 45,
        });
      }
    }

    // 7. Boss Spawn (Maps 4, 8, 12, 19, 27, etc.)
    let bossSpawn: BossSpawnDef | undefined;
    if (meta.id === 4) {
      bossSpawn = {
        name: 'Garrison Fortress Warden',
        level: 15,
        pos: { x: meta.width / 2 + 600, y: meta.height / 2 - 400 },
        respawnSeconds: 180,
        phases: 2,
      };
    } else if (meta.id === 8) {
      bossSpawn = {
        name: 'Highland Ridge Colossus',
        level: 16,
        pos: { x: meta.width / 2 + 500, y: meta.height / 2 + 500 },
        respawnSeconds: 180,
        phases: 2,
      };
    } else if (meta.id === 12) {
      bossSpawn = {
        name: 'Dune Sovereign Titan',
        level: 16,
        pos: { x: meta.width / 2 - 500, y: meta.height / 2 + 400 },
        respawnSeconds: 180,
        phases: 2,
      };
    } else if (meta.id === 19) {
      // World Boss
      bossSpawn = {
        name: 'Highway Dreadnought Alpha',
        level: 42,
        pos: { x: meta.width / 2, y: meta.height / 2 },
        respawnSeconds: 360,
        phases: 3,
      };
    } else if (meta.id === 27) {
      // World Boss
      bossSpawn = {
        name: 'Storm Walker Rail-Titan',
        level: 80,
        pos: { x: meta.width / 2 + 400, y: meta.height / 2 - 300 },
        respawnSeconds: 360,
        phases: 3,
      };
    }

    // 8. Ground & Obstacle Generation Params
    const groundParams = getGroundParamsForBiome(meta.biome);

    catalog[id] = {
      id,
      numericId: id,
      key: meta.key,
      nameKey: meta.nameKey,
      name: meta.name,
      levelRange: meta.levelRange,
      biome: meta.biome,
      width: meta.width,
      height: meta.height,
      type: meta.type,
      faction: meta.faction,
      weather: meta.weather,
      timeOfDay: meta.timeOfDay,
      sunDirection: meta.sunDirection ?? DEFAULT_SUN_DIRECTION,
      colorGrade: meta.colorGrade,
      instanceCapacity: meta.instanceCapacity,
      seed: meta.seed,
      safeZones,
      gates,
      obstacles: [], // Populated deterministically by mapGenerator
      resourceNodes,
      lootSpots,
      secrets,
      enemySpawns,
      bossSpawn,
      groundParams,
    };
  }

  return catalog;
}

function getOreTypesForLevel(level: number): OreType[] {
  if (level < 15) return ['iron', 'copper'];
  if (level < 35) return ['iron', 'copper', 'titanium'];
  if (level < 60) return ['copper', 'titanium', 'crystal'];
  return ['titanium', 'crystal'];
}

function getGroundParamsForBiome(biome: BiomeType): GroundGenerationParams {
  switch (biome) {
    case 'coastal':
      return {
        baseColor: '#3d7a46',
        accentColor: '#4f945b',
        roadColor: '#c2b280',
        waterColor: '#2b6cb0',
        treeCount: 50,
        rockCount: 40,
        ruinCount: 10,
        hasRiver: true,
        riverY: 1300,
        hasRoad: true,
      };
    case 'highland':
      return {
        baseColor: '#3a6639',
        accentColor: '#52824b',
        roadColor: '#8a7d65',
        waterColor: '#3182ce',
        treeCount: 75,
        rockCount: 65,
        ruinCount: 15,
        hasRiver: false,
        hasRoad: true,
      };
    case 'steppe':
      return {
        baseColor: '#8b8346',
        accentColor: '#a89f58',
        roadColor: '#b89f6b',
        waterColor: '#3182ce',
        treeCount: 20,
        rockCount: 35,
        ruinCount: 8,
        hasRiver: false,
        hasRoad: true,
      };
    case 'canyon':
      return {
        baseColor: '#8c5836',
        accentColor: '#aa6b42',
        roadColor: '#5c3922',
        waterColor: '#2c5282',
        treeCount: 10,
        rockCount: 80,
        ruinCount: 12,
        hasRiver: false,
        hasRoad: true,
      };
    case 'snow':
      return {
        baseColor: '#cfd8dc',
        accentColor: '#eceff1',
        roadColor: '#90a4ae',
        waterColor: '#4299e1',
        treeCount: 60,
        rockCount: 50,
        ruinCount: 10,
        hasRiver: true,
        riverY: 1800,
        hasRoad: true,
      };
    case 'marsh':
      return {
        baseColor: '#2d4a3e',
        accentColor: '#3f5e50',
        roadColor: '#4a3b2c',
        waterColor: '#1a365d',
        treeCount: 45,
        rockCount: 30,
        ruinCount: 15,
        hasRiver: true,
        riverY: 1500,
        hasRoad: false,
      };
    case 'desert':
      return {
        baseColor: '#9c7a4b',
        accentColor: '#b8935e',
        roadColor: '#7a5a30',
        waterColor: '#2b6cb0',
        treeCount: 5,
        rockCount: 55,
        ruinCount: 20,
        hasRiver: false,
        hasRoad: true,
      };
    case 'ash':
    case 'volcanic':
      return {
        baseColor: '#383838',
        accentColor: '#4a4a4a',
        roadColor: '#262626',
        waterColor: '#dd6b20', // Lava / acidic runoffs
        treeCount: 0,
        rockCount: 75,
        ruinCount: 40,
        hasRiver: false,
        hasRoad: true,
      };
    case 'ruins':
      return {
        baseColor: '#424242',
        accentColor: '#545454',
        roadColor: '#2b2b2b',
        waterColor: '#2d3748',
        treeCount: 15,
        rockCount: 30,
        ruinCount: 65,
        hasRiver: false,
        hasRoad: true,
      };
    case 'arena':
      return {
        baseColor: '#634b35',
        accentColor: '#785b40',
        roadColor: '#4a3625',
        waterColor: '#3182ce',
        treeCount: 0,
        rockCount: 20,
        ruinCount: 16,
        hasRiver: false,
        hasRoad: false,
      };
    default:
      return {
        baseColor: '#437c44',
        accentColor: '#59945a',
        roadColor: '#a38f6b',
        waterColor: '#3182ce',
        treeCount: 45,
        rockCount: 35,
        ruinCount: 10,
        hasRiver: true,
        riverY: 1400,
        hasRoad: true,
      };
  }
}

// Global cached catalog of all 30 maps
export const WORLD_MAP_CATALOG = generateMapCatalog();

// Lookup helper by numeric ID (1-30) or string key (e.g. 'green_valley', 'gravel_bay')
export function getMapById(id: number | string): MapDef {
  if (typeof id === 'number') {
    return WORLD_MAP_CATALOG[id] || WORLD_MAP_CATALOG[1];
  }
  // Lookup by key
  for (const m of Object.values(WORLD_MAP_CATALOG)) {
    if (m.key === id || `map_${m.id}` === id) {
      return m;
    }
  }
  // Fallback for legacy prototype keys
  if (id === 'green_valley') return WORLD_MAP_CATALOG[1];
  if (id === 'canyon_flats') return WORLD_MAP_CATALOG[10];
  if (id === 'frostline_pass') return WORLD_MAP_CATALOG[17];
  if (id === 'ash_city') return WORLD_MAP_CATALOG[25];

  return WORLD_MAP_CATALOG[1];
}

export function getAllMaps(): MapDef[] {
  return Object.values(WORLD_MAP_CATALOG);
}
