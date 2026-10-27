import { clamp, MapDef, SimEntity, Vec2 } from '../sim/types.ts';
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

  constructor(camera: Camera, particles: ParticleSystem) {
    this.camera = camera;
    this.particles = particles;
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

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // 1. Render Terrain Background & Grid
    this.renderTerrain(ctx, mapDef);

    // 2. Render Safe Zone boundary
    if (mapDef.safeZone) {
      this.renderSafeZone(ctx, mapDef.safeZone, time);
    }

    // 3. Render Slow Zones (Mud, Water, Snow)
    this.renderSlowZones(ctx, mapDef);

    // 4. Render Tread Marks
    this.particles.renderTreads(ctx, this.camera);

    // 5. Render Gates
    for (const ent of entities) {
      if (ent.kind === 'gate') {
        drawGate(ctx, ent, this.camera, time);
      }
    }

    // 6. Render Map Obstacles (Trees, Rocks, Ruins)
    this.renderObstacles(ctx, mapDef);

    // 7. Render Landmarks
    drawLandmark(ctx, mapDef.landmark, this.camera, time);

    // 8. Render Telegraphs
    for (const ent of entities) {
      if (ent.kind === 'telegraph') {
        drawTelegraph(ctx, ent, this.camera);
      }
    }

    // 9. Render Loot Crates
    for (const ent of entities) {
      if (ent.kind === 'loot_crate') {
        drawLootCrate(ctx, ent, this.camera, time);
      }
    }

    // 10. Render Vehicles & Enemies
    for (const ent of entities) {
      if (ent.hull <= 0) continue;
      if (ent.kind === 'player' || ent.kind === 'npc_driver') {
        const tier = Math.min(6, Math.max(1, Math.floor(ent.level / 5) + 1));
        drawVehicle(ctx, ent, this.camera, tier, time);
        this.renderNameplate(ctx, ent);
      } else if (
        ent.kind === 'scout_buggy' ||
        ent.kind === 'gunner_truck' ||
        ent.kind === 'artillery' ||
        ent.kind === 'bunker_turret' ||
        ent.kind === 'loot_convoy' ||
        ent.kind === 'boss'
      ) {
        drawEnemy(ctx, ent, this.camera, time);
        this.renderNameplate(ctx, ent);
      }
    }

    // 11. Render Projectiles
    this.renderProjectiles(ctx, entities);

    // 12. Render Particles & Floating Damage Numbers
    this.particles.renderParticles(ctx, this.camera);

    // 13. Render Local Player World Status Bars (Under vehicle: Hull, Armor, Level Badge)
    if (localPlayer && localPlayer.hull > 0) {
      this.renderPlayerWorldHUD(ctx, localPlayer);
    }

    // 14. Render Target Lock Reticle
    if (localPlayer && localPlayer.targetId !== undefined) {
      const target = entities.find((e) => e.id === localPlayer.targetId);
      if (target && target.hull > 0) {
        this.renderTargetReticle(ctx, target, time);
      }
    }
  }

  private renderTerrain(ctx: CanvasRenderingContext2D, mapDef: MapDef) {
    const biome = mapDef.biome;
    let baseColor = '#1e293b';
    let gridColor = 'rgba(255, 255, 255, 0.03)';

    if (biome === 'green_valley') {
      baseColor = '#14281d'; // Lush dark moss/meadow
      gridColor = 'rgba(74, 222, 128, 0.035)';
    } else if (biome === 'canyon_flats') {
      baseColor = '#291b12'; // Warm canyon sandstone
      gridColor = 'rgba(251, 146, 60, 0.035)';
    } else if (biome === 'frostline_pass') {
      baseColor = '#0f172a'; // Cold alpine snow / slate
      gridColor = 'rgba(56, 189, 248, 0.035)';
    } else if (biome === 'ash_city') {
      baseColor = '#18181b'; // Dark asphalt & volcanic ash
      gridColor = 'rgba(239, 68, 68, 0.035)';
    }

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, this.camera.viewportWidth, this.camera.viewportHeight);

    // World Grid Lines
    const zoom = this.camera.zoom;
    const gridSize = 160 * zoom;
    const startX = ((this.camera.viewportWidth / 2 - this.camera.pos.x * zoom) % gridSize + gridSize) % gridSize;
    const startY = ((this.camera.viewportHeight / 2 - this.camera.pos.y * zoom) % gridSize + gridSize) % gridSize;

    ctx.strokeStyle = gridColor;
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

    // World boundary border
    const topLeft = this.camera.worldToScreen({ x: 0, y: 0 });
    const bottomRight = this.camera.worldToScreen({ x: mapDef.width, y: mapDef.height });
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2 * zoom;
    ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  }

  private renderSafeZone(ctx: CanvasRenderingContext2D, safeZone: { x: number; y: number; radius: number }, time: number) {
    const s = this.camera.worldToScreen({ x: safeZone.x, y: safeZone.y });
    const r = safeZone.radius * this.camera.zoom;

    // Glowing protective perimeter
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 2.5 * this.camera.zoom;
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = -time * 15;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.stroke();

    // Very subtle interior glow
    ctx.fillStyle = 'rgba(56, 189, 248, 0.04)';
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private renderSlowZones(ctx: CanvasRenderingContext2D, mapDef: MapDef) {
    for (const sz of mapDef.slowZones) {
      const s = this.camera.worldToScreen({ x: sz.x, y: sz.y });
      const r = sz.radius * this.camera.zoom;
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
        ctx.fillStyle = 'rgba(14, 165, 233, 0.22)';
      } else if (sz.type === 'snow') {
        ctx.fillStyle = 'rgba(224, 242, 254, 0.18)';
      } else {
        ctx.fillStyle = 'rgba(120, 53, 15, 0.25)'; // Mud
      }
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private renderObstacles(ctx: CanvasRenderingContext2D, mapDef: MapDef) {
    const zoom = this.camera.zoom;

    for (const obs of mapDef.obstacles) {
      const s = this.camera.worldToScreen({ x: obs.x, y: obs.y });
      const r = obs.radius * zoom;
      if (
        s.x < -r ||
        s.x > this.camera.viewportWidth + r ||
        s.y < -r ||
        s.y > this.camera.viewportHeight + r
      ) {
        continue;
      }

      ctx.save();
      ctx.translate(s.x, s.y);

      if (obs.type === 'tree') {
        // Pine / foliage canopy
        ctx.fillStyle = '#064e3b';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#047857';
        ctx.beginPath();
        ctx.arc(-r * 0.2, -r * 0.2, r * 0.7, 0, Math.PI * 2);
        ctx.fill();
      } else if (obs.type === 'rock') {
        // Jagged boulder
        ctx.fillStyle = '#52525b';
        ctx.strokeStyle = '#27272a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        // Ruin / wall
        const w = (obs.width || 80) * zoom;
        const h = (obs.height || 60) * zoom;
        ctx.fillStyle = '#334155';
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.5;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.strokeRect(-w / 2, -h / 2, w, h);
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
        s.x < -20 ||
        s.x > this.camera.viewportWidth + 20 ||
        s.y < -20 ||
        s.y > this.camera.viewportHeight + 20
      ) {
        continue;
      }

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(proj.chassisAngle);

      if (proj.ammoType === 'ap') {
        ctx.fillStyle = '#38bdf8'; // Blue AP tracer
      } else if (proj.ammoType === 'he') {
        ctx.fillStyle = '#f97316'; // Orange HE tracer
      } else {
        ctx.fillStyle = '#fbbf24'; // Yellow standard
      }

      const l = 10 * zoom;
      const w = 3 * zoom;
      ctx.fillRect(-l / 2, -w / 2, l, w);

      ctx.restore();
    }
  }

  private renderNameplate(ctx: CanvasRenderingContext2D, ent: SimEntity) {
    if (ent.kind === 'player') return; // Handled specially in player HUD below vehicle
    const s = this.camera.worldToScreen(ent.pos);
    const zoom = this.camera.zoom;
    const r = ent.radius * zoom;

    const yOffset = -r - 18;

    ctx.save();
    ctx.translate(s.x, s.y + yOffset);

    // Font & Colors
    ctx.font = `500 ${Math.round(11 * zoom)}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';

    const isHostile = ent.isHostile;
    const nameColor = isHostile ? '#f87171' : '#60a5fa';

    // Label: [CLAN] Name (Lv.X)
    const clan = ent.clanTag ? `[${ent.clanTag}] ` : '';
    const label = `${clan}${ent.name}`;
    ctx.fillStyle = nameColor;
    ctx.fillText(label, 0, -6);

    // Health bar
    const barW = Math.max(38, r * 1.6);
    const barH = 3 * zoom;
    const hpRatio = clamp(ent.hull / ent.maxHull, 0, 1);
    const armorRatio = clamp(ent.armor / ent.maxArmor, 0, 1);

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(-barW / 2, 0, barW, barH * 2 + 1);

    // Armor bar (top thin bar)
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-barW / 2, 0, barW * armorRatio, barH);

    // Hull bar (bottom thin bar)
    ctx.fillStyle = isHostile ? '#ef4444' : '#22c55e';
    ctx.fillRect(-barW / 2, barH + 1, barW * hpRatio, barH);

    ctx.restore();
  }

  private renderPlayerWorldHUD(ctx: CanvasRenderingContext2D, player: SimEntity) {
    const s = this.camera.worldToScreen(player.pos);
    const zoom = this.camera.zoom;
    const r = player.radius * zoom;

    const yOffset = r + 16;

    ctx.save();
    ctx.translate(s.x, s.y + yOffset);

    const barW = 80 * zoom;
    const barH = 4 * zoom;

    // Background
    ctx.fillStyle = 'rgba(11, 15, 20, 0.75)';
    ctx.fillRect(-barW / 2, 0, barW, barH * 2 + 2);

    // Armor Bar (Blue)
    const armorRatio = clamp(player.armor / player.maxArmor, 0, 1);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-barW / 2, 0, barW * armorRatio, barH);

    // Hull Bar (Emerald)
    const hullRatio = clamp(player.hull / player.maxHull, 0, 1);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(-barW / 2, barH + 2, barW * hullRatio, barH);

    // Numerical readout under player: 10.000 / 10.000 and 5.000 / 5.000
    ctx.font = `500 ${Math.round(10 * zoom)}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';

    const fmtHull = Math.round(player.hull).toLocaleString();
    const fmtArmor = Math.round(player.armor).toLocaleString();
    ctx.fillText(`H: ${fmtHull} · A: ${fmtArmor}`, 0, barH * 2 + 14);

    // Gate holding traveling indicator
    if (player.gateHoldTimer && player.gateHoldTimer > 0) {
      ctx.fillStyle = '#38bdf8';
      ctx.font = `600 ${Math.round(11 * zoom)}px -apple-system, BlinkMacSystemFont, sans-serif`;
      const pct = Math.min(100, Math.round((player.gateHoldTimer / 3.0) * 100));
      ctx.fillText(`Travelling... ${pct}%`, 0, -r * 2 - 14);
    }

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
    ctx.lineWidth = 1.8;

    // 4 Corner Brackets
    const bl = 8 * zoom;
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
}
