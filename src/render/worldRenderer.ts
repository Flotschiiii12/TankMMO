import { clamp, MapDef, SimEntity, Vec2, dist } from '../sim/types.ts';
import { Camera } from './camera.ts';
import { ParticleSystem } from './particles.ts';
import {
  drawEnemy,
  drawGate,
  drawLandmark,
  drawLootCrate,
  drawTelegraph,
  drawVehicle,
} from './vectorDraw.ts';

export class WorldRenderer {
  private camera: Camera;
  private particles: ParticleSystem;

  // Cached offscreen pattern canvases for high performance
  private terrainPatternCanvases = new Map<string, CanvasPattern>();

  constructor(camera: Camera, particles: ParticleSystem) {
    this.camera = camera;
    this.particles = particles;
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

    // 1. Render Natural Ground Texture
    this.renderTerrain(ctx, mapDef);

    // 2. Render River & Bridges (for Green Valley)
    this.renderRiverAndBridges(ctx, mapDef, time);

    // 3. Render Slow Zones (Mud, Water, Snow)
    this.renderSlowZones(ctx, mapDef);

    // 4. Render Safe Zone perimeter
    if (mapDef.safeZone) {
      this.renderSafeZone(ctx, mapDef.safeZone, time);
    }

    // 5. Render Tread Marks
    this.particles.renderTreads(ctx, this.camera);

    // 6. Render Gates
    for (const ent of entities) {
      if (ent.kind === 'gate') {
        drawGate(ctx, ent, this.camera, time);
      }
    }

    // 7. Render Props (Trees, Rocks, Ruins) with drop shadows and top-left lighting
    this.renderObstacles(ctx, mapDef);

    // 8. Render Landmark
    drawLandmark(ctx, mapDef.landmark, this.camera, time);

    // 9. Render Telegraph Danger Rings
    for (const ent of entities) {
      if (ent.kind === 'telegraph') {
        drawTelegraph(ctx, ent, this.camera);
      }
    }

    // 10. Render Loot Crates
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
          this.renderNameplate(ctx, ent);
        }
      }
    }

    // 12. Render Projectiles (with shell trails)
    this.renderProjectiles(ctx, entities);

    // 13. Render Particles & Floating Damage Numbers
    this.particles.renderParticles(ctx, this.camera);

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
    this.renderAtmosphere(ctx, time, mapDef.biome);
  }

  private renderTerrain(ctx: CanvasRenderingContext2D, mapDef: MapDef) {
    const zoom = this.camera.zoom;
    const pattern = this.getTerrainPattern(ctx, mapDef.biome);

    if (pattern) {
      ctx.save();
      const originX = (this.camera.viewportWidth / 2 - this.camera.pos.x * zoom);
      const originY = (this.camera.viewportHeight / 2 - this.camera.pos.y * zoom);

      // Apply matrix translation so the texture pattern moves naturally with camera
      if (typeof DOMMatrix !== 'undefined') {
        const matrix = new DOMMatrix();
        matrix.translateSelf(originX, originY);
        matrix.scaleSelf(zoom, zoom);
        pattern.setTransform(matrix);
      }

      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, this.camera.viewportWidth, this.camera.viewportHeight);
      ctx.restore();
    } else {
      ctx.fillStyle = mapDef.biome === 'green_valley' ? '#559445' : '#c7844a';
      ctx.fillRect(0, 0, this.camera.viewportWidth, this.camera.viewportHeight);
    }

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

    // World Boundary Perimeter
    const topLeft = this.camera.worldToScreen({ x: 0, y: 0 });
    const bottomRight = this.camera.worldToScreen({ x: mapDef.width, y: mapDef.height });
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
    ctx.lineWidth = 3 * zoom;
    ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  }

  private renderRiverAndBridges(ctx: CanvasRenderingContext2D, mapDef: MapDef, time: number) {
    if (mapDef.biome !== 'green_valley') return;

    const zoom = this.camera.zoom;

    // Continuous winding river across map near y = 1400
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
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

    // Animated water ripples
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2 * zoom;
    ctx.setLineDash([14, 22]);
    ctx.lineDashOffset = -time * 40;
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

    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
    ctx.lineWidth = 2.5 * this.camera.zoom;
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
        s.x < -r - 50 ||
        s.x > this.camera.viewportWidth + r + 50 ||
        s.y < -r - 50 ||
        s.y > this.camera.viewportHeight + r + 50
      ) {
        continue;
      }

      ctx.save();
      ctx.translate(s.x, s.y);

      // Soft drop shadow cast to bottom-right
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 6 * zoom;
      ctx.shadowOffsetX = 4 * zoom;
      ctx.shadowOffsetY = 6 * zoom;

      if (obs.type === 'tree') {
        // Multi-layered pine/foliage canopy with top-left sun illumination
        // Dark base canopy
        ctx.fillStyle = '#064e3b';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // Mid-tone canopy
        ctx.fillStyle = '#059669';
        ctx.beginPath();
        ctx.arc(-r * 0.15, -r * 0.15, r * 0.75, 0, Math.PI * 2);
        ctx.fill();

        // Sunlit top-left highlight
        ctx.fillStyle = '#34d399';
        ctx.beginPath();
        ctx.arc(-r * 0.28, -r * 0.28, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else if (obs.type === 'rock') {
        // Faceted polygon rock with lit top-left and shadow bottom-right
        ctx.fillStyle = '#3f3f46';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // Lit facet
        ctx.fillStyle = '#71717a';
        ctx.beginPath();
        ctx.arc(-r * 0.2, -r * 0.2, r * 0.65, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Ruin / Wall / Building
        const w = (obs.width || 80) * zoom;
        const h = (obs.height || 60) * zoom;
        ctx.fillStyle = '#475569';
        ctx.fillRect(-w / 2, -h / 2, w, h);

        // Highlight roof ridge
        ctx.fillStyle = '#64748b';
        ctx.fillRect(-w / 2, -h / 2, w * 0.5, h);
      }

      ctx.restore();
    }
  }

  private renderProjectiles(ctx: CanvasRenderingContext2D, entities: SimEntity[]) {
    const zoom = this.camera.zoom;

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

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(proj.chassisAngle);

      // Trailing glow
      if (proj.ammoType === 'ap') {
        ctx.fillStyle = '#38bdf8';
      } else if (proj.ammoType === 'he') {
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

  private renderNameplate(ctx: CanvasRenderingContext2D, ent: SimEntity) {
    if (ent.kind === 'player') return;
    const s = this.camera.worldToScreen(ent.pos);
    const zoom = this.camera.zoom;
    const r = ent.radius * zoom;

    const yOffset = -r - 18;

    ctx.save();
    ctx.translate(s.x, s.y + yOffset);

    // Guaranteed minimum 11px font
    const fontSize = Math.max(11, Math.round(11 * zoom));
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';

    const isHostile = ent.isHostile;
    const clan = ent.clanTag ? `[${ent.clanTag}] ` : '';
    const label = `${clan}${ent.name}`;

    // Dark stroke outline so text is readable over sunlit grass & snow
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 3;
    ctx.strokeText(label, 0, -6);

    ctx.fillStyle = isHostile ? '#f87171' : '#60a5fa';
    ctx.fillText(label, 0, -6);

    // Health & Armor bar
    const barW = Math.max(42, r * 1.6);
    const barH = Math.max(3, 3 * zoom);
    const hpRatio = clamp(ent.hull / ent.maxHull, 0, 1);
    const armorRatio = clamp(ent.armor / ent.maxArmor, 0, 1);

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(-barW / 2 - 1, -1, barW + 2, barH * 2 + 3);

    // Armor bar (top)
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-barW / 2, 0, barW * armorRatio, barH);

    // Hull bar (bottom)
    ctx.fillStyle = isHostile ? '#ef4444' : '#22c55e';
    ctx.fillRect(-barW / 2, barH + 1, barW * hpRatio, barH);

    ctx.restore();
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

  private renderAtmosphere(ctx: CanvasRenderingContext2D, time: number, biome: string) {
    const w = this.camera.viewportWidth;
    const h = this.camera.viewportHeight;

    // Gentle Drifting Weather Layer (clouds/dust motes)
    ctx.save();
    const cloudColor = biome === 'canyon_flats' ? 'rgba(251, 146, 60, 0.04)' : 'rgba(255, 255, 255, 0.04)';
    ctx.fillStyle = cloudColor;

    for (let i = 0; i < 6; i++) {
      const speed = 20 + i * 8;
      const x = ((time * speed + i * 280) % (w + 400)) - 200;
      const y = (i * 130 + Math.sin(time * 0.2 + i) * 30) % h;
      const radius = 90 + (i % 3) * 45;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

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
