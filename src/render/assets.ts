/**
 * Pluggable Asset Layer
 * Reads /assets/manifest.json to only request files that explicitly exist,
 * preventing 404 console spam. Uses Image.onerror as secondary safety fallback.
 * Emits a single informational log at startup.
 */

const TOTAL_EXPECTED_SPRITES = 24; // 12 vehicle chassis/turrets + 8 enemies + 4 landmarks

export class SpriteRegistry {
  private images = new Map<string, HTMLImageElement | null>();
  private allowedFiles = new Set<string>();
  private manifestLoaded = false;
  private pending = new Set<string>();

  constructor() {
    this.loadManifest();
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
    };
    img.onerror = () => {
      this.images.set(path, null);
      this.pending.delete(path);
    };
    img.src = path;

    return null;
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
    return `/assets/props/${id}.png`;
  }

  public getLandmarkPath(mapId: string): string {
    return `/assets/landmarks/${mapId}.png`;
  }

  public getGroundPath(mapId: string): string {
    return `/assets/ground/${mapId}.png`;
  }
}

export const spriteRegistry = new SpriteRegistry();
