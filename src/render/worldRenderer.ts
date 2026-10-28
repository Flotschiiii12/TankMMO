import { localizeEntityName } from '../i18n.ts';
import { DroneRenderer } from './droneDraw.ts';
import { drawAuras, drawShellTrail } from './combatFx.ts';
import { plateLod, selectThreats } from '../ui/combatLogic.ts';
import { clamp, MapDef, SimEntity, Vec2, dist } from '../sim/types.ts';
import { Camera } from './camera.ts';
import { ParticleSystem } from './particles.ts';
import { spriteRegistry } from './assets.ts';
import {
  drawEnemy,
  drawGate,
  drawLandmark,
  drawLootCrate,
  drawResourceNode,
  drawTelegraph,
  drawVehicle,
} from './vectorDraw.ts';


const CHUNK_SIZE = 1000;

/** Props that lie flat on the ground and cast no shadow. */
const FLAT_PROPS = /(scree|crater|fissure|ash_pile|reed|lily|drift|barbed|glow|waterfall|fern|camp|bedroll|fence|mushroom|rake|overpass|jetty|mangrove|thorn|tumble|wheat|cairn|slab|plant_|harbor_0[3-6])/;

/** Textures whose painted detail is too coarse at 1:1 are tiled smaller. */
const GROUND_TILE_SCALE: Record<string, number> = { river_pebbles: 0.45 };

export class WorldRenderer {
  /** Faction of the local player: players of other factions get red name plates. */
  public viewerFaction?: string;
  /** speech bubbles by player name (emotes), expire at `until` (performance.now) */
  public bubbles = new Map<string, { text: string; until: number }>();

  private camera: Camera;
  private particles: ParticleSystem;

  // Cached offscreen pattern canvases for high performance
  private terrainPatternCanvases = new Map<string, CanvasPattern>();
  private chunkCanvases = new Map<string, HTMLCanvasElement>();

  constructor(camera: Camera, particles: ParticleSystem) {
    this.camera = camera;
    this.particles = particles;

    // The cached chunks only hold the ground: rebuild them when a ground image arrives, not for every prop or vehicle sprite
    spriteRegistry.onChange((path) => {
      if (path && !path.startsWith('/assets/ground/')) return;
      this.chunkCanvases.clear();
      this.terrainPatternCanvases.clear();
    });
  }

  private getChunkCanvas(mapDef: MapDef, cx: number, cy: number): HTMLCanvasElement {
    const key = `${mapDef.id}_${cx}_${cy}`;
    if (this.chunkCanvases.has(key)) {
      return this.chunkCanvases.get(key)!;
    }

    const canvas = document.createElement('canvas');
    canvas.width = CHUNK_SIZE;
    canvas.height = CHUNK_SIZE;
    const cctx = canvas.getContext('2d');
    if (!cctx) return canvas;

    const worldX = cx * CHUNK_SIZE;
    const worldY = cy * CHUNK_SIZE;

    // 1. Base Ground (meadow.png for Green Valley, biome texture for others)
    const baseGroundName = spriteRegistry.groundForMap(mapDef.numericId) ?? (mapDef.biome === 'green_valley' ? 'meadow' : mapDef.biome);
    const baseImg = spriteRegistry.getImage(spriteRegistry.getGroundPath(baseGroundName));
    if (baseImg) {
      const pattern = cctx.createPattern(baseImg, 'repeat');
      if (pattern && typeof DOMMatrix !== 'undefined') {
        const m = new DOMMatrix();
        m.translateSelf(-worldX, -worldY);
        const tile = GROUND_TILE_SCALE[baseGroundName];
        if (tile) m.scaleSelf(tile, tile);
        pattern.setTransform(m);
        cctx.fillStyle = pattern;
      } else {
        cctx.fillStyle = mapDef.biome === 'green_valley' ? '#559445' : '#c7844a';
      }
      cctx.fillRect(0, 0, CHUNK_SIZE, CHUNK_SIZE);
    } else {
      cctx.fillStyle = mapDef.biome === 'green_valley' ? '#559445' : '#c7844a';
      cctx.fillRect(0, 0, CHUNK_SIZE, CHUNK_SIZE);
      // Soft procedural grass tufts
      for (let i = 0; i < 40; i++) {
        const px = ((i * 73 + cx * 101) % CHUNK_SIZE);
        const py = ((i * 127 + cy * 179) % CHUNK_SIZE);
        cctx.fillStyle = i % 2 === 0 ? '#63a352' : '#49833a';
        cctx.beginPath();
        cctx.arc(px, py, 6 + (i % 4) * 3, 0, Math.PI * 2);
        cctx.fill();
      }
    }

    // 2. Green Valley Special Layers: Roads & Shore Blends
    if (mapDef.biome === 'green_valley') {
      // 2a. Shore Transition Layers along the River near y = 1400 + sin(x*0.003)*120
      // Check if chunk vertical range [worldY, worldY + CHUNK_SIZE] intersects river [1250, 1550]
      if (worldY <= 1600 && worldY + CHUNK_SIZE >= 1200) {
        const coastalImg = spriteRegistry.getImage(spriteRegistry.getGroundPath('coastal_grass'));
        const beachImg = spriteRegistry.getImage(spriteRegistry.getGroundPath('beach_sand'));
        const wetImg = spriteRegistry.getImage(spriteRegistry.getGroundPath('wet_sand'));

        const drawRiverBand = (patternImg: HTMLImageElement | null, color: string, lineWidth: number, alpha: number) => {
          cctx.save();
          cctx.globalAlpha = alpha;
          if (patternImg) {
            const p = cctx.createPattern(patternImg, 'repeat');
            if (p && typeof DOMMatrix !== 'undefined') {
              const m = new DOMMatrix();
              m.translateSelf(-worldX, -worldY);
              p.setTransform(m);
              cctx.strokeStyle = p;
            } else {
              cctx.strokeStyle = color;
            }
          } else {
            cctx.strokeStyle = color;
          }

          cctx.lineWidth = lineWidth;
          cctx.lineCap = 'round';
          cctx.lineJoin = 'round';
          cctx.beginPath();
          for (let x = worldX - 100; x <= worldX + CHUNK_SIZE + 100; x += 120) {
            const y = 1400 + Math.sin(x * 0.003) * 120;
            const lx = x - worldX;
            const ly = y - worldY;
            if (x === worldX - 100) cctx.moveTo(lx, ly);
            else cctx.lineTo(lx, ly);
          }
          cctx.stroke();
          cctx.restore();
        };

        // Feathered blend bands: coastal grass (widest) -> beach sand -> wet sand (narrowest near water)
        drawRiverBand(coastalImg, '#78ab5a', 260, 0.85);
        drawRiverBand(beachImg, '#dfcaa0', 190, 0.90);
        drawRiverBand(wetImg, '#a68d66', 135, 0.95);
      }

      // 2b. Gravel Roads: North-South Highway (x=2000), East-West (y=2000), and Spur to Village
      const gravelImg = spriteRegistry.getImage(spriteRegistry.getGroundPath('gravel_road'));
      cctx.save();
      if (gravelImg) {
        const gp = cctx.createPattern(gravelImg, 'repeat');
        if (gp && typeof DOMMatrix !== 'undefined') {
          const m = new DOMMatrix();
          m.translateSelf(-worldX, -worldY);
          gp.setTransform(m);
          cctx.strokeStyle = gp;
        } else {
          cctx.strokeStyle = '#c49a6c';
        }
      } else {
        cctx.strokeStyle = '#c49a6c';
      }

      cctx.lineWidth = 85;
      cctx.lineCap = 'round';
      cctx.lineJoin = 'round';

      // Road 1: North-South (x = 2000)
      if (worldX <= 2100 && worldX + CHUNK_SIZE >= 1900) {
        const lx = 2000 - worldX;
        cctx.beginPath();
        cctx.moveTo(lx, -50);
        cctx.lineTo(lx, CHUNK_SIZE + 50);
        cctx.stroke();
      }

      // Road 2: East-West Highway (y = 2000)
      if (worldY <= 2100 && worldY + CHUNK_SIZE >= 1900) {
        const ly = 2000 - worldY;
        cctx.beginPath();
        cctx.moveTo(-50, ly);
        cctx.lineTo(CHUNK_SIZE + 50, ly);
        cctx.stroke();
      }

      // Road 3: Spur to Northeast Village (from (2000, 2000) to (2700, 1650))
      cctx.beginPath();
      cctx.moveTo(2000 - worldX, 2000 - worldY);
      cctx.lineTo(2700 - worldX, 1650 - worldY);
      cctx.stroke();

      cctx.restore();
    }

    this.chunkCanvases.set(key, canvas);
    return canvas;
  }

  private getTerrainPattern(ctx: CanvasRenderingContext2D, biome: string): CanvasPattern | null {
    if (this.terrainPatternCanvases.has(biome)) {
      return this.terrainPatternCanvases.get(biome) || null;
    }

    if (typeof document === 'undefined') return null;

    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = 256;
    patternCanvas.height = 256;
    const pctx = patternCanvas.getContext('2d');
    if (!pctx) return null;

    // Generate brighter, more beautiful natural procedural terrain tiles
    if (biome === 'green_valley') {
      // Fresh, lush summer green meadow with warm sunlit variations
      pctx.fillStyle = '#559445';
      pctx.fillRect(0, 0, 256, 256);

      // Grass tufts and subtle tone shifts
      for (let i = 0; i < 40; i++) {
        const x = (i * 37) % 256;
        const y = (i * 59) % 256;
        pctx.fillStyle = i % 2 === 0 ? '#63a352' : '#49833a';
        pctx.beginPath();
        pctx.arc(x, y, 6 + (i % 4) * 3, 0, Math.PI * 2);
        pctx.fill();
      }
      // Light grass blades
      pctx.strokeStyle = '#72b660';
      pctx.lineWidth = 1.2;
      for (let i = 0; i < 28; i++) {
        const x = (i * 73) % 250;
        const y = (i * 91) % 250;
        pctx.beginPath();
        pctx.moveTo(x, y);
        pctx.lineTo(x + 2, y - 5);
        pctx.stroke();
      }
    } else if (biome === 'canyon_flats') {
      // Warm sandstone and ochre canyon terrain
      pctx.fillStyle = '#c7844a';
      pctx.fillRect(0, 0, 256, 256);

      for (let i = 0; i < 35; i++) {
        const x = (i * 47) % 256;
        const y = (i * 61) % 256;
        pctx.fillStyle = i % 2 === 0 ? '#d49359' : '#b8753a';
        pctx.beginPath();
        pctx.arc(x, y, 8 + (i % 3) * 4, 0, Math.PI * 2);
        pctx.fill();
      }
      // Sandstone strata lines
      pctx.strokeStyle = '#e0a56d';
      pctx.lineWidth = 1.5;
      for (let y = 30; y < 256; y += 64) {
        pctx.beginPath();
        pctx.moveTo(0, y);
        pctx.lineTo(256, y + 8);
        pctx.stroke();
      }
    } else if (biome === 'frostline_pass') {
      // Crisp pale snow and ice blue
      pctx.fillStyle = '#dbe4ee';
      pctx.fillRect(0, 0, 256, 256);

      for (let i = 0; i < 30; i++) {
        const x = (i * 53) % 256;
        const y = (i * 71) % 256;
        pctx.fillStyle = i % 2 === 0 ? '#e8eff7' : '#c8d7e6';
        pctx.beginPath();
        pctx.arc(x, y, 10 + (i % 3) * 5, 0, Math.PI * 2);
        pctx.fill();
      }
    } else {
      // Ash City: warm grey rubble with orange accents
      pctx.fillStyle = '#4c5058';
      pctx.fillRect(0, 0, 256, 256);

      for (let i = 0; i < 35; i++) {
        const x = (i * 43) % 256;
        const y = (i * 67) % 256;
        pctx.fillStyle = i % 2 === 0 ? '#595d66' : '#3d4047';
        pctx.fillRect(x, y, 12, 10);
      }
    }

    const pattern = ctx.createPattern(patternCanvas, 'repeat');
    if (pattern) {
      this.terrainPatternCanvases.set(biome, pattern);
    }
    return pattern;
  }

  readonly drones = new DroneRenderer();
  /** Accessibility "Reduced effects": no smoke trails, flames or drone beams. */
  reducedEffects = false;
  /** performance mode: no per-chunk detail beyond the chunk image, no grid lines */
  plainGround = false;
  /** colour-blind palette: hostile = amber, friendly = blue (never red / green) */
  colorBlind = false;
  /** HUD scale setting (0.8 - 1.4): name plate text follows it */
  uiScale = 1;
  private localPlayer: SimEntity | null = null;
  /** faction-war control points of the current map (polled from the server every few seconds) */
  warPoints: Array<{ id: string; x: number; y: number; radius: number; owner: string | null; progress: Record<string, number>; contested: boolean }> = [];
  private byId = new Map<number, SimEntity>();

  public render(
    ctx: CanvasRenderingContext2D,
    entities: SimEntity[],
    localPlayer: SimEntity | null,
    mapDef: MapDef,
    time: number
  ) {
    const width = this.camera.viewportWidth;
    const height = this.camera.viewportHeight;

    ctx.clearRect(0, 0, width, height);
    this.localPlayer = localPlayer;

    // 1. Render Natural Ground Texture
    this.renderTerrain(ctx, mapDef);

    // 2. Render River & Bridges (for Green Valley)
    this.renderRiverAndBridges(ctx, mapDef, time);

    // 3. Render Slow Zones (Mud, Water, Snow)
    this.renderSlowZones(ctx, mapDef);

    // 4. Render Safe Zone perimeters
    if (mapDef.safeZones && mapDef.safeZones.length > 0) {
      for (const sz of mapDef.safeZones) {
        this.renderSafeZone(ctx, sz, time);
      }
    } else if (mapDef.safeZone) {
      this.renderSafeZone(ctx, mapDef.safeZone, time);
    }

    for (const p of this.warPoints) this.renderWarPoint(ctx, p, time);

    // 5. Render Tread Marks
    this.particles.renderTreads(ctx, this.camera);

    // 6. Render Gates
    for (const ent of entities) {
      if (ent.kind === 'gate') {
        drawGate(ctx, ent, this.camera, time);
      }
    }

    // 7. Render Resource Nodes
    for (const ent of entities) {
      if (ent.kind === 'resource_node') {
        drawResourceNode(ctx, ent, this.camera, time);
      }
    }

    // 7b. Painted landmark scene on the ground, under the props
    const scene = mapDef.landmark ? spriteRegistry.landmarkScene(mapDef.numericId) : undefined;
    if (scene && mapDef.landmark) {
      const sceneImg = spriteRegistry.getImage(scene.path);
      if (sceneImg) {
        const sp = this.camera.worldToScreen({ x: mapDef.landmark.x, y: mapDef.landmark.y });
        const k = scene.size * this.camera.zoom / Math.max(sceneImg.naturalWidth, sceneImg.naturalHeight);
        const w = sceneImg.naturalWidth * k, h = sceneImg.naturalHeight * k;
        if (sp.x + w / 2 > 0 && sp.x - w / 2 < width && sp.y + h / 2 > 0 && sp.y - h / 2 < height) ctx.drawImage(sceneImg, sp.x - w / 2, sp.y - h / 2, w, h);
      }
    }

    // 8. Render Props (Trees, Rocks, Ruins) with drop shadows and top-left lighting
    this.renderObstacles(ctx, mapDef);

    // 9. Render Landmark
    if (mapDef.landmark && !scene) {
      drawLandmark(ctx, mapDef.landmark, this.camera, time);
    }

    // 10. Render Telegraph Danger Rings
    for (const ent of entities) {
      if (ent.kind === 'telegraph') {
        drawTelegraph(ctx, ent, this.camera);
      }
    }

    // 11. Render Loot Crates
    for (const ent of entities) {
      if (ent.kind === 'loot_crate') {
        drawLootCrate(ctx, ent, this.camera, time);
      }
    }


    // 11. Render Vehicles & Enemies (Culled off-screen)
    for (const ent of entities) {
      if (ent.hull <= 0 && !ent.isWreck) continue;

      // Viewport culling
      const s = this.camera.worldToScreen(ent.pos);
      if (
        s.x < -100 ||
        s.x > width + 100 ||
        s.y < -100 ||
        s.y > height + 100
      ) {
        continue;
      }

      if (ent.kind === 'player' || ent.kind === 'npc_driver') {
        const tier = Math.min(6, Math.max(1, Math.floor(ent.level / 5) + 1));
        drawVehicle(ctx, ent, this.camera, tier, time);
        if (!ent.isWreck) {
          drawAuras(ctx, this.camera, ent, performance.now() / 1000, this.reducedEffects);
          this.renderStatusIcons(ctx, ent);
          this.renderNameplate(ctx, ent);
        }
      } else if (
        ent.kind === 'scout_buggy' ||
        ent.kind === 'gunner_truck' ||
        ent.kind === 'artillery' ||
        ent.kind === 'bunker_turret' ||
        ent.kind === 'loot_convoy' ||
        ent.kind === 'boss'
      ) {
        drawEnemy(ctx, ent, this.camera, time);
        if (!ent.isWreck) {
          drawAuras(ctx, this.camera, ent, performance.now() / 1000, this.reducedEffects);
          this.renderStatusIcons(ctx, ent);
          this.renderNameplate(ctx, ent);
        }
      }
    }

    // 11b. Companion drones (above the vehicles), mines on the ground effects, then beams
    const clock = performance.now() / 1000;
    for (const ent of entities) {
      if (ent.kind === 'mine') this.drones.drawMine(ctx, this.camera, ent, clock);
      else if (ent.drones && ent.hull > 0) this.drones.drawOwner(ctx, this.camera, ent, clock);
    }
    this.drones.drawFx(ctx, this.camera, clock);

    // 12. Render Projectiles (with shell trails)
    this.renderProjectiles(ctx, entities);

    // 13. Render Particles & Floating Damage Numbers
    this.particles.renderParticles(ctx, this.camera);

    // 13b. Target brackets and off-screen threat arrows
    if (localPlayer && localPlayer.hull > 0) {
      this.renderTargetMarker(ctx, entities, localPlayer, time);
      this.renderThreats(ctx, entities, localPlayer);
    }

    // 14. Render Local Player Status (Hull, Armor, Gate Traveling)
    if (localPlayer && localPlayer.hull > 0) {
      this.renderPlayerWorldHUD(ctx, localPlayer);

      // Thin attack range ring around player ONLY while attacking or target locked
      if (localPlayer.targetId !== undefined || localPlayer.autoFire) {
        this.renderPlayerRangeRing(ctx, localPlayer);
      }
    }

    // 15. Target Reticle
    if (localPlayer && localPlayer.targetId !== undefined) {
      const target = entities.find((e) => e.id === localPlayer.targetId);
      if (target && target.hull > 0) {
        this.renderTargetReticle(ctx, target, time);
      }
    }

    // 16. Off-Screen Indicators (Locked Target, Nearest Loot, Gate)
    if (localPlayer && localPlayer.hull > 0) {
      this.renderOffscreenIndicators(ctx, localPlayer, entities, mapDef);
    }

    // 17. Drifting Clouds / Light Weather & Vignette
    this.renderAtmosphere(ctx);
  }

  private renderTerrain(ctx: CanvasRenderingContext2D, mapDef: MapDef) {
    const zoom = this.camera.zoom;

    // 1. Calculate visible chunks covering the current camera viewport
    const halfVw = (this.camera.viewportWidth / 2) / zoom;
    const halfVh = (this.camera.viewportHeight / 2) / zoom;
    const worldLeft = this.camera.pos.x - halfVw;
    const worldRight = this.camera.pos.x + halfVw;
    const worldTop = this.camera.pos.y - halfVh;
    const worldBottom = this.camera.pos.y + halfVh;

    const minCX = Math.max(0, Math.floor(worldLeft / CHUNK_SIZE));
    const maxCX = Math.min(Math.floor(mapDef.width / CHUNK_SIZE), Math.floor(worldRight / CHUNK_SIZE));
    const minCY = Math.max(0, Math.floor(worldTop / CHUNK_SIZE));
    const maxCY = Math.min(Math.floor(mapDef.height / CHUNK_SIZE), Math.floor(worldBottom / CHUNK_SIZE));

    for (let cy = minCY; cy <= maxCY; cy++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const chunkCanvas = this.getChunkCanvas(mapDef, cx, cy);
        const s = this.camera.worldToScreen({ x: cx * CHUNK_SIZE, y: cy * CHUNK_SIZE });
        ctx.drawImage(chunkCanvas, s.x, s.y, CHUNK_SIZE * zoom, CHUNK_SIZE * zoom);
      }
    }

    if (!this.plainGround) this.renderGrid(ctx);

    // World Boundary Perimeter
    const topLeft = this.camera.worldToScreen({ x: 0, y: 0 });
    const bottomRight = this.camera.worldToScreen({ x: mapDef.width, y: mapDef.height });
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
    ctx.lineWidth = 3 * zoom;
    ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  }

  private renderGrid(ctx: CanvasRenderingContext2D) {
    const zoom = this.camera.zoom;
    // Subtle soft world grid
    const gridSize = 160 * zoom;
    const startX = ((this.camera.viewportWidth / 2 - this.camera.pos.x * zoom) % gridSize + gridSize) % gridSize;
    const startY = ((this.camera.viewportHeight / 2 - this.camera.pos.y * zoom) % gridSize + gridSize) % gridSize;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = startX; x < this.camera.viewportWidth; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.camera.viewportHeight);
    }
    for (let y = startY; y < this.camera.viewportHeight; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.camera.viewportWidth, y);
    }
    ctx.stroke();
  }

  private renderRiverAndBridges(ctx: CanvasRenderingContext2D, mapDef: MapDef, time: number) {
    if (mapDef.biome !== 'green_valley') return;

    const zoom = this.camera.zoom;

    // Continuous winding river across map near y = 1400
    ctx.save();

    // Check for shallow_water.png tile texture to animate by scrolling pattern
    const waterImg = spriteRegistry.getImage(spriteRegistry.getGroundPath('shallow_water'));
    if (waterImg) {
      const pattern = ctx.createPattern(waterImg, 'repeat');
      if (pattern && typeof DOMMatrix !== 'undefined') {
        const originX = (this.camera.viewportWidth / 2 - this.camera.pos.x * zoom);
        const originY = (this.camera.viewportHeight / 2 - this.camera.pos.y * zoom);
        const m = new DOMMatrix();
        // Slowly scrolling water ripple tile animation
        m.translateSelf(originX + (time * 18) * zoom, originY + (time * 10) * zoom);
        m.scaleSelf(zoom, zoom);
        pattern.setTransform(m);
        ctx.strokeStyle = pattern;
      } else {
        ctx.strokeStyle = '#38bdf8';
      }
    } else {
      ctx.strokeStyle = '#38bdf8';
    }

    ctx.lineWidth = 90 * zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    for (let x = 0; x <= mapDef.width; x += 150) {
      const y = 1400 + Math.sin(x * 0.003) * 120;
      const s = this.camera.worldToScreen({ x, y });
      if (x === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();

    // Animated water surface caustic ripples
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 2.5 * zoom;
    ctx.setLineDash([14, 24]);
    ctx.lineDashOffset = -time * 45;
    ctx.stroke();

    // Wooden Crossing Bridge at (2000, 1400)
    const bridgeCenter = this.camera.worldToScreen({ x: 2000, y: 1400 });
    const bw = 90 * zoom;
    const bh = 130 * zoom;

    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 6 * zoom;
    ctx.shadowOffsetX = 4 * zoom;
    ctx.shadowOffsetY = 5 * zoom;

    // Bridge planks
    ctx.fillStyle = '#854d0e';
    ctx.fillRect(bridgeCenter.x - bw / 2, bridgeCenter.y - bh / 2, bw, bh);

    // Bridge side railings
    ctx.fillStyle = '#451a03';
    ctx.fillRect(bridgeCenter.x - bw / 2, bridgeCenter.y - bh / 2, 8 * zoom, bh);
    ctx.fillRect(bridgeCenter.x + bw / 2 - 8 * zoom, bridgeCenter.y - bh / 2, 8 * zoom, bh);

    ctx.restore();
  }

  private renderSlowZones(ctx: CanvasRenderingContext2D, mapDef: MapDef) {
    const zoom = this.camera.zoom;
    for (const sz of mapDef.slowZones) {
      const s = this.camera.worldToScreen({ x: sz.x, y: sz.y });
      const r = sz.radius * zoom;

      if (
        s.x < -r ||
        s.x > this.camera.viewportWidth + r ||
        s.y < -r ||
        s.y > this.camera.viewportHeight + r
      ) {
        continue;
      }

      ctx.save();
      if (sz.type === 'water') {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
      } else if (sz.type === 'snow') {
        ctx.fillStyle = 'rgba(240, 249, 255, 0.35)';
      } else {
        // Mud
        ctx.fillStyle = 'rgba(120, 53, 15, 0.3)';
      }
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private renderSafeZone(ctx: CanvasRenderingContext2D, safeZone: { x: number; y: number; radius: number }, time: number) {
    const s = this.camera.worldToScreen({ x: safeZone.x, y: safeZone.y });
    const r = safeZone.radius * this.camera.zoom;
    const zoom = this.camera.zoom;

    ctx.save();

    // Draw /assets/props/home_base.png at safe zone center
    const homeBaseImg = spriteRegistry.getImage(spriteRegistry.getPropPath('home_base'));
    if (homeBaseImg) {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 10 * zoom;
      ctx.shadowOffsetX = 6 * zoom;
      ctx.shadowOffsetY = 8 * zoom;
      const baseSize = 220 * zoom;
      ctx.drawImage(homeBaseImg, s.x - baseSize / 2, s.y - baseSize / 2, baseSize, baseSize);
      ctx.restore();
    }

    // Outer safe perimeter defensive field
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
    ctx.lineWidth = 2.5 * zoom;
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = -time * 15;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(56, 189, 248, 0.05)';
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private renderObstacles(ctx: CanvasRenderingContext2D, mapDef: MapDef) {
    const zoom = this.camera.zoom;

    for (const obs of mapDef.obstacles) {
      const s = this.camera.worldToScreen({ x: obs.x, y: obs.y });
      const r = obs.radius * zoom;

      // Viewport culling
      if (
        s.x < -r - 60 ||
        s.x > this.camera.viewportWidth + r + 60 ||
        s.y < -r - 60 ||
        s.y > this.camera.viewportHeight + r + 60
      ) {
        continue;
      }

      // 1. Check for pluggable prop sprite (/assets/props/ or /assets/fx/)
      if (obs.propId) {
        if (obs.propId === 'fx_12') {
          // Campfire prop with warm pulsating glow aura
          ctx.save();
          ctx.translate(s.x, s.y);
          const pulse = 0.5 + Math.sin(Date.now() * 0.006) * 0.25;
          const auraGrad = ctx.createRadialGradient(0, 0, 5 * zoom, 0, 0, 48 * zoom);
          auraGrad.addColorStop(0, `rgba(251, 146, 60, ${0.45 * pulse})`);
          auraGrad.addColorStop(0.6, `rgba(234, 88, 12, ${0.2 * pulse})`);
          auraGrad.addColorStop(1, 'rgba(234, 88, 12, 0)');
          ctx.fillStyle = auraGrad;
          ctx.beginPath();
          ctx.arc(0, 0, 48 * zoom, 0, Math.PI * 2);
          ctx.fill();

          const fireImg = spriteRegistry.getImage(spriteRegistry.getFxPath('fx_12'));
          if (fireImg) {
            const sz = 34 * zoom;
            ctx.drawImage(fireImg, -sz / 2, -sz / 2, sz, sz);
          } else {
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(0, 0, 12 * zoom, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          continue;
        }

        const propImg = spriteRegistry.getImage(spriteRegistry.getPropPath(obs.propId));
        if (propImg) {
          ctx.save();
          ctx.translate(s.x, s.y);

          let pw = (obs.width || obs.radius * 2.2) * zoom;
          let ph = (obs.height || obs.radius * 2.2) * zoom;
          if (/^(hl|st|mt|eg)_/.test(obs.propId)) {
            // painted biome props keep their own aspect ratio; width is the longest side
            const k = obs.width ? obs.width * zoom / Math.max(propImg.naturalWidth, propImg.naturalHeight) : 1;
            pw = propImg.naturalWidth * k;
            ph = propImg.naturalHeight * k;
          }
          if (obs.type === 'tree') {
            pw = 80 * zoom;
            ph = 80 * zoom;
          } else if (obs.type === 'plant') {
            pw = 36 * zoom;
            ph = 36 * zoom;
          } else if (obs.type === 'harbor') {
            pw = 56 * zoom;
            ph = 56 * zoom;
          }

          // cheap blob shadow (a canvas shadowBlur per prop is far too slow); flat decals get none
          if (!FLAT_PROPS.test(obs.propId)) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
            ctx.beginPath();
            ctx.ellipse(3 * zoom, 5 * zoom, pw * 0.4, ph * 0.36, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.drawImage(propImg, -pw / 2, -ph / 2, pw, ph);
          ctx.restore();
          continue;
        }
      }

      // 2. Procedural Vector Fallback
      ctx.save();
      ctx.translate(s.x, s.y);

      // Soft drop shadow cast to bottom-right
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 6 * zoom;
      ctx.shadowOffsetX = 4 * zoom;
      ctx.shadowOffsetY = 6 * zoom;

      if (obs.type === 'tree') {
        // Multi-layered pine/foliage canopy with top-left sun illumination
        ctx.fillStyle = '#064e3b';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#059669';
        ctx.beginPath();
        ctx.arc(-r * 0.15, -r * 0.15, r * 0.75, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#34d399';
        ctx.beginPath();
        ctx.arc(-r * 0.28, -r * 0.28, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else if (obs.type === 'rock') {
        ctx.fillStyle = '#3f3f46';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#71717a';
        ctx.beginPath();
        ctx.arc(-r * 0.2, -r * 0.2, r * 0.65, 0, Math.PI * 2);
        ctx.fill();
      } else if (obs.type === 'plant') {
        ctx.fillStyle = '#16a34a';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Ruin / Wall / Building
        const w = (obs.width || 80) * zoom;
        const h = (obs.height || 60) * zoom;
        ctx.fillStyle = '#475569';
        ctx.fillRect(-w / 2, -h / 2, w, h);

        ctx.fillStyle = '#64748b';
        ctx.fillRect(-w / 2, -h / 2, w * 0.5, h);
      }

      ctx.restore();
    }
  }

  private renderProjectiles(ctx: CanvasRenderingContext2D, entities: SimEntity[]) {
    const zoom = this.camera.zoom;
    this.byId.clear();
    for (const e of entities) if (e.kind !== 'projectile') this.byId.set(e.id, e);

    for (const proj of entities) {
      if (proj.kind !== 'projectile') continue;
      const s = this.camera.worldToScreen(proj.pos);

      if (
        s.x < -30 ||
        s.x > this.camera.viewportWidth + 30 ||
        s.y < -30 ||
        s.y > this.camera.viewportHeight + 30
      ) {
        continue;
      }

      const shooter = (proj as any).sourceEntityId !== undefined ? this.byId.get((proj as any).sourceEntityId) : undefined;
      drawShellTrail(ctx, this.camera, proj, { family: shooter?.weaponFamily, now: performance.now() / 1000, reduced: this.reducedEffects, smoke: (x, y) => this.particles.emitSmokePuff({ x, y }, 6, 0.45) });
      const isTracer = proj.name === 'MG Tracer' || (proj.radius && proj.radius <= 2);
      const spritePath = spriteRegistry.getFxPath(isTracer ? 'fx_19' : 'fx_18');
      const pImg = spriteRegistry.getImage(spritePath);

      if (pImg) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(proj.chassisAngle);
        const pw = (isTracer ? 18 : 24) * zoom;
        const ph = (isTracer ? 7 : 12) * zoom;
        ctx.drawImage(pImg, -pw / 2, -ph / 2, pw, ph);
        ctx.restore();
        continue;
      }

      // Vector fallback
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(proj.chassisAngle);

      // Trailing glow
      if (proj.selectedAmmo === 'ARMOR_PIERCING') {
        ctx.fillStyle = '#38bdf8';
      } else if ((proj.selectedAmmo === 'EXPLOSIVE' || proj.selectedAmmo === 'SHAPED_CHARGE')) {
        ctx.fillStyle = '#f97316';
      } else {
        ctx.fillStyle = '#fde047';
      }

      const l = 12 * zoom;
      const w = 3.5 * zoom;
      ctx.fillRect(-l / 2, -w / 2, l, w);

      // Trailing shell spark line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-l, 0);
      ctx.lineTo(0, 0);
      ctx.stroke();

      ctx.restore();
    }
  }

  private static readonly STATUS_ICONS = ['slowed', 'burning', 'stunned', 'marked'] as const;

  /** Painted status pictograms in a row above the name plate; plain drawImage, no shadows. Skipped while the sprite is missing. */
  private renderStatusIcons(ctx: CanvasRenderingContext2D, ent: SimEntity) {
    const effects = ent.statusEffects;
    if (!effects || effects.length === 0) return;
    let n = 0;
    const imgs: HTMLImageElement[] = [];
    for (const t of WorldRenderer.STATUS_ICONS) {
      if (!effects.some((e) => e.type === t)) continue;
      const img = spriteRegistry.getImage(`/assets/icons/st_${t}.png`);
      if (img) imgs.push(img);
      if (++n >= 4) break;
    }
    if (imgs.length === 0) return;
    const s = this.camera.worldToScreen(ent.pos);
    const zoom = this.camera.zoom;
    const size = Math.max(14, Math.round(16 * zoom));
    const y = s.y - ent.radius * zoom - 18 - size - 16;
    let x = s.x - (imgs.length * (size + 2) - 2) / 2;
    for (const img of imgs) {
      ctx.drawImage(img, x, y, size, size);
      x += size + 2;
    }
  }

  private renderNameplate(ctx: CanvasRenderingContext2D, ent: SimEntity) {
    if (ent.kind === 'player') return;
    const s = this.camera.worldToScreen(ent.pos);
    const zoom = this.camera.zoom;
    const r = ent.radius * zoom;

    const yOffset = -r - 18;
    const lp = this.localPlayer;
    const isTarget = !!lp && lp.targetId === ent.id;
    const lod = plateLod(ent, lp ? Math.hypot(ent.pos.x - lp.pos.x, ent.pos.y - lp.pos.y) : 0, isTarget);
    if (!lod.name && !lod.bars) return;

    ctx.save();
    ctx.translate(s.x, s.y + yOffset);

    // Guaranteed minimum 11px font
    const fontSize = Math.max(11, Math.round(11 * zoom * this.uiScale));
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';

    const isHostile = ent.isHostile || (String(ent.kind) === 'player' && !!ent.faction && !!this.viewerFaction && ent.faction !== this.viewerFaction);
    const clan = ent.clanTag ? `[${ent.clanTag}] ` : '';
    const label = `${clan}${String(ent.kind) === 'player' ? ent.name : localizeEntityName(ent.name)}`;

    if (lod.name) {
      // Dark stroke outline so text is readable over sunlit grass & snow
      ctx.strokeStyle = '#09090b';
      ctx.lineWidth = 3;
      ctx.strokeText(label, 0, -6);

      ctx.fillStyle = isHostile ? (this.colorBlind ? '#fbbf24' : '#f87171') : '#60a5fa';
      ctx.fillText(label, 0, -6);
    }

    const bubble = this.bubbles.get(ent.name);
    if (bubble && bubble.until > performance.now()) {
      ctx.font = `${Math.max(18, Math.round(22 * zoom))}px sans-serif`;
      ctx.fillStyle = 'rgba(15,23,42,0.85)';
      ctx.fillRect(-20, -48, 40, 30);
      ctx.fillStyle = '#fff';
      ctx.fillText(bubble.text, 0, -25);
    }

    if (!lod.bars) { ctx.restore(); return; }
    // Health & Armor bar
    const barW = Math.max(42, r * 1.6);
    const barH = Math.max(3, 3 * zoom);
    const hpRatio = clamp(ent.hull / ent.maxHull, 0, 1);
    const armorRatio = clamp(ent.armor / Math.max(1, ent.maxArmor), 0, 1);

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(-barW / 2 - 1, -1, barW + 2, barH * 2 + 3);

    // Armor bar (top)
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-barW / 2, 0, barW * armorRatio, barH);

    // Hull bar (bottom)
    ctx.fillStyle = isHostile ? (this.colorBlind ? '#f59e0b' : '#ef4444') : (this.colorBlind ? '#38bdf8' : '#22c55e');
    ctx.fillRect(-barW / 2, barH + 1, barW * hpRatio, barH);

    ctx.restore();
  }

  private static readonly WAR_COLOR: Record<string, string> = { coastal: '#38bdf8', highland: '#4ade80', steppe: '#fbbf24' };
  /** Ground ring of a control point: owner colour, capture progress arc of the leading faction, red dashes while contested. */
  private renderWarPoint(ctx: CanvasRenderingContext2D, p: { x: number; y: number; radius: number; owner: string | null; progress: Record<string, number>; contested: boolean }, time: number) {
    const s = this.camera.worldToScreen(p); const z = this.camera.zoom; const r = p.radius * z;
    if (s.x < -r || s.x > this.camera.viewportWidth + r || s.y < -r || s.y > this.camera.viewportHeight + r) return;
    const owner = p.owner ? WorldRenderer.WAR_COLOR[p.owner] : '#94a3b8';
    ctx.save();
    ctx.fillStyle = owner; ctx.globalAlpha = 0.12; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.85; ctx.strokeStyle = owner; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke();
    let lead: string | undefined; let best = 0;
    for (const [f, v] of Object.entries(p.progress)) if (v > best) { best = v; lead = f; }
    if (lead && best > 0) { ctx.strokeStyle = WorldRenderer.WAR_COLOR[lead]; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.8, -Math.PI / 2, -Math.PI / 2 + (best / 100) * Math.PI * 2); ctx.stroke(); }
    if (p.contested && !this.reducedEffects) { ctx.strokeStyle = '#f87171'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -time * 20; ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.92, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }

  private renderTargetMarker(ctx: CanvasRenderingContext2D, entities: SimEntity[], me: SimEntity, _time: number) {
    if (me.targetId === undefined) return;
    const t = entities.find((e) => e.id === me.targetId);
    if (!t || t.hull <= 0) return;
    const s = this.camera.worldToScreen(t.pos); const z = this.camera.zoom; const q = (t.radius + 10) * z; const c = 7 * z + 3;
    ctx.strokeStyle = this.colorBlind ? '#fbbf24' : '#f87171'; ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) { ctx.moveTo(s.x + sx * q, s.y + sy * (q - c)); ctx.lineTo(s.x + sx * q, s.y + sy * q); ctx.lineTo(s.x + sx * (q - c), s.y + sy * q); }
    ctx.stroke();
  }

  private threatBuf: ReturnType<typeof selectThreats> = [];
  /** Arrows on the screen edge pointing at enemies that attack the player (and the current target) when they are off-screen. */
  private renderThreats(ctx: CanvasRenderingContext2D, entities: SimEntity[], me: SimEntity) {
    const w = this.camera.viewportWidth; const h = this.camera.viewportHeight; const pad = 26;
    const onScreen = (p: { x: number; y: number }) => { const s = this.camera.worldToScreen(p); return s.x > 0 && s.x < w && s.y > 0 && s.y < h; };
    this.threatBuf = selectThreats(me, entities, onScreen);
    if (!this.threatBuf.length) return;
    const cx = w / 2; const cy = h / 2;
    for (const t of this.threatBuf) {
      const dx = Math.cos(t.angle); const dy = Math.sin(t.angle);
      const k = Math.min((cx - pad) / Math.max(1e-6, Math.abs(dx)), (cy - pad) / Math.max(1e-6, Math.abs(dy)));
      const x = cx + dx * k; const y = cy + dy * k;
      const near = Math.max(0, 1 - t.distance / 1600);
      ctx.save(); ctx.translate(x, y); ctx.rotate(t.angle);
      ctx.globalAlpha = 0.55 + 0.4 * near;
      ctx.fillStyle = t.isTarget ? '#fde047' : this.colorBlind ? '#f59e0b' : '#ef4444';
      ctx.strokeStyle = '#09090b'; ctx.lineWidth = 2;
      const sz = 9 + 5 * near;
      ctx.beginPath(); ctx.moveTo(sz, 0); ctx.lineTo(-sz * 0.7, sz * 0.75); ctx.lineTo(-sz * 0.35, 0); ctx.lineTo(-sz * 0.7, -sz * 0.75); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.restore();
    }
  }

  private renderPlayerWorldHUD(ctx: CanvasRenderingContext2D, player: SimEntity) {
    const s = this.camera.worldToScreen(player.pos);
    const zoom = this.camera.zoom;
    const r = player.radius * zoom;

    ctx.save();
    ctx.translate(s.x, s.y + r + 16);

    const barW = Math.max(84, 84 * zoom);
    const barH = Math.max(4, 4 * zoom);

    // Background
    ctx.fillStyle = 'rgba(9, 9, 11, 0.85)';
    ctx.fillRect(-barW / 2 - 2, -2, barW + 4, barH * 2 + 4);

    // Armor Bar
    const armorRatio = clamp(player.armor / player.maxArmor, 0, 1);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-barW / 2, 0, barW * armorRatio, barH);

    // Hull Bar
    const hullRatio = clamp(player.hull / player.maxHull, 0, 1);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(-barW / 2, barH + 1, barW * hullRatio, barH);

    // Readout with dark outline for readability
    const fontSize = Math.max(11, Math.round(10 * zoom));
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';

    const fmtHull = Math.round(player.hull).toLocaleString();
    const fmtArmor = Math.round(player.armor).toLocaleString();
    const readout = `H: ${fmtHull} · A: ${fmtArmor}`;

    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 3;
    ctx.strokeText(readout, 0, barH * 2 + 14);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(readout, 0, barH * 2 + 14);

    // Gate holding traveling indicator
    if (player.gateHoldTimer && player.gateHoldTimer > 0) {
      const pct = Math.min(100, Math.round((player.gateHoldTimer / 3.0) * 100));
      ctx.strokeStyle = '#09090b';
      ctx.lineWidth = 3;
      ctx.strokeText(`Travelling... ${pct}%`, 0, -r * 2 - 16);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`Travelling... ${pct}%`, 0, -r * 2 - 16);
    }

    ctx.restore();
  }

  private renderPlayerRangeRing(ctx: CanvasRenderingContext2D, player: SimEntity) {
    const s = this.camera.worldToScreen(player.pos);
    const r = 700 * this.camera.zoom; // Range 700 units

    ctx.save();
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 12]);
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private renderTargetReticle(ctx: CanvasRenderingContext2D, target: SimEntity, time: number) {
    const s = this.camera.worldToScreen(target.pos);
    const zoom = this.camera.zoom;
    const r = (target.radius + 12) * zoom;

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(time * 1.5);

    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2;

    const bl = 9 * zoom;
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 2);
      ctx.beginPath();
      ctx.moveTo(r, -bl);
      ctx.lineTo(r, 0);
      ctx.lineTo(r - bl, 0);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  private renderOffscreenIndicators(
    ctx: CanvasRenderingContext2D,
    player: SimEntity,
    entities: SimEntity[],
    mapDef: MapDef
  ) {
    const width = this.camera.viewportWidth;
    const height = this.camera.viewportHeight;
    const margin = 26;

    // 1. Locked Target off-screen indicator
    if (player.targetId !== undefined) {
      const target = entities.find((e) => e.id === player.targetId);
      if (target && target.hull > 0) {
        const s = this.camera.worldToScreen(target.pos);
        if (s.x < 0 || s.x > width || s.y < 0 || s.y > height) {
          const d = Math.round(dist(player.pos, target.pos));
          this.drawEdgeArrow(ctx, s, width, height, margin, '#f97316', `🎯 ${d}m`);
        }
      }
    }

    // 2. Nearest Loot Crate off-screen indicator
    let nearestCrate: SimEntity | undefined;
    let minCrateDist = 1400;
    for (const ent of entities) {
      if (ent.kind === 'loot_crate') {
        const d = dist(player.pos, ent.pos);
        if (d < minCrateDist) {
          minCrateDist = d;
          nearestCrate = ent;
        }
      }
    }
    if (nearestCrate) {
      const s = this.camera.worldToScreen(nearestCrate.pos);
      if (s.x < 0 || s.x > width || s.y < 0 || s.y > height) {
        this.drawEdgeArrow(ctx, s, width, height, margin, '#eab308', '📦');
      }
    }

    // 3. Nearest Gate off-screen indicator
    if (mapDef.gates.length > 0) {
      const gate = mapDef.gates[0];
      const s = this.camera.worldToScreen({ x: gate.x, y: gate.y });
      if (s.x < 0 || s.x > width || s.y < 0 || s.y > height) {
        this.drawEdgeArrow(ctx, s, width, height, margin, '#38bdf8', 'GATE');
      }
    }
  }

  private drawEdgeArrow(
    ctx: CanvasRenderingContext2D,
    targetScreenPos: Vec2,
    w: number,
    h: number,
    margin: number,
    color: string,
    label: string
  ) {
    const cx = w / 2;
    const cy = h / 2;
    const dx = targetScreenPos.x - cx;
    const dy = targetScreenPos.y - cy;
    const angle = Math.atan2(dy, dx);

    // Project ray from center to screen edge bounds
    const edgeX = clamp(cx + Math.cos(angle) * (w / 2 - margin), margin, w - margin);
    const edgeY = clamp(cy + Math.sin(angle) * (h / 2 - margin), margin, h - margin);

    ctx.save();
    ctx.translate(edgeX, edgeY);
    ctx.rotate(angle);

    // Chevron arrow
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, -6);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Distance or symbol label
    ctx.save();
    ctx.font = '700 11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 3;
    ctx.strokeText(label, edgeX, edgeY - 10);
    ctx.fillStyle = color;
    ctx.fillText(label, edgeX, edgeY - 10);
    ctx.restore();
  }

  private renderAtmosphere(ctx: CanvasRenderingContext2D) {
    const w = this.camera.viewportWidth;
    const h = this.camera.viewportHeight;

    // Subtle Vignette at Screen Edges
    ctx.save();
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
