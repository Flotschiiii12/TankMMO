import { GameIcon, AMMO_ICON } from './GameIcon.tsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AmmoType, SimCommand, SimEntity } from '../sim/types.ts';
import { soundEngine } from '../audio/soundEngine.ts';

interface ControlsOverlayProps {
  player: SimEntity | null;
  onCommand: (cmd: SimCommand) => void;
  onLockNearest: () => void;
  onCycleTarget: () => void;
  onCycleAmmo: () => void;
}

export const ControlsOverlay: React.FC<ControlsOverlayProps> = ({
  player,
  onCommand,
  onLockNearest,
  onCycleTarget,
  onCycleAmmo,
}) => {
  // Joystick State
  const [stickActive, setStickActive] = useState(false);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const joystickBaseRef = useRef<HTMLDivElement>(null);
  const activeTouchId = useRef<number | null>(null);

  // Desktop keyboard drive tracking
  const keysDown = useRef<Set<string>>(new Set());

  // Drive update tick
  const driveVectorRef = useRef({ x: 0, y: 0 });

  const sendDrive = useCallback(
    (x: number, y: number) => {
      driveVectorRef.current = { x, y };
      onCommand({ type: 'Drive', x, y });
    },
    [onCommand]
  );

  // Keyboard listener for desktop WASD / Arrows
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

      keysDown.current.add(e.code);

      if (e.code === 'Space') {
        e.preventDefault();
        soundEngine.playUIClick();
        onCommand({ type: 'ToggleAutoFire' });
      } else if (e.code === 'KeyQ') {
        soundEngine.playUIClick();
        onCommand({ type: 'UseAbility', abilityId: 'smoke' });
      } else if (e.code === 'KeyE') {
        soundEngine.playUIClick();
        onCommand({ type: 'UseAbility', abilityId: 'repair_kit' });
      } else if (e.code === 'KeyF') {
        soundEngine.playUIClick();
        onCommand({ type: 'UseAbility', abilityId: 'boost' });
      } else if (e.code === 'Digit1') {
        onCommand({ type: 'SelectAmmo', ammo: 'STANDARD' });
      } else if (e.code === 'Digit2') {
        onCommand({ type: 'SelectAmmo', ammo: 'ARMOR_PIERCING' });
      } else if (e.code === 'Digit3') {
        onCommand({ type: 'SelectAmmo', ammo: 'EXPLOSIVE' });
      } else if (e.code === 'Tab') {
        e.preventDefault();
        onCycleTarget();
      }

      evaluateKeyDrive();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysDown.current.delete(e.code);
      evaluateKeyDrive();
    };

    const evaluateKeyDrive = () => {
      let dx = 0;
      let dy = 0;
      if (keysDown.current.has('KeyW') || keysDown.current.has('ArrowUp')) dy -= 1;
      if (keysDown.current.has('KeyS') || keysDown.current.has('ArrowDown')) dy += 1;
      if (keysDown.current.has('KeyA') || keysDown.current.has('ArrowLeft')) dx -= 1;
      if (keysDown.current.has('KeyD') || keysDown.current.has('ArrowRight')) dx += 1;

      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        sendDrive(dx / len, dy / len);
      } else if (!stickActive) {
        sendDrive(0, 0);
      }
    };

    const handleBlur = () => {
      keysDown.current.clear();
      if (!stickActive) sendDrive(0, 0);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [onCommand, onCycleTarget, sendDrive, stickActive]);

  // Virtual Joystick Pointer Handlers (multi-touch with separate pointerId)
  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    soundEngine.init();
    activeTouchId.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setStickActive(true);
    updateKnob(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!stickActive || activeTouchId.current !== e.pointerId) return;
    e.preventDefault();
    updateKnob(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeTouchId.current === e.pointerId) {
      activeTouchId.current = null;
      setStickActive(false);
      setKnobPos({ x: 0, y: 0 });
      sendDrive(0, 0);
    }
  };

  const updateKnob = (clientX: number, clientY: number) => {
    if (!joystickBaseRef.current) return;
    const rect = joystickBaseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);
    const maxRadius = rect.width / 2 - 12;

    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);

    const nx = Math.cos(angle) * clampedDist;
    const ny = Math.sin(angle) * clampedDist;

    setKnobPos({ x: nx, y: ny });

    const normalizedDist = clampedDist / maxRadius;
    sendDrive(Math.cos(angle) * normalizedDist, Math.sin(angle) * normalizedDist);
  };

  // Reload progress computation for circular stroke
  const reloadRemaining = player?.mainReloadRemaining || 0;
  const reloadTotal = player?.mainReloadTime || 1;
  const reloadRatio = Math.max(0, Math.min(1, 1 - reloadRemaining / reloadTotal));
  const reloadRadius = 38;
  const circumference = 2 * Math.PI * reloadRadius;
  const strokeDashoffset = circumference * (1 - reloadRatio);

  const autoFire = !!player?.autoFire;
  const hasTarget = player?.targetId !== undefined;

  // Ability Cooldowns
  const smokeCd = player?.abilityCooldowns.smoke || 0;
  const repairCd = player?.abilityCooldowns.repair_kit || 0;
  const overdriveCd = player?.abilityCooldowns.boost || 0;

  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden touch-none">
      {/* LEFT THUMB: Virtual Joystick */}
      <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1.25rem,env(safe-area-inset-left))] pointer-events-auto">
        <div
          ref={joystickBaseRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative w-32 h-32 rounded-full border border-orange-500/30 bg-slate-950/50 backdrop-blur-none flex items-center justify-center touch-none select-none"
        >
          {/* Inner target crosshair */}
          <div className="w-2.5 h-2.5 rounded-full bg-white/20 pointer-events-none" />

          {/* Draggable Knob */}
          <div
            className={`absolute w-14 h-14 rounded-full border border-orange-400/70 bg-gradient-to-b from-slate-800 to-slate-950 shadow-md transition-transform duration-75 pointer-events-none flex items-center justify-center ${
              stickActive ? 'scale-105 border-orange-400' : ''
            }`}
            style={{
              transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
            }}
          >
            <div className="w-4 h-4 rounded-full bg-orange-500/60" />
          </div>
        </div>
      </div>

      {/* RIGHT THUMB: Big Round Target/Fire Button + Satellite Ability Cluster (All buttons >= 44x44px) */}
      <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] pointer-events-auto flex items-center justify-center">
        {/* Satellite Buttons Around Fire Button */}
        <div className="relative w-48 h-48 flex items-center justify-center">
          {/* Ability 1: Smoke (Top-Left) */}
          <button
            onClick={() => {
              soundEngine.playUIClick();
              onCommand({ type: 'UseAbility', abilityId: 'smoke' });
            }}
            disabled={smokeCd > 0}
            title="Smoke" aria-label="Smoke"
            className={`absolute top-0 left-2 w-11 h-11 rounded-full border flex flex-col items-center justify-center text-[10px] font-medium transition-all ${
              smokeCd > 0
                ? 'border-slate-800 bg-slate-950/60 text-slate-500 cursor-not-allowed'
                : 'border-slate-700 bg-slate-900/90 text-slate-200 active:scale-95 active:border-orange-400 hover:border-slate-600'
            }`}
          >
            <GameIcon name="smoke" size={30} className={smokeCd > 0 ? 'opacity-30' : ''} />
            {smokeCd > 0 && <span className="absolute tabular-nums text-[11px] font-bold text-orange-300">{Math.ceil(smokeCd)}</span>}
          </button>

          {/* Ability 2: Repair Kit (Top) */}
          <button
            onClick={() => {
              soundEngine.playUIClick();
              onCommand({ type: 'UseAbility', abilityId: 'repair_kit' });
            }}
            disabled={repairCd > 0}
            title="Repair kit" aria-label="Repair kit"
            className={`absolute -top-4 w-11 h-11 rounded-full border flex flex-col items-center justify-center text-[10px] font-medium transition-all ${
              repairCd > 0
                ? 'border-slate-800 bg-slate-950/60 text-slate-500 cursor-not-allowed'
                : 'border-emerald-700/70 bg-slate-900/90 text-emerald-300 active:scale-95 active:border-emerald-400 hover:border-emerald-600'
            }`}
          >
            <GameIcon name="repair" size={30} className={repairCd > 0 ? 'opacity-30' : ''} />
            {repairCd > 0 && <span className="absolute tabular-nums text-[11px] font-bold text-orange-300">{Math.ceil(repairCd)}</span>}
          </button>

          {/* Ability 3: Overdrive (Top-Right) */}
          <button
            onClick={() => {
              soundEngine.playUIClick();
              onCommand({ type: 'UseAbility', abilityId: 'boost' });
            }}
            disabled={overdriveCd > 0}
            title="Boost" aria-label="Boost"
            className={`absolute top-0 right-2 w-11 h-11 rounded-full border flex flex-col items-center justify-center text-[10px] font-medium transition-all ${
              overdriveCd > 0
                ? 'border-slate-800 bg-slate-950/60 text-slate-500 cursor-not-allowed'
                : 'border-orange-500/60 bg-slate-900/90 text-orange-300 active:scale-95 active:border-orange-400 hover:border-orange-400'
            }`}
          >
            <GameIcon name="boost" size={30} className={overdriveCd > 0 ? 'opacity-30' : ''} />
            {overdriveCd > 0 && <span className="absolute tabular-nums text-[11px] font-bold text-orange-300">{Math.ceil(overdriveCd)}</span>}
          </button>

          {/* Target Cycle (Left - 44x44px) */}
          <button
            onClick={() => {
              soundEngine.playUIClick();
              onCycleTarget();
            }}
            title="Next target" aria-label="Next target"
            className="absolute left-0 w-11 h-11 rounded-full border border-slate-700 bg-slate-900/90 text-slate-300 text-[10px] font-semibold flex items-center justify-center active:scale-95 hover:border-slate-500"
          >
            <GameIcon name="switch_target" size={26} />
          </button>

          {/* Ammo Cycle (Bottom-Left - 44x44px) */}
          <button
            onClick={() => {
              soundEngine.playUIClick();
              onCycleAmmo();
            }}
            title="Change ammo" aria-label="Change ammo"
            className="absolute -bottom-1 left-3 w-11 h-11 rounded-full border border-slate-700 bg-slate-900/90 text-orange-400 text-[10px] font-bold flex items-center justify-center active:scale-95 hover:border-orange-500"
          >
            <GameIcon name={AMMO_ICON[player?.selectedAmmo || 'STANDARD'] ?? 'ammo_standard'} size={28} />
          </button>

          {/* Central Big TARGET/FIRE Button */}
          <button
            onClick={() => {
              soundEngine.init();
              if (!hasTarget) {
                soundEngine.playLockOn();
                onLockNearest();
              } else {
                soundEngine.playUIClick();
                onCommand({ type: 'ToggleAutoFire' });
              }
            }}
            className={`relative w-24 h-24 rounded-full flex flex-col items-center justify-center shadow-xl transition-transform active:scale-95 select-none ${
              autoFire
                ? 'bg-orange-500 text-slate-950'
                : hasTarget
                ? 'bg-slate-900 border-2 border-orange-500 text-orange-400'
                : 'bg-slate-950/95 border border-white/20 text-slate-200'
            }`}
          >
            {/* SVG Reload Progress Ring */}
            <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 96 96">
              <circle
                cx="48"
                cy="48"
                r={reloadRadius}
                fill="none"
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="4"
              />
              <circle
                cx="48"
                cy="48"
                r={reloadRadius}
                fill="none"
                stroke={autoFire ? '#ffffff' : '#f97316'}
                strokeWidth="4"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </svg>

            <span className="text-xs font-bold tracking-wider">
              {autoFire ? 'AUTO FIRE' : hasTarget ? 'LOCKED' : 'TARGET'}
            </span>
            <span className="text-[10px] opacity-80 font-medium">
              {autoFire ? 'Tap to pause' : hasTarget ? 'Tap to fire' : 'Tap to lock'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
