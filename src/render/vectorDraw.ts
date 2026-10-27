import { SimEntity, Vec2 } from '../sim/types.ts';
import { Camera } from './camera.ts';
import { spriteRegistry } from './assets.ts';

/**
 * Draws vehicles, enemies, props, gates, and landmarks with high aesthetic quality,
 * falling back to procedural vector rendering if no raster sprite is loaded.
 */

export function drawVehicle(
  ctx: CanvasRenderingContext2D,
  ent: SimEntity,
  camera: Camera,
  tier = 1,
  time = 0
) {
  const s = camera.worldToScreen(ent.pos);
  const zoom = camera.zoom;
  const radius = ent.radius * zoom;

  ctx.save();
  ctx.translate(s.x, s.y);

  // Invulnerability shield shimmer
  if (ent.invulnerableTime > 0) {
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5 * zoom;
    ctx.globalAlpha = 0.6 + Math.sin(time * 12) * 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Overdrive fiery speed aura
  if (ent.overdriveRemaining > 0) {
    ctx.save();
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2 * zoom;
    ctx.globalAlpha = 0.5 + Math.sin(time * 18) * 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 1. Draw Chassis (rotates with chassisAngle)
  ctx.save();
  ctx.rotate(ent.chassisAngle);

  // Pluggable sprite check
  const bodyImg = spriteRegistry.getImage(spriteRegistry.getVehicleBodyPath(tier, ent.kind));
  if (bodyImg) {
    const w = radius * 2.4;
    const h = radius * 2.0;
    ctx.drawImage(bodyImg, -w / 2, -h / 2, w, h);
  } else {
    // Procedural Vector Chassis based on Tier
    drawChassisByTier(ctx, tier, radius, ent.isHostile);
  }
  ctx.restore();

  // 2. Draw Turret (rotates independently with turretAngle)
  ctx.save();
  ctx.rotate(ent.turretAngle);

  const turretImg = spriteRegistry.getImage(spriteRegistry.getVehicleTurretPath(tier, ent.kind));
  if (turretImg) {
    const tw = radius * 2.2;
    const th = radius * 1.4;
    ctx.drawImage(turretImg, -tw / 4, -th / 2, tw, th);
  } else {
    drawTurretByTier(ctx, tier, radius, ent.isHostile, ent.mainReloadRemaining, ent.mainReloadTime);
  }
  ctx.restore();

  ctx.restore();
}

function drawChassisByTier(
  ctx: CanvasRenderingContext2D,
  tier: number,
  r: number,
  isHostile: boolean
) {
  const l = r * 1.45;
  const w = r * 1.15;
  const trackW = r * 0.34;

  // Tread colors
  const treadBase = isHostile ? '#27272a' : '#1f2937';
  const treadGroove = '#09090b';

  // Left & Right Treads
  ctx.fillStyle = treadBase;
  ctx.strokeStyle = treadGroove;
  ctx.lineWidth = 1.2;

  // Upper track
  ctx.fillRect(-l, -w, l * 2, trackW);
  ctx.strokeRect(-l, -w, l * 2, trackW);

  // Lower track
  ctx.fillRect(-l, w - trackW, l * 2, trackW);
  ctx.strokeRect(-l, w - trackW, l * 2, trackW);

  // Track segment grooves
  for (let x = -l + 6; x < l - 4; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, -w);
    ctx.lineTo(x, -w + trackW);
    ctx.moveTo(x, w - trackW);
    ctx.lineTo(x, w);
    ctx.stroke();
  }

  // Main Hull Body
  if (tier === 1) {
    // Scrappy Patchwork Scout: mismatched rusty plates, visible rivets
    ctx.fillStyle = isHostile ? '#78350f' : '#64748b';
    ctx.fillRect(-l * 0.75, -w * 0.65, l * 1.5, w * 1.3);

    // Mismatched weld patch
    ctx.fillStyle = '#b45309';
    ctx.fillRect(-l * 0.2, -w * 0.5, l * 0.5, w * 0.45);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(-l * 0.75, -w * 0.65, l * 1.5, w * 1.3);
  } else if (tier === 2) {
    // Ranger: cleaner matte olive/camo plate
    ctx.fillStyle = isHostile ? '#854d0e' : '#3f6212';
    ctx.beginPath();
    ctx.moveTo(-l * 0.8, -w * 0.65);
    ctx.lineTo(l * 0.7, -w * 0.65);
    ctx.lineTo(l * 0.9, 0);
    ctx.lineTo(l * 0.7, w * 0.65);
    ctx.lineTo(-l * 0.8, w * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.stroke();
  } else if (tier === 3) {
    // Iron Warden: tactical steel with sloped front
    ctx.fillStyle = isHostile ? '#991b1b' : '#334155';
    ctx.beginPath();
    ctx.moveTo(-l * 0.85, -w * 0.7);
    ctx.lineTo(l * 0.6, -w * 0.7);
    ctx.lineTo(l * 0.95, 0);
    ctx.lineTo(l * 0.6, w * 0.7);
    ctx.lineTo(-l * 0.85, w * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();

    // Twin fuel canisters on rear
    ctx.fillStyle = '#475569';
    ctx.fillRect(-l * 0.95, -w * 0.4, l * 0.18, w * 0.25);
    ctx.fillRect(-l * 0.95, w * 0.15, l * 0.18, w * 0.25);
  } else if (tier === 4) {
    // Bulwark: Heavy breakthrough chassis with dual armor skirts
    ctx.fillStyle = isHostile ? '#7f1d1d' : '#1e293b';
    ctx.fillRect(-l * 0.9, -w * 0.75, l * 1.8, w * 1.5);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.strokeRect(-l * 0.9, -w * 0.75, l * 1.8, w * 1.5);

    // Front wedge plow
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.moveTo(l * 0.8, -w * 0.75);
    ctx.lineTo(l * 1.1, 0);
    ctx.lineTo(l * 0.8, w * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (tier === 5) {
    // Vanguard Sentinel: Sleek composite alloy with glowing conduits
    ctx.fillStyle = isHostile ? '#450a0a' : '#0f172a';
    ctx.beginPath();
    ctx.moveTo(-l * 0.95, -w * 0.6);
    ctx.lineTo(l * 0.4, -w * 0.75);
    ctx.lineTo(l * 1.05, 0);
    ctx.lineTo(l * 0.4, w * 0.75);
    ctx.lineTo(-l * 0.95, w * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Cyan energy conduits
    ctx.strokeStyle = '#0ea5e9';
    ctx.beginPath();
    ctx.moveTo(-l * 0.6, -w * 0.35);
    ctx.lineTo(l * 0.3, -w * 0.35);
    ctx.moveTo(-l * 0.6, w * 0.35);
    ctx.lineTo(l * 0.3, w * 0.35);
    ctx.stroke();
  } else {
    // Aegis Titan: Apex Fortress with quad-tracks & reactive nanocore
    ctx.fillStyle = isHostile ? '#3b0764' : '#020617';
    ctx.fillRect(-l * 1.0, -w * 0.85, l * 2.0, w * 1.7);
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2.2;
    ctx.strokeRect(-l * 1.0, -w * 0.85, l * 2.0, w * 1.7);

    // Front ram bumper
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(l * 0.85, -w * 0.75, l * 0.25, w * 1.5);

    // Glowing orange trim lines
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-l * 0.7, 0);
    ctx.lineTo(l * 0.7, 0);
    ctx.stroke();
  }
}

function drawTurretByTier(
  ctx: CanvasRenderingContext2D,
  tier: number,
  r: number,
  isHostile: boolean,
  reloadRem: number,
  reloadTotal: number
) {
  const recoil = reloadRem > 0 ? (reloadRem / reloadTotal) * (r * 0.2) : 0;
  const barrelLen = r * (1.2 + tier * 0.16) - recoil;
  const barrelW = r * (0.2 + tier * 0.035);

  // Barrel
  ctx.fillStyle = '#18181b';
  ctx.strokeStyle = '#09090b';
  ctx.lineWidth = 1.5;

  if (tier === 6) {
    // Twin Heavy Barrels for Titan
    ctx.fillRect(r * 0.2, -barrelW * 1.2, barrelLen, barrelW * 0.9);
    ctx.strokeRect(r * 0.2, -barrelW * 1.2, barrelLen, barrelW * 0.9);
    ctx.fillRect(r * 0.2, barrelW * 0.3, barrelLen, barrelW * 0.9);
    ctx.strokeRect(r * 0.2, barrelW * 0.3, barrelLen, barrelW * 0.9);
  } else {
    // Single Gun Barrel
    ctx.fillRect(r * 0.2, -barrelW / 2, barrelLen, barrelW);
    ctx.strokeRect(r * 0.2, -barrelW / 2, barrelLen, barrelW);

    // Muzzle brake
    ctx.fillStyle = '#27272a';
    ctx.fillRect(r * 0.2 + barrelLen - 4, -barrelW * 0.75, 4, barrelW * 1.5);
  }

  // Turret Ring / Mantlet
  const tr = r * (0.55 + tier * 0.05);
  ctx.fillStyle = isHostile ? '#991b1b' : tier >= 5 ? '#0f172a' : '#334155';
  ctx.strokeStyle = tier >= 5 ? '#38bdf8' : '#0f172a';
  ctx.lineWidth = 1.8;

  ctx.beginPath();
  ctx.arc(0, 0, tr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Commander hatch
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(-tr * 0.25, 0, tr * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.stroke();
}

export function drawEnemy(
  ctx: CanvasRenderingContext2D,
  ent: SimEntity,
  camera: Camera,
  time = 0
) {
  const s = camera.worldToScreen(ent.pos);
  const zoom = camera.zoom;
  const r = ent.radius * zoom;

  ctx.save();
  ctx.translate(s.x, s.y);

  // Pluggable sprite check
  const enemyImg = spriteRegistry.getImage(spriteRegistry.getEnemyPath(ent.kind));
  if (enemyImg) {
    ctx.save();
    ctx.rotate(ent.chassisAngle);
    ctx.drawImage(enemyImg, -r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
    ctx.restore();
    ctx.restore();
    return;
  }

  // Procedural enemy rendering
  ctx.save();
  ctx.rotate(ent.chassisAngle);

  if (ent.kind === 'scout_buggy') {
    // 4 big off-road wheels
    ctx.fillStyle = '#18181b';
    ctx.fillRect(-r * 1.1, -r * 1.0, r * 0.6, r * 0.4);
    ctx.fillRect(r * 0.5, -r * 1.0, r * 0.6, r * 0.4);
    ctx.fillRect(-r * 1.1, r * 0.6, r * 0.6, r * 0.4);
    ctx.fillRect(r * 0.5, r * 0.6, r * 0.6, r * 0.4);

    // Buggy tubular roll cage chassis
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, -r * 0.6);
    ctx.lineTo(r * 0.9, -r * 0.4);
    ctx.lineTo(r * 0.9, r * 0.4);
    ctx.lineTo(-r * 0.8, r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#78350f';
    ctx.stroke();
  } else if (ent.kind === 'gunner_truck') {
    // 6 wheels
    ctx.fillStyle = '#18181b';
    ctx.fillRect(-r * 1.1, -r * 0.9, r * 0.5, r * 0.35);
    ctx.fillRect(-r * 0.2, -r * 0.9, r * 0.5, r * 0.35);
    ctx.fillRect(r * 0.6, -r * 0.9, r * 0.5, r * 0.35);
    ctx.fillRect(-r * 1.1, r * 0.55, r * 0.5, r * 0.35);
    ctx.fillRect(-r * 0.2, r * 0.55, r * 0.5, r * 0.35);
    ctx.fillRect(r * 0.6, r * 0.55, r * 0.5, r * 0.35);

    // Armored truck bed and cab
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(-r * 1.0, -r * 0.6, r * 2.0, r * 1.2);
    ctx.fillStyle = '#991b1b';
    ctx.fillRect(r * 0.3, -r * 0.55, r * 0.7, r * 1.1);
  } else if (ent.kind === 'artillery') {
    // Heavy tracked platform
    ctx.fillStyle = '#27272a';
    ctx.fillRect(-r * 1.2, -r * 0.9, r * 2.4, r * 0.4);
    ctx.fillRect(-r * 1.2, r * 0.5, r * 2.4, r * 0.4);

    ctx.fillStyle = '#450a0a';
    ctx.fillRect(-r * 0.9, -r * 0.6, r * 1.8, r * 1.2);
    ctx.strokeStyle = '#991b1b';
    ctx.strokeRect(-r * 0.9, -r * 0.6, r * 1.8, r * 1.2);
  } else if (ent.kind === 'bunker_turret') {
    // Octagonal concrete bunker base
    ctx.fillStyle = '#52525b';
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bx = Math.cos(a) * r;
      const by = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(bx, by);
      else ctx.lineTo(bx, by);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (ent.kind === 'loot_convoy') {
    // Heavy 8-wheeled transport hauler
    ctx.fillStyle = '#18181b';
    for (let i = -1.2; i <= 0.8; i += 0.6) {
      ctx.fillRect(r * i, -r * 0.95, r * 0.45, r * 0.3);
      ctx.fillRect(r * i, r * 0.65, r * 0.45, r * 0.3);
    }
    // Golden reinforced cargo container
    ctx.fillStyle = '#854d0e';
    ctx.fillRect(-r * 1.2, -r * 0.65, r * 2.4, r * 1.3);
    ctx.fillStyle = '#eab308';
    ctx.fillRect(-r * 0.8, -r * 0.4, r * 1.6, r * 0.8);
    ctx.strokeStyle = '#ca8a04';
    ctx.strokeRect(-r * 0.8, -r * 0.4, r * 1.6, r * 0.8);
  } else if (ent.kind === 'boss') {
    // Massive Boss Behemoth
    ctx.fillStyle = '#18181b';
    // Quad massive treads
    ctx.fillRect(-r * 1.2, -r * 1.1, r * 2.4, r * 0.5);
    ctx.fillRect(-r * 1.2, r * 0.6, r * 2.4, r * 0.5);

    // Heavy red fortress hull
    ctx.fillStyle = ent.bossPhase === 3 ? '#991b1b' : '#450a0a';
    ctx.fillRect(-r * 0.95, -r * 0.75, r * 1.9, r * 1.5);
    ctx.strokeStyle = ent.bossPhase === 3 ? '#ef4444' : '#f97316';
    ctx.lineWidth = 3;
    ctx.strokeRect(-r * 0.95, -r * 0.75, r * 1.9, r * 1.5);
  }

  ctx.restore(); // restore chassisAngle

  // Turret
  ctx.save();
  ctx.rotate(ent.turretAngle);
  const barrelL = ent.kind === 'artillery' ? r * 1.8 : r * 1.3;
  const barrelW = ent.kind === 'boss' ? r * 0.35 : r * 0.22;

  ctx.fillStyle = '#09090b';
  ctx.fillRect(r * 0.2, -barrelW / 2, barrelL, barrelW);

  // Turret cap
  ctx.fillStyle = '#7f1d1d';
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
  ctx.restore();
}

export function drawLootCrate(
  ctx: CanvasRenderingContext2D,
  crate: SimEntity,
  camera: Camera,
  time = 0
) {
  const s = camera.worldToScreen(crate.pos);
  const zoom = camera.zoom;
  const r = 14 * zoom;

  ctx.save();
  ctx.translate(s.x, s.y);

  // Pulsing gold aura
  const pulse = 0.5 + Math.sin(time * 6 + crate.id) * 0.3;
  ctx.fillStyle = `rgba(234, 179, 8, ${pulse * 0.4})`;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.8, 0, Math.PI * 2);
  ctx.fill();

  // Metal cargo box
  ctx.fillStyle = '#ca8a04';
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 1.5;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.strokeRect(-r, -r, r * 2, r * 2);

  // Reinforcement straps
  ctx.fillStyle = '#422006';
  ctx.fillRect(-r * 0.3, -r, r * 0.6, r * 2);
  ctx.fillRect(-r, -r * 0.3, r * 2, r * 0.6);

  ctx.restore();
}

export function drawGate(
  ctx: CanvasRenderingContext2D,
  gate: SimEntity,
  camera: Camera,
  time = 0
) {
  const s = camera.worldToScreen(gate.pos);
  const zoom = camera.zoom;
  const r = gate.radius * zoom;

  ctx.save();
  ctx.translate(s.x, s.y);

  // Outer gate ring
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3 * zoom;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  // Swirling portal energy
  const gradient = ctx.createRadialGradient(0, 0, 5, 0, 0, r);
  gradient.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
  gradient.addColorStop(0.7, 'rgba(14, 165, 233, 0.25)');
  gradient.addColorStop(1, 'rgba(2, 132, 199, 0.05)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Energy arcs rotating
  for (let i = 0; i < 4; i++) {
    const angle = time * 2 + (i * Math.PI) / 2;
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 2 * zoom;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.75, angle, angle + Math.PI * 0.35);
    ctx.stroke();
  }

  // Name plate
  ctx.font = `600 ${Math.round(13 * zoom)}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(gate.name, 0, -r - 12);

  ctx.restore();
}

export function drawLandmark(
  ctx: CanvasRenderingContext2D,
  landmark: { name: string; x: number; y: number; type: string },
  camera: Camera,
  time = 0
) {
  const s = camera.worldToScreen({ x: landmark.x, y: landmark.y });
  const zoom = camera.zoom;

  ctx.save();
  ctx.translate(s.x, s.y);

  if (landmark.type === 'watchtower') {
    // Highland Watchtower
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(-20 * zoom, -40 * zoom, 40 * zoom, 80 * zoom);
    ctx.fillStyle = '#71717a';
    ctx.beginPath();
    ctx.moveTo(-30 * zoom, -40 * zoom);
    ctx.lineTo(0, -65 * zoom);
    ctx.lineTo(30 * zoom, -40 * zoom);
    ctx.closePath();
    ctx.fill();
    // Searchlight rotating beam
    const beamAngle = time * 0.8;
    ctx.save();
    ctx.rotate(beamAngle);
    const beamGrad = ctx.createRadialGradient(0, 0, 10, 140 * zoom, 0, 140 * zoom);
    beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.35)');
    beamGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 160 * zoom, -0.25, 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (landmark.type === 'canyon_arch') {
    // Titan Canyon Arch
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 24 * zoom;
    ctx.beginPath();
    ctx.arc(0, 0, 80 * zoom, Math.PI, 0);
    ctx.stroke();
  } else if (landmark.type === 'frozen_waterfall') {
    // Frozen Waterfall Spire
    ctx.fillStyle = '#bae6fd';
    ctx.beginPath();
    ctx.moveTo(-45 * zoom, 60 * zoom);
    ctx.lineTo(0, -90 * zoom);
    ctx.lineTo(45 * zoom, 60 * zoom);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    // Collapsed Skyscraper
    ctx.fillStyle = '#27272a';
    ctx.beginPath();
    ctx.moveTo(-50 * zoom, 70 * zoom);
    ctx.lineTo(35 * zoom, -80 * zoom);
    ctx.lineTo(75 * zoom, -60 * zoom);
    ctx.lineTo(-10 * zoom, 80 * zoom);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#dc2626';
    ctx.stroke();
  }

  // Label
  ctx.font = `600 ${Math.round(14 * zoom)}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.fillStyle = '#e2e8f0';
  ctx.textAlign = 'center';
  ctx.fillText(landmark.name, 0, 65 * zoom);

  ctx.restore();
}

export function drawTelegraph(
  ctx: CanvasRenderingContext2D,
  telegraph: SimEntity,
  camera: Camera
) {
  const s = camera.worldToScreen(telegraph.pos);
  const zoom = camera.zoom;
  const r = (telegraph.telegraphRadius || 100) * zoom;
  const progress =
    telegraph.telegraphTotal && telegraph.telegraphTimer !== undefined
      ? 1 - telegraph.telegraphTimer / telegraph.telegraphTotal
      : 0.5;

  ctx.save();
  ctx.translate(s.x, s.y);

  // Outer red warning ring
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2.5 * zoom;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  // Expanding inner danger circle
  ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
  ctx.beginPath();
  ctx.arc(0, 0, r * progress, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
