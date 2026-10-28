/**
 * Pluggable Asset Layer
 * Reads /assets/manifest.json to only request files that explicitly exist,
 * preventing 404 console spam. Uses Image.onerror as secondary safety fallback.
 * Emits a single informational log at startup.
 */

const TOTAL_EXPECTED_SPRITES = 71;

export class SpriteRegistry {
  private images = new Map<string, HTMLImageElement | null>();
  private allowedFiles = new Set<string>();
  private manifestLoaded = false;
  private pending = new Set<string>();
  private listeners: Array<(path?: string) => void> = [];

  constructor() {
    this.loadManifest();
  }

  public onChange(listener: (path?: string) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(path?: string) {
    for (const listener of this.listeners) {
      listener(path);
    }
  }

  private async loadManifest() {
    if (typeof window === 'undefined') return;
    try {
      const res = await fetch('/assets/manifest.json');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.sprites)) {
          for (const item of data.sprites) {
            this.allowedFiles.add(item);
          }
        }
      }
    } catch {
      // Manifest not reachable, stay empty
    } finally {
      this.manifestLoaded = true;
      const foundCount = this.allowedFiles.size;
      console.info(
        `[Treadfront Art Pipeline] ${foundCount} of ${TOTAL_EXPECTED_SPRITES} sprites found, using vector placeholders`
      );

      // Preload priority assets immediately
      for (const path of this.allowedFiles) {
        this.getImage(path);
      }
    }
  }

  /**
   * Retrieves an image if loaded, or requests it only if present in manifest.
   * Returns null if not in manifest, still loading, or failed (vector fallback will be used).
   */
  public getImage(path: string): HTMLImageElement | null {
    if (!this.manifestLoaded || !this.allowedFiles.has(path)) {
      return null;
    }

    if (this.images.has(path)) {
      return this.images.get(path) || null;
    }

    if (this.pending.has(path)) {
      return null;
    }

    this.pending.add(path);

    if (typeof Image === 'undefined') return null;

    const img = new Image();
    img.onload = () => {
      this.images.set(path, img);
      this.pending.delete(path);
      this.notify(path);
    };
    img.onerror = () => {
      this.images.set(path, null);
      this.pending.delete(path);
    };
    img.src = path;

    return null;
  }

  /** True when the manifest lists the file (it may still be loading). */
  public isListed(path: string): boolean {
    return this.manifestLoaded && this.allowedFiles.has(path);
  }

  public getVehicleBodyPath(tier: number, id: string): string {
    return `/assets/vehicles/${tier}_${id}_body.png`;
  }

  public getVehicleTurretPath(tier: number, id: string): string {
    return `/assets/vehicles/${tier}_${id}_turret.png`;
  }

  public getEnemyPath(kind: string): string {
    return `/assets/enemies/${kind}.png`;
  }

  public getPropPath(id: string): string {
    return id.endsWith('.png') ? `/assets/props/${id}` : `/assets/props/${id}.png`;
  }

  /** Painted landmark scene of a world map (maps 2-30; map 1 keeps its lighthouse). Size in world units. */
  public landmarkScene(numericId: number | undefined): { path: string; size: number } | undefined {
    if (numericId === undefined || numericId === 1) return undefined;
    const path = `/assets/landmarks/map_${String(numericId).padStart(2, '0')}.png`;
    if (!this.isListed(path)) return undefined;
    const size = ({ 13: 1300, 25: 1300, 28: 1100, 30: 900 } as Record<number, number>)[numericId] ?? 1000;
    return { path, size };
  }

  public getLandmarkPath(mapId: string): string {
    return `/assets/landmarks/${mapId}.png`;
  }

  /** Painted base ground per world map (ids of public/assets/ground/*.png). Map 1 (Gravel Bay) uses the pebble beach with the coastal overlays on top. */
  private static readonly GROUND_BY_MAP: Record<number, string> = {
    1: 'river_pebbles', 2: 'dune_sand', 3: 'salt_marsh', 4: 'cliff_turf', 5: 'birch_meadow', 6: 'quarry_slabs', 7: 'mist_forest', 8: 'pass_scree',
    9: 'wheat_stubble', 10: 'copper_canyon', 11: 'salt_flat', 12: 'plateau_grass', 13: 'cobble_square', 14: 'prairie', 15: 'river_delta',
    16: 'red_dust', 17: 'frozen_tundra', 18: 'glacier_shore', 19: 'old_highway', 20: 'glow_swamp', 21: 'bridgehead_dirt', 22: 'customs_apron',
    23: 'ash_field', 24: 'no_mans_land', 25: 'ruin_paving', 26: 'obsidian_sand', 27: 'storm_rock', 28: 'iron_plates', 29: 'burning_ground', 30: 'arena_sand',
  };

  /** Base ground name for a map, or undefined when that map has no painted ground yet. */
  public groundForMap(numericId: number | undefined): string | undefined {
    const g = numericId !== undefined ? SpriteRegistry.GROUND_BY_MAP[numericId] : undefined;
    return g && this.isListed(this.getGroundPath(g)) ? g : undefined;
  }

  public getGroundPath(name: string): string {
    return name.endsWith('.png') ? `/assets/ground/${name}` : `/assets/ground/${name}.png`;
  }

  public getFxPath(id: string): string {
    return id.endsWith('.png') ? `/assets/fx/${id}` : `/assets/fx/${id}.png`;
  }
}

export const spriteRegistry = new SpriteRegistry();

