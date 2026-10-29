import { clamp, SimEntity, Vec2 } from '../sim/types.ts';
import { DEFAULT_SUN_DIRECTION } from '../../shared/types.ts';
import { Camera } from './camera.ts';
import { spriteRegistry } from './assets.ts';
import { selectEntitySpritePath } from './entitySprites.ts';
import { drawSpriteShadow, drawStaticSpriteShadow } from './shadows.ts';
import type { VehicleVisualMotion } from './vehicleMotion.ts';

function drawBlobShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  sunDirection: Vec2,
  zoom: number,
): void {
  const magnitude = Math.hypot(sunDirection.x, sunDirection.y) || 1;
  ctx.save();
  ctx.translate(x - (sunDirection.x / magnitude) * 7 * zoom, y - (sunDirection.y / magnitude) * 7 * zoom);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
  ctx.beginPath();
  ctx.ellipse(0, 0, width * 0.42, height * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHitFlash(ctx: CanvasRenderingContext2D, radius: number, strength: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(strength / 0.12, 0, 1);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draws vehicles, enemies, props, gates, and landmarks with high aesthetic quality,
 * drop shadows cast to the bottom-right, animated rolling tracks, recoil kick, and hit flashes.
 */

export function drawVehicle(
  ctx: CanvasRenderingContext2D,
  ent: SimEntity,
  camera: Camera,
  tier = 1,
  time = 0,
  sunDirection: Vec2 = DEFAULT_SUN_DIRECTION,
  highQualityShadows = true,
  recoilKick = 0,
  recoilAngle = ent.turretAngle,
  motion?: VehicleVisualMotion,
) {
  const s = camera.worldToScreen(ent.pos);
  const zoom = camera.zoom;
  const radius = ent.radius * zoom;

  ctx.save();
  ctx.translate(
    s.x - Math.cos(recoilAngle) * 4 * zoom * recoilKick,
    s.y - Math.sin(recoilAngle) * 4 * zoom * recoilKick + (motion?.bob ?? 0) * zoom,
  );

  // Wreck state: linger and fade out over 8 seconds
  if (ent.isWreck) {
    const wreckAlpha = Math.max(0.15, Math.min(1.0, (ent.wreckTimer || 8.0) / 8.0));
    ctx.globalAlpha = wreckAlpha;
  }

  // Cosmetic season skins: a glow under the hull
  if (ent.skin && !ent.isWreck) {
    const crown = ent.skin === 'skin_season_crown';
    ctx.save();
    ctx.globalAlpha = 0.35 + Math.sin(time * (crown ? 3 : 9)) * 0.15;
    ctx.fillStyle = crown ? '#facc15' : '#f97316';
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.3, radius * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    if (crown) { ctx.strokeStyle = '#fef08a'; ctx.lineWidth = 2 * zoom; ctx.stroke(); }
    ctx.restore();
  }

  // Invulnerability shield shimmer
  if (ent.invulnerableTime > 0 && !ent.isWreck) {
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
  if (ent.statusEffects.some((s) => s.type === 'boosted') && !ent.isWreck) {
    ctx.save();
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2 * zoom;
    ctx.globalAlpha = 0.5 + Math.sin(time * 18) * 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 1. Draw Chassis
  const classKey = ent.vehicleClass && ent.tier ? `${ent.tier}_${ent.vehicleClass}` : '';
  const classBody = classKey ? spriteRegistry.getVehicleBodyPath(ent.tier!, ent.vehicleClass!) : '';
  const bodyPath = selectEntitySpritePath(ent, 'vehicle', spriteRegistry.listedPaths, tier);
  const normalBodyPath = classBody && spriteRegistry.isListed(classBody)
    ? classBody
    : spriteRegistry.getVehicleBodyPath(tier, ent.kind);
  const requestedBodyImg = bodyPath ? spriteRegistry.getImage(bodyPath) : null;
  const bodyImg = requestedBodyImg ?? (bodyPath !== normalBodyPath ? spriteRegistry.getImage(normalBodyPath) : null);
  const wreckImg = ent.isWreck ? spriteRegistry.getImage(spriteRegistry.getFxPath(ent.id % 2 === 0 ? 'fx_09' : 'fx_10')) : null;
  const bodyWidth = radius * 2.4;
  const bodyHeight = radius * 2.0;
  const hasWreckBody = !!bodyPath?.endsWith('_body_wreck.png');
  const shadowImage = hasWreckBody ? bodyImg : ent.isWreck ? wreckImg : bodyImg;
  const shadowWidth = ent.isWreck ? radius * 2.4 : bodyWidth;
  const shadowHeight = ent.isWreck ? radius * 2 : bodyHeight;
  if (shadowImage && highQualityShadows) {
    drawSpriteShadow(ctx, shadowImage, 0, 0, shadowWidth, shadowHeight, sunDirection, zoom, ent.chassisAngle);
  } else {
    drawBlobShadow(ctx, 0, 0, shadowWidth, shadowHeight, sunDirection, zoom);
  }

  ctx.save();
  ctx.rotate(ent.chassisAngle);
  ctx.translate((motion?.hullOffset ?? 0) * zoom, 0);
  ctx.rotate(motion?.hullLean ?? 0);
  ctx.scale(1, motion?.hullScaleY ?? 1);

  if (ent.isWreck) {
    if (hasWreckBody && bodyImg) {
      ctx.drawImage(bodyImg, -bodyWidth / 2, -bodyHeight / 2, bodyWidth, bodyHeight);
      ctx.restore();
      ctx.restore();
      return;
    }
    if (wreckImg) {
      const w = radius * 2.4;
      const h = radius * 2.0;
      ctx.drawImage(wreckImg, -w / 2, -h / 2, w, h);
      ctx.restore();
      ctx.restore();
      return;
    }
  }

  if (bodyImg) {
    ctx.drawImage(bodyImg, -bodyWidth / 2, -bodyHeight / 2, bodyWidth, bodyHeight);
  } else {
    drawChassisByTier(ctx, tier, radius, ent.isHostile, ent.distanceDriven || 0, ent.isWreck);
  }
  ctx.restore();

  if (ent.isWreck) {
    ctx.restore();
    return;
  }

  // 2. Draw Turret (rotates independently with turretAngle)
  const classTurret = classKey ? spriteRegistry.getVehicleTurretPath(ent.tier!, ent.vehicleClass!) : '';
  // a class body without its own painted turret keeps the vector turret instead of borrowing a mismatched old one
  const usesClassArt = !!classBody && spriteRegistry.isListed(classBody);
  const turretImg = usesClassArt
    ? (spriteRegistry.isListed(classTurret) ? spriteRegistry.getImage(classTurret) : null)
    : spriteRegistry.getImage(spriteRegistry.getVehicleTurretPath(tier, ent.kind));
  const tw = radius * 2.2;
  const th = radius * 1.4;
  const turretAngle = motion?.turretAngle ?? ent.turretAngle;
  if (turretImg && highQualityShadows) {
    drawSpriteShadow(ctx, turretImg, 0, 0, tw, th, sunDirection, zoom, turretAngle);
  }
  ctx.save();
  ctx.rotate(turretAngle);
  if (turretImg) {
    const recoil = ent.mainReloadTime > 0
      ? clamp(ent.mainReloadRemaining / ent.mainReloadTime, 0, 1) * radius * 0.25
      : 0;
    ctx.drawImage(turretImg, -tw / 4 - recoil - recoilKick * radius * 0.18, -th / 2, tw, th);
  } else {
    drawTurretByTier(
      ctx,
      tier,
      radius,
      ent.isHostile,
      ent.mainReloadRemaining,
      ent.mainReloadTime,
      ent.isWreck
    );
  }
  ctx.restore();

  // 3. Short White Hit Flash on damage
  if (ent.hitFlashTimer && ent.hitFlashTimer > 0) {
    drawHitFlash(ctx, radius, ent.hitFlashTimer);
  }

  ctx.restore();
}

function drawChassisByTier(
  ctx: CanvasRenderingContext2D,
  tier: number,
  r: number,
  isHostile: boolean,
  distanceDriven: number,
  isWreck = false
) {
  const l = r * 1.45;
  const w = r * 1.15;
  const trackW = r * 0.34;

  // Tread colors
  const treadBase = isWreck ? '#1c1917' : isHostile ? '#27272a' : '#1e293b';
  const treadGroove = isWreck ? '#0c0a09' : '#09090b';

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

  // Animated Track Segments based on distance driven!
  const grooveSpacing = 9;
  const offset = ((distanceDriven * 0.7) % grooveSpacing + grooveSpacing) % grooveSpacing;

  for (let x = -l + offset; x < l - 2; x += grooveSpacing) {
    ctx.beginPath();
    ctx.moveTo(x, -w);
    ctx.lineTo(x, -w + trackW);
    ctx.moveTo(x, w - trackW);
    ctx.lineTo(x, w);
    ctx.stroke();
  }

  if (isWreck) {
    // Charred burnt wreck hull
    ctx.fillStyle = '#292524';
    ctx.fillRect(-l * 0.8, -w * 0.7, l * 1.6, w * 1.4);
    ctx.strokeStyle = '#0c0a09';
    ctx.strokeRect(-l * 0.8, -w * 0.7, l * 1.6, w * 1.4);
    return;
  }

  // Main Hull Body by Tier
  if (tier === 1) {
    // Scrappy Patchwork Scout: mismatched rusty plates, visible patches
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
  reloadTotal: number,
  isWreck = false
) {
  // Recoil kick displacement when firing
  const recoil = !isWreck && reloadRem > 0 ? (reloadRem / reloadTotal) * (r * 0.25) : 0;
  const barrelLen = r * (1.2 + tier * 0.16) - recoil;
  const barrelW = r * (0.2 + tier * 0.035);

  if (isWreck) {
    // Burnt turret stub
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

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
  time = 0,
  sunDirection: Vec2 = DEFAULT_SUN_DIRECTION,
  highQualityShadows = true,
) {
  const s = camera.worldToScreen(ent.pos);
  const zoom = camera.zoom;
  const r = ent.radius * zoom;

  ctx.save();
  ctx.translate(s.x, s.y);

  if (ent.isWreck) {
    ctx.globalAlpha = Math.max(0.15, Math.min(1.0, (ent.wreckTimer || 8.0) / 8.0));
    const wreckImg = spriteRegistry.getImage(spriteRegistry.getFxPath(ent.id % 2 === 0 ? 'fx_09' : 'fx_10'));
    if (wreckImg) {
      ctx.save();
      ctx.rotate(ent.chassisAngle);
      ctx.drawImage(wreckImg, -r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
      ctx.restore();
      ctx.restore();
      return;
    }
  }

  // painted sprite by sprite override (dungeon bosses), archetype id (flak_wagon, boss_*...) or kind
  const enemyPath = selectEntitySpritePath(ent, 'enemy', spriteRegistry.listedPaths);
  const requestedEnemyImg = enemyPath ? spriteRegistry.getImage(enemyPath) : null;
  const normalEnemyPath = enemyPath?.endsWith('_elite.png') ? enemyPath.replace(/_elite\.png$/, '.png') : undefined;
  const enemyImg = requestedEnemyImg ?? (normalEnemyPath ? spriteRegistry.getImage(normalEnemyPath) : null);
  if (enemyImg) {
    if (highQualityShadows) drawSpriteShadow(ctx, enemyImg, 0, 0, r * 2.6, r * 2.6, sunDirection, zoom, ent.chassisAngle);
    else drawBlobShadow(ctx, 0, 0, r * 2.6, r * 2.6, sunDirection, zoom);
    ctx.save();
    ctx.rotate(ent.chassisAngle);
    ctx.drawImage(enemyImg, -r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
    ctx.restore();
    if (ent.hitFlashTimer && ent.hitFlashTimer > 0) drawHitFlash(ctx, r, ent.hitFlashTimer);
    ctx.restore();
    return;
  }

  // Procedural enemy rendering with drop shadows
  drawBlobShadow(ctx, 0, 0, r * 2, r * 1.5, sunDirection, zoom);
  ctx.save();
  ctx.rotate(ent.chassisAngle);

  if (ent.isWreck) {
    ctx.fillStyle = '#292524';
    ctx.fillRect(-r * 0.9, -r * 0.7, r * 1.8, r * 1.4);
  } else if (ent.kind === 'scout_buggy') {
    // Wheels
    ctx.fillStyle = '#18181b';
    ctx.fillRect(-r * 1.1, -r * 1.0, r * 0.6, r * 0.4);
    ctx.fillRect(r * 0.5, -r * 1.0, r * 0.6, r * 0.4);
    ctx.fillRect(-r * 1.1, r * 0.6, r * 0.6, r * 0.4);
    ctx.fillRect(r * 0.5, r * 0.6, r * 0.6, r * 0.4);

    // Roll cage chassis
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

    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(-r * 1.0, -r * 0.6, r * 2.0, r * 1.2);
    ctx.fillStyle = '#991b1b';
    ctx.fillRect(r * 0.3, -r * 0.55, r * 0.7, r * 1.1);
  } else if (ent.kind === 'artillery') {
    ctx.fillStyle = '#27272a';
    ctx.fillRect(-r * 1.2, -r * 0.9, r * 2.4, r * 0.4);
    ctx.fillRect(-r * 1.2, r * 0.5, r * 2.4, r * 0.4);

    ctx.fillStyle = '#450a0a';
    ctx.fillRect(-r * 0.9, -r * 0.6, r * 1.8, r * 1.2);
    ctx.strokeStyle = '#991b1b';
    ctx.strokeRect(-r * 0.9, -r * 0.6, r * 1.8, r * 1.2);
  } else if (ent.kind === 'bunker_turret') {
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
    ctx.fillStyle = '#18181b';
    for (let i = -1.2; i <= 0.8; i += 0.6) {
      ctx.fillRect(r * i, -r * 0.95, r * 0.45, r * 0.3);
      ctx.fillRect(r * i, r * 0.65, r * 0.45, r * 0.3);
    }
    ctx.fillStyle = '#854d0e';
    ctx.fillRect(-r * 1.2, -r * 0.65, r * 2.4, r * 1.3);
    ctx.fillStyle = '#eab308';
    ctx.fillRect(-r * 0.8, -r * 0.4, r * 1.6, r * 0.8);
    ctx.strokeStyle = '#ca8a04';
    ctx.strokeRect(-r * 0.8, -r * 0.4, r * 1.6, r * 0.8);
  } else if (ent.kind === 'boss') {
    ctx.fillStyle = '#18181b';
    ctx.fillRect(-r * 1.2, -r * 1.1, r * 2.4, r * 0.5);
    ctx.fillRect(-r * 1.2, r * 0.6, r * 2.4, r * 0.5);

    ctx.fillStyle = ent.bossPhase === 3 ? '#991b1b' : '#450a0a';
    ctx.fillRect(-r * 0.95, -r * 0.75, r * 1.9, r * 1.5);
    ctx.strokeStyle = ent.bossPhase === 3 ? '#ef4444' : '#f97316';
    ctx.lineWidth = 3;
    ctx.strokeRect(-r * 0.95, -r * 0.75, r * 1.9, r * 1.5);
  }

  ctx.restore();

  // Turret (if not wrecked)
  if (!ent.isWreck) {
    ctx.save();
    ctx.rotate(ent.turretAngle);
    const barrelL = ent.kind === 'artillery' ? r * 1.8 : r * 1.3;
    const barrelW = ent.kind === 'boss' ? r * 0.35 : r * 0.22;

    ctx.fillStyle = '#09090b';
    ctx.fillRect(r * 0.2, -barrelW / 2, barrelL, barrelW);

    ctx.fillStyle = '#7f1d1d';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // White Hit Flash on damage
  if (ent.hitFlashTimer && ent.hitFlashTimer > 0) {
    drawHitFlash(ctx, r, ent.hitFlashTimer);
  }

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

  ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
  ctx.beginPath();
  ctx.ellipse(3 * zoom, 4 * zoom, r * 1.15, r * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pulsing aura
  const pulse = 0.5 + Math.sin(time * 6 + crate.id) * 0.3;
  ctx.fillStyle = `rgba(234, 179, 8, ${pulse * 0.4})`;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.8, 0, Math.PI * 2);
  ctx.fill();

  // Determine loot sprite
  const fxId =
    crate.lootKind === 'scrap'
      ? 'fx_01'
      : crate.lootKind === 'ore'
      ? 'fx_02'
      : crate.lootKind === 'ammo'
      ? 'fx_03'
      : crate.lootKind === 'repair'
      ? 'fx_04'
      : 'fx_01';

  const crateImg = spriteRegistry.getImage(spriteRegistry.getFxPath(fxId));
  if (crateImg) {
    const size = r * 2.3;
    ctx.drawImage(crateImg, -size / 2, -size / 2, size, size);
  } else {
    // Metal cargo box vector fallback
    ctx.fillStyle = '#ca8a04';
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.strokeRect(-r, -r, r * 2, r * 2);

    // Cross straps
    ctx.fillStyle = '#422006';
    ctx.fillRect(-r * 0.3, -r, r * 0.6, r * 2);
    ctx.fillRect(-r, -r * 0.3, r * 2, r * 0.6);
  }

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

  const vortexImg = spriteRegistry.getImage(spriteRegistry.getFxPath('fx_07'));
  const pylonImg = spriteRegistry.getImage(spriteRegistry.getFxPath('fx_08'));

  if (vortexImg && pylonImg) {
    // Rotating swirling vortex core
    ctx.save();
    ctx.rotate(time * 0.6);
    ctx.drawImage(vortexImg, -r, -r, r * 2, r * 2);
    ctx.restore();

    // Outer metallic gate ring / pylon
    ctx.drawImage(pylonImg, -r * 1.15, -r * 1.15, r * 2.3, r * 2.3);
  } else {
    // Vector fallback: outer gate ring
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
  }

  // Name plate with outline for legibility
  ctx.font = `600 ${Math.max(11, Math.round(13 * zoom))}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = 'center';
  ctx.strokeStyle = '#09090b';
  ctx.lineWidth = 3;
  ctx.strokeText(gate.name, 0, -r - 12);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(gate.name, 0, -r - 12);

  ctx.restore();
}

export function drawLandmark(
  ctx: CanvasRenderingContext2D,
  landmark: { name: string; x: number; y: number; type: string },
  camera: Camera,
  time = 0,
  sunDirection: Vec2 = DEFAULT_SUN_DIRECTION,
  highQualityShadows = true,
) {
  const s = camera.worldToScreen({ x: landmark.x, y: landmark.y });
  const zoom = camera.zoom;

  ctx.save();
  ctx.translate(s.x, s.y);

  // Check for lighthouse raster sprite
  const lighthouseImg = spriteRegistry.getImage(spriteRegistry.getLandmarkPath('green_valley'));
  if (landmark.type === 'lighthouse' && lighthouseImg) {
    const size = 180 * zoom;
    if (highQualityShadows) drawStaticSpriteShadow(ctx, lighthouseImg, 0, 0, size, size, sunDirection, zoom);
    else drawBlobShadow(ctx, 0, 0, size, size, sunDirection, zoom);
    ctx.drawImage(lighthouseImg, -size / 2, -size / 2, size, size);

    // Dynamic rotating beacon light cone beam
    ctx.save();
    ctx.rotate(time * 0.8);
    const beamGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, 350 * zoom);
    beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.65)');
    beamGrad.addColorStop(0.4, 'rgba(253, 224, 71, 0.25)');
    beamGrad.addColorStop(1, 'rgba(253, 224, 71, 0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 350 * zoom, -0.25, 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (landmark.type === 'watchtower' || landmark.type === 'windmill' || landmark.type === 'lighthouse') {
    drawBlobShadow(ctx, 0, 0, 70 * zoom, 80 * zoom, sunDirection, zoom);
    // Highland Windmill Landmark with spinning sails
    // Octagonal stone mill tower base
    ctx.fillStyle = '#d6d3d1';
    ctx.strokeStyle = '#78716c';
    ctx.lineWidth = 2 * zoom;
    ctx.beginPath();
    ctx.moveTo(-35 * zoom, 50 * zoom);
    ctx.lineTo(-20 * zoom, -40 * zoom);
    ctx.lineTo(20 * zoom, -40 * zoom);
    ctx.lineTo(35 * zoom, 50 * zoom);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Wooden dome roof
    ctx.fillStyle = '#854d0e';
    ctx.beginPath();
    ctx.arc(0, -40 * zoom, 24 * zoom, Math.PI, 0);
    ctx.fill();

    // 4 Rotating Windmill Sails
    ctx.save();
    ctx.translate(0, -40 * zoom);
    ctx.rotate(time * 0.9);
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 2);
      ctx.fillStyle = '#fef3c7';
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 1.5;
      ctx.fillRect(4 * zoom, -5 * zoom, 60 * zoom, 12 * zoom);
      ctx.strokeRect(4 * zoom, -5 * zoom, 60 * zoom, 12 * zoom);
      ctx.restore();
    }
    // Hub pin
    ctx.fillStyle = '#451a03';
    ctx.beginPath();
    ctx.arc(0, 0, 6 * zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (landmark.type === 'canyon_arch') {
    drawBlobShadow(ctx, 0, 0, 130 * zoom, 40 * zoom, sunDirection, zoom);
    // Titan Canyon Arch
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 24 * zoom;
    ctx.beginPath();
    ctx.arc(0, 0, 80 * zoom, Math.PI, 0);
    ctx.stroke();
  } else if (landmark.type === 'frozen_waterfall') {
    drawBlobShadow(ctx, 0, 0, 60 * zoom, 120 * zoom, sunDirection, zoom);
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
    drawBlobShadow(ctx, 0, 0, 100 * zoom, 80 * zoom, sunDirection, zoom);
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

  // Label with dark outline for readability
  ctx.font = `600 ${Math.max(12, Math.round(14 * zoom))}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = 'center';
  ctx.strokeStyle = '#09090b';
  ctx.lineWidth = 3;
  ctx.strokeText(landmark.name, 0, 75 * zoom);
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(landmark.name, 0, 75 * zoom);

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
    telegraph.telegraphMaxDuration && telegraph.telegraphDuration !== undefined
      ? 1 - telegraph.telegraphDuration / telegraph.telegraphMaxDuration
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

export function drawResourceNode(
  ctx: CanvasRenderingContext2D,
  node: SimEntity,
  camera: Camera,
  time = 0
) {
  const s = camera.worldToScreen(node.pos);
  const zoom = camera.zoom;
  const r = (node.radius || 28) * zoom;
  const oreType = (node as any).nodeType || 'iron';
  const remaining = (node as any).nodeOreRemaining ?? 50;

  ctx.save();
  ctx.translate(s.x, s.y);

  drawBlobShadow(ctx, 0, 0, r * 2, r * 1.4, DEFAULT_SUN_DIRECTION, zoom);

  // Base rock polygon
  ctx.fillStyle = '#3f3f46';
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const rad = r * (0.8 + 0.25 * Math.sin(i * 3 + 1));
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // Ore vein crystal coloration
  let oreColor = '#94a3b8'; // Iron
  let glowColor = '#cbd5e1';
  if (oreType === 'copper') {
    oreColor = '#ea580c';
    glowColor = '#fb923c';
  } else if (oreType === 'titanium') {
    oreColor = '#0284c7';
    glowColor = '#38bdf8';
  } else if (oreType === 'crystal') {
    oreColor = '#9333ea';
    glowColor = '#c084fc';
  }

  // Glowing crystal shards on the rock
  const pulse = 0.8 + Math.sin(time * 3 + node.id) * 0.2;
  ctx.fillStyle = oreColor;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.6);
  ctx.lineTo(r * 0.4, 0);
  ctx.lineTo(0, r * 0.4);
  ctx.lineTo(-r * 0.4, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = glowColor;
  ctx.globalAlpha = pulse;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Ore text label if nearby
  const fontSize = Math.max(10, Math.round(11 * zoom));
  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = 'center';
  ctx.strokeStyle = '#09090b';
  ctx.lineWidth = 3;
  const label = `${oreType.toUpperCase()} (${remaining})`;
  ctx.strokeText(label, s.x, s.y - r - 8);
  ctx.fillStyle = glowColor;
  ctx.fillText(label, s.x, s.y - r - 8);
}
