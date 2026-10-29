import { ART, ArtSlot } from '../kit/art.tsx';
import React, { useEffect, useRef } from 'react';
import { spawnVehicle, createWorld } from '../../../shared/sim/world.ts';
import type { DroneSpec } from '../../../shared/types.ts';
import type { VehicleStats } from '../../sim/types.ts';
import { spriteRegistry } from '../../render/assets.ts';
import { drawVehicle } from '../../render/vectorDraw.ts';
import { DroneRenderer } from '../../render/droneDraw.ts';
import { Camera } from '../../render/camera.ts';

const PREVIEW_WORLD = createWorld({ populate: false });
const SKIN_GLOW: Record<string, string> = { skin_season_ember: '#fb923c', skin_season_crown: '#facc15' };

/**
 * Hangar stage: the vehicle on a turntable (gentle turret scan) with its equipped drones orbiting, drawn with the game's own
 * vector renderer. A skin adds a coloured glow behind the vehicle (CSS drop-shadow on the canvas element, not canvas shadowBlur).
 * Stops animating when the window is hidden or reduced motion is on.
 */
export const HangarPreview: React.FC<{ vehicle: VehicleStats; level: number; drones?: DroneSpec[]; skin?: string; reduceMotion?: boolean; effects?: boolean; className?: string }> = ({ vehicle, level, drones = [], skin, reduceMotion, effects = false, className = '' }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; const ctx = canvas?.getContext('2d'); if (!canvas || !ctx) return;
    const camera = new Camera(); camera.resize(canvas.width, canvas.height); camera.pos = { x: 0, y: 0 }; camera.zoom = 2.4;
    const droneR = new DroneRenderer(); let raf = 0; let t = 0;
    const ent = spawnVehicle(PREVIEW_WORLD, 'player', vehicle.name, level, { x: 0, y: 0 }, { tier: vehicle.tier, maxHull: vehicle.baseHull, maxArmor: vehicle.baseArmor, maxSpeed: vehicle.maxSpeed, turnRate: vehicle.turnRate, turretTurnRate: vehicle.turretTurnRate, mainReloadTime: vehicle.reloadTime, radius: 26 + vehicle.tier * 2 });
    PREVIEW_WORLD.entities.clear();
    ent.drones = drones;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ent.turretAngle = Math.sin(t * 0.8) * 0.45; ent.chassisAngle = -0.35; ent.drones = drones;
      drawVehicle(ctx, ent, camera, vehicle.tier, t);
      if (drones.length) droneR.drawOwner(ctx, camera, ent, t);
    };
    const frame = () => {
      t += reduceMotion ? 0 : 0.02;
      draw();
      if (!reduceMotion) raf = requestAnimationFrame(frame);
    };
    const bodyPath = spriteRegistry.getVehicleBodyPath(vehicle.tier, vehicle.vehicleClass);
    const turretPath = spriteRegistry.getVehicleTurretPath(vehicle.tier, vehicle.vehicleClass);
    const unsubscribe = spriteRegistry.onChange((path) => { if (path === bodyPath || path === turretPath) draw(); });
    frame();
    const visible = () => { if (document.hidden) cancelAnimationFrame(raf); else if (!reduceMotion) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } };
    document.addEventListener('visibilitychange', visible);
    return () => { cancelAnimationFrame(raf); unsubscribe(); document.removeEventListener('visibilitychange', visible); };
  }, [vehicle, level, drones, reduceMotion]);
  const glow = skin ? SKIN_GLOW[skin] ?? 'var(--accent)' : undefined;
  return (
    <div className={`tt-hangar-preview relative w-full h-full${effects ? ' tt-hangar-preview--effects' : ''}`}>
      <ArtSlot src={ART.hangarBg} className="k-bgart" />
      <canvas ref={ref} width={360} height={240} className={`relative w-full h-full object-contain pointer-events-none ${className}`} style={glow && effects ? { filter: `drop-shadow(0 0 14px ${glow})` } : undefined} aria-hidden />
      {effects && !reduceMotion && <div className="tt-hangar-particles" aria-hidden><i /><i /><i /><i /></div>}
    </div>
  );
};
