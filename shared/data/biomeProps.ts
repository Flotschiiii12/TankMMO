/**
 * Painted decoration per biome (public/assets/props/{id}.png, see docs/bildprompts-phase3.md prompts 23-26).
 * [id, longest side in world units, collision radius (0 = walk-through decoration), weight]
 */
export type BiomeProp = readonly [id: string, size: number, radius: number, weight: number];

const HIGHLAND: BiomeProp[] = [
  ['hl_birch', 84, 20, 4], ['hl_birch_trio', 112, 32, 2], ['hl_pine', 92, 20, 4], ['hl_fir', 84, 20, 4], ['hl_fern', 48, 0, 4], ['hl_boulder_moss', 64, 26, 2], ['hl_boulder_grey', 64, 26, 2],
  ['hl_stone_blocks', 56, 20, 1], ['hl_quarry_crane', 84, 28, 1], ['hl_mine_cart', 60, 18, 1], ['hl_mountain_hut', 92, 34, 1], ['hl_log_pile', 72, 22, 2], ['hl_mushrooms_red', 40, 0, 2],
  ['hl_watchtower', 72, 28, 1], ['hl_cairn', 30, 0, 2], ['hl_waterfall_pool', 84, 0, 1], ['hl_scree', 100, 0, 2], ['hl_ruin_wall', 92, 24, 1], ['hl_camp_tents', 92, 0, 1],
];
const STEPPE: BiomeProp[] = [
  ['st_wheat_sheaf', 38, 0, 5], ['st_hay_bales', 56, 20, 2], ['st_barn', 112, 38, 1], ['st_windmill', 104, 30, 1], ['st_water_tower', 72, 24, 1], ['st_caravan_wagon', 72, 24, 2],
  ['st_caravan_tent', 84, 28, 1], ['st_sandstone_boulder', 72, 28, 2], ['st_sandstone_pillar', 44, 14, 2], ['st_copper_rock', 62, 24, 2], ['st_thornbush', 62, 0, 3], ['st_tumbleweed', 38, 0, 3],
  ['st_cactus', 42, 14, 2], ['st_salt_crystal', 56, 18, 1], ['st_salt_rake', 52, 0, 1], ['st_dry_well', 46, 18, 1], ['st_windpump', 72, 20, 1], ['st_fence', 100, 0, 2], ['st_camp_bedrolls', 84, 0, 1],
];
const CANYON: BiomeProp[] = [
  ['st_sandstone_boulder', 76, 30, 4], ['st_sandstone_pillar', 48, 16, 4], ['st_copper_rock', 64, 26, 3], ['st_rock_arch', 104, 0, 2], ['st_cactus', 42, 14, 3], ['st_thornbush', 62, 0, 3], ['st_tumbleweed', 38, 0, 3],
];
const VALLEY: BiomeProp[] = [
  ['mt_market_stall', 72, 24, 1], ['mt_crates', 56, 20, 2], ['mt_signpost', 60, 0, 2], ['mt_lamp_post', 40, 0, 2], ['mt_container_trailer', 130, 34, 1], ['mt_fountain', 72, 26, 1],
  ['mt_concrete_barrier', 100, 26, 2], ['mt_bus_wreck', 140, 36, 1], ['mt_overpass_slab', 110, 0, 1], ['mt_oil_drums', 48, 16, 2], ['mt_radio_mast', 64, 0, 1], ['hl_birch', 84, 20, 3], ['hl_fern', 48, 0, 3],
];
const MARSH: BiomeProp[] = [
  ['mt_reed_bed', 84, 0, 5], ['mt_jetty', 120, 0, 1], ['mt_swamp_tree', 104, 28, 4], ['mt_lily_pads', 72, 0, 4], ['mt_glow_mushrooms', 58, 0, 3], ['mt_mangrove_roots', 92, 0, 3], ['mt_crates', 56, 20, 1],
];
const SNOW: BiomeProp[] = [
  ['mt_frost_pine', 92, 22, 5], ['mt_ice_blocks', 72, 24, 3], ['mt_frozen_boulder', 72, 26, 3], ['mt_snow_drift', 84, 0, 4], ['mt_oil_drums', 48, 16, 1], ['mt_radio_mast', 64, 0, 1],
];
const COASTAL: BiomeProp[] = [
  ['hl_boulder_grey', 62, 24, 2], ['hl_cairn', 30, 0, 2], ['hl_fern', 48, 0, 2], ['hl_log_pile', 70, 22, 2], ['mt_reed_bed', 80, 0, 2], ['hl_camp_tents', 90, 0, 1],
];
const ASH: BiomeProp[] = [
  ['eg_dead_tree_burnt', 82, 0, 4], ['eg_ash_pile', 72, 0, 4], ['eg_crater', 92, 0, 3], ['eg_barbed_wire', 76, 0, 2], ['eg_sandbag_bunker', 74, 26, 2], ['eg_tank_trap', 56, 18, 2], ['eg_artillery_wreck', 86, 24, 1], ['eg_supply_crates', 64, 22, 1],
];
const RUINS: BiomeProp[] = [
  ['eg_ruined_tower', 92, 32, 2], ['eg_statue_base', 64, 22, 2], ['eg_arch_gate', 100, 0, 2], ['eg_tank_trap', 56, 18, 3], ['eg_barbed_wire', 76, 0, 2], ['eg_sandbag_bunker', 74, 26, 2],
  ['eg_crater', 92, 0, 2], ['eg_artillery_wreck', 86, 24, 1], ['eg_supply_crates', 64, 22, 1], ['eg_banner_pole', 70, 0, 1], ['eg_dead_tree_bone', 82, 0, 1],
];
const DESERT: BiomeProp[] = [
  ['eg_obsidian_spire', 70, 24, 4], ['eg_glass_boulder', 72, 28, 3], ['eg_dead_tree_bone', 82, 0, 3], ['eg_crater', 92, 0, 2], ['eg_banner_pole', 70, 0, 1],
];
const VOLCANIC: BiomeProp[] = [
  ['eg_iron_wall', 70, 24, 3], ['eg_gear_wheel', 90, 0, 2], ['eg_lava_fissure', 90, 0, 4], ['eg_dead_tree_burnt', 82, 0, 2], ['eg_obsidian_spire', 70, 24, 2], ['eg_crater', 92, 0, 2], ['eg_lightning_mast', 70, 0, 1],
];
const ARENA: BiomeProp[] = [['eg_sandbag_bunker', 74, 26, 1], ['eg_tank_trap', 56, 18, 2], ['eg_barbed_wire', 76, 0, 1]];

export const BIOME_PROPS: Record<string, BiomeProp[]> = {
  highland: HIGHLAND, steppe: STEPPE, canyon: CANYON, valley: VALLEY, marsh: MARSH, snow: SNOW, coastal: COASTAL, ash: ASH, ruins: RUINS, desert: DESERT, volcanic: VOLCANIC, arena: ARENA,
};

/** Map-specific extras on top of the biome list (the sea-stack and lightning masts of the storm coast). */
export const MAP_EXTRA_PROPS: Record<number, BiomeProp[]> = {
  27: [['eg_sea_stack', 96, 36, 4], ['eg_lightning_mast', 70, 0, 3]],
};
