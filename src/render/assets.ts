/**
 * Pluggable Asset Layer
 * Tries loading raster images from /assets/ paths with silent onerror fallback.
 * Uses new Image() with onerror rather than fetch to avoid HTTP 404 console errors.
 */

export class SpriteRegistry {
  private images = new Map<string, HTMLImageElement | null>();
  private pending = new Set<string>();

  /**
   * Retrieves an image if loaded, or requests it silently.
   * Returns null if not loaded or failed (vector fallback will be used).
   */
  public getImage(path: string): HTMLImageElement | null {
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
      // Silently cache null so we don't try loading repeatedly and fall back to vector drawing
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
