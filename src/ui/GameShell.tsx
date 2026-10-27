import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera } from '../render/camera.ts';
import { ParticleSystem } from '../render/particles.ts';
import { WorldRenderer } from '../render/worldRenderer.ts';
import { LocalGameClient } from '../net/client.ts';
import { LocalStorageProfileStore, UserProfile, XP_FOR_LEVEL } from '../save/profile.ts';
import { soundEngine } from '../audio/soundEngine.ts';
import { AmmoType, dist, SimCommand, SimEntity, SimEvent } from '../sim/types.ts';
import { HUD } from './HUD.tsx';
import { ControlsOverlay } from './ControlsOverlay.tsx';
import { GarageModal } from './GarageModal.tsx';
import { InventoryModal } from './InventoryModal.tsx';
import { SettingsModal } from './SettingsModal.tsx';
import { TutorialOverlay } from './TutorialOverlay.tsx';
import { DebugPanel } from './DebugPanel.tsx';
import { TitleScreen } from './TitleScreen.tsx';
import { isInSafeZone } from '../sim/world.ts';
import { VEHICLE_TIERS } from '../data/vehicles.ts';

export const GameShell: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Persistence
  const profileStoreRef = useRef(new LocalStorageProfileStore());
  const [profile, setProfile] = useState<UserProfile>(() => profileStoreRef.current.load());

  // Game UI States
  const [gameState, setGameState] = useState<'TITLE' | 'PLAYING'>('TITLE');
  const [garageOpen, setGarageOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [showDebug, setShowDebug] = useState(profile.settings.showDebug);
  const [soundMuted, setSoundMuted] = useState(!profile.settings.soundEnabled);

  // Profiler stats
  const [debugStats, setDebugStats] = useState({
    fps: 60,
    tickTime: 0,
    entityCount: 0,
    tickRate: 30,
    playerPos: { x: 2000, y: 2000 },
  });

  // Client & Engine References
  const clientRef = useRef<LocalGameClient | null>(null);
  const cameraRef = useRef<Camera>(new Camera());
  const particlesRef = useRef<ParticleSystem>(new ParticleSystem());
  const rendererRef = useRef<WorldRenderer | null>(null);

  // Initialize LocalGameClient once
  useEffect(() => {
    const client = new LocalGameClient(profile);
    clientRef.current = client;
    rendererRef.current = new WorldRenderer(cameraRef.current, particlesRef.current);

    soundEngine.setSoundEnabled(profile.settings.soundEnabled);
    soundEngine.setVolume(profile.settings.masterVolume);

    // Event listener for simulation events
    const unsub = client.onEvent((event: SimEvent) => {
      handleSimEvent(event);
    });

    // Check if new player needs tutorial
    if (profile.tutorialStep < 3) {
      setTutorialOpen(true);
    }

    return () => {
      unsub();
      client.disconnect();
    };
  }, []);

  // Save profile changes
  const saveProfile = useCallback((updated: UserProfile) => {
    setProfile(updated);
    profileStoreRef.current.save(updated);
    if (clientRef.current) {
      clientRef.current.updateProfile(updated);
    }
  }, []);

  // Handle Simulation Events
  const handleSimEvent = useCallback(
    (event: SimEvent) => {
      const particles = particlesRef.current;
      const camera = cameraRef.current;

      switch (event.type) {
        case 'damage': {
          const p = event.payload;
          if (p.type === 'muzzle_flash') {
            particles.emitMuzzleFlash(p.pos, p.angle);
            soundEngine.playCannonShot(p.isPlayer);
          } else if (p.type === 'explosion') {
            particles.emitExplosion(p.pos, true);
            soundEngine.playExplosion(true);
            camera.addShake(8);
          } else {
            // Hit damage
            if (p.pos) {
              particles.emitHitSparks(p.pos, 7, p.armorDamage > 0 ? '#38bdf8' : '#f97316');
              soundEngine.playImpact(p.armorDamage > 0);

              if (p.damage > 0) {
                particles.emitDamageText(
                  p.pos,
                  `-${p.damage}`,
                  p.armorDamage > 0 ? '#38bdf8' : '#ef4444'
                );
              }
            }

            // Screen shake on player hit
            if (clientRef.current && p.victimId === clientRef.current.playerId) {
              camera.addShake(p.damage > 400 ? 12 : 5);
            }
          }
          break;
        }

        case 'kill': {
          const p = event.payload;
          particles.emitExplosion(p.pos, true);
          soundEngine.playExplosion(true);
          camera.addShake(10);
          break;
        }

        case 'loot_collected': {
          const p = event.payload;
          if (p.isPlayer) {
            soundEngine.playPickup();
            particles.emitDamageText(p.pos, `+${p.scrap} Scrap`, '#eab308');

            // Update user profile currencies
            setProfile((prev) => {
              const nextScrap = prev.scrap + p.scrap;
              const nextParts = prev.parts + p.parts;
              let nextXp = prev.xp + Math.round(p.scrap * 0.8);
              let nextLevel = prev.level;

              // Check level up
              while (nextLevel < 30 && nextXp >= XP_FOR_LEVEL(nextLevel)) {
                nextXp -= XP_FOR_LEVEL(nextLevel);
                nextLevel++;
                particles.emitDamageText(p.pos, `LEVEL UP! [Lv.${nextLevel}]`, '#10b981');
              }

              const nextAmmo = { ...prev.ammoInventory };
              if (p.ammo) {
                const ammoKey = p.ammo.type as AmmoType;
                nextAmmo[ammoKey] = (nextAmmo[ammoKey] || 0) + p.ammo.count;
              }

              const updated: UserProfile = {
                ...prev,
                scrap: nextScrap,
                parts: nextParts,
                xp: nextXp,
                level: nextLevel,
                ammoInventory: nextAmmo,
              };
              profileStoreRef.current.save(updated);
              if (clientRef.current) clientRef.current.updateProfile(updated);
              return updated;
            });
          }
          break;
        }

        case 'gate_travel': {
          const p = event.payload;
          soundEngine.playGateHum();
          camera.addShake(7);
          if (clientRef.current) {
            clientRef.current.switchMap(p.targetMapId, p.gateId);
            setProfile((prev) => {
              const updated = { ...prev, currentMapId: p.targetMapId };
              profileStoreRef.current.save(updated);
              return updated;
            });
          }
          break;
        }

        case 'player_respawn': {
          // Drop 10% scrap on death
          setProfile((prev) => {
            const retainedScrap = Math.floor(prev.scrap * 0.9);
            const updated = { ...prev, scrap: retainedScrap };
            profileStoreRef.current.save(updated);
            return updated;
          });
          break;
        }
      }
    },
    []
  );

  // Main Render & Animation Loop (Fixed canvas decoupling)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let lastTime = performance.now();
    let frameCount = 0;
    let lastFpsUpdate = performance.now();
    let currentFps = 60;

    const handleResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
      cameraRef.current.resize(w, h);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const loop = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.05);
      lastTime = currentTime;

      frameCount++;
      if (currentTime - lastFpsUpdate >= 1000) {
        currentFps = frameCount;
        frameCount = 0;
        lastFpsUpdate = currentTime;
      }

      const client = clientRef.current;
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      const particles = particlesRef.current;

      if (client && renderer) {
        const snapshot = client.getSnapshot();
        const predictedPlayer = client.getPredictedPlayer();

        if (snapshot) {
          const entities = snapshot.entities;
          const player = predictedPlayer || entities.find((e) => e.id === client.playerId) || null;

          // Camera follow
          if (player) {
            camera.setTarget(player.pos);

            // Engine sound updates based on vehicle speed
            const speed = Math.hypot(player.vel.x, player.vel.y);
            const speedRatio = player.maxSpeed > 0 ? speed / player.maxSpeed : 0;
            soundEngine.updateEngine(speedRatio);

            // Emit dust trails when driving
            if (speed > 15) {
              particles.emitDust(player.pos, player.chassisAngle, speedRatio);
              particles.addTreadMark(player.pos, player.chassisAngle, player.radius * 1.1);
            }
          }

          camera.update(dt, 5000, 5000);
          particles.update(dt);

          // Get map definition
          const mapDef = snapshot.mapId ? snapshot : null;
          const currentMap = client['clientWorld']?.mapDef;

          if (currentMap) {
            renderer.render(ctx, entities, player, currentMap, snapshot.time);
          }

          // Update profiler telemetry
          if (showDebug && player) {
            const stats = client.getTickStats();
            setDebugStats({
              fps: currentFps,
              tickTime: stats.tickTime,
              entityCount: stats.entityCount,
              tickRate: stats.tickRate,
              playerPos: { x: player.pos.x, y: player.pos.y },
            });
          }
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [showDebug]);

  // F3 Key listener for debug panel toggle
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'F3') {
        e.preventDefault();
        setShowDebug((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Direct canvas click targeting
  const handleCanvasClick = (e: React.MouseEvent) => {
    soundEngine.init();
    if (!clientRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const worldPos = cameraRef.current.screenToWorld(screenPos);

    const snapshot = clientRef.current.getSnapshot();
    if (!snapshot) return;

    // Find clicked enemy entity
    let clickedEntity: SimEntity | undefined;
    for (const ent of snapshot.entities) {
      if (ent.id === clientRef.current.playerId || ent.hull <= 0) continue;
      if (ent.isHostile && dist(worldPos, ent.pos) <= ent.radius + 20) {
        clickedEntity = ent;
        break;
      }
    }

    if (clickedEntity) {
      soundEngine.playLockOn();
      clientRef.current.sendCommand({ type: 'SetTarget', targetId: clickedEntity.id });
    }
  };

  // Commands helper
  const handleCommand = useCallback((cmd: SimCommand) => {
    if (clientRef.current) {
      clientRef.current.sendCommand(cmd);
    }
  }, []);

  const handleLockNearest = useCallback(() => {
    if (!clientRef.current) return;
    const snapshot = clientRef.current.getSnapshot();
    const player = clientRef.current.getPredictedPlayer();
    if (!snapshot || !player) return;

    let nearest: SimEntity | undefined;
    let minD = 750;

    for (const ent of snapshot.entities) {
      if (ent.id === player.id || ent.hull <= 0 || !ent.isHostile) continue;
      if (ent.kind === 'gate' || ent.kind === 'loot_crate' || ent.kind === 'projectile') continue;
      const d = dist(player.pos, ent.pos);
      if (d < minD) {
        minD = d;
        nearest = ent;
      }
    }

    if (nearest) {
      soundEngine.playLockOn();
      clientRef.current.sendCommand({ type: 'SetTarget', targetId: nearest.id });
    }
  }, []);

  const handleCycleTarget = useCallback(() => {
    if (!clientRef.current) return;
    const snapshot = clientRef.current.getSnapshot();
    const player = clientRef.current.getPredictedPlayer();
    if (!snapshot || !player) return;

    const hostiles = snapshot.entities.filter(
      (e) =>
        e.id !== player.id &&
        e.hull > 0 &&
        e.isHostile &&
        dist(player.pos, e.pos) <= 800
    );

    if (hostiles.length === 0) return;

    const currentIdx = hostiles.findIndex((h) => h.id === player.targetId);
    const nextIdx = (currentIdx + 1) % hostiles.length;
    soundEngine.playLockOn();
    clientRef.current.sendCommand({ type: 'SetTarget', targetId: hostiles[nextIdx].id });
  }, []);

  const handleCycleAmmo = useCallback(() => {
    if (!clientRef.current) return;
    const player = clientRef.current.getPredictedPlayer();
    if (!player) return;

    const sequence: AmmoType[] = ['standard', 'ap', 'he'];
    const currentIdx = sequence.indexOf(player.selectedAmmo);
    const nextAmmo = sequence[(currentIdx + 1) % sequence.length];

    // If out of special ammo, allow falling back to standard
    clientRef.current.sendCommand({ type: 'SelectAmmo', ammo: nextAmmo });
  }, []);

  // Garage Handlers
  const handleBuyVehicle = (vehicleId: string) => {
    const v = VEHICLE_TIERS.find((item) => item.id === vehicleId);
    if (!v) return;
    if (profile.scrap >= v.costScrap && profile.parts >= v.costParts) {
      const updated: UserProfile = {
        ...profile,
        scrap: profile.scrap - v.costScrap,
        parts: profile.parts - v.costParts,
        unlockedVehicles: [...profile.unlockedVehicles, v.id],
        currentVehicleId: v.id,
      };
      saveProfile(updated);
    }
  };

  const handleEquipVehicle = (vehicleId: string) => {
    const updated: UserProfile = { ...profile, currentVehicleId: vehicleId };
    saveProfile(updated);
  };

  const handleBuyAndEquipPart = (partId: string, type: 'cannon' | 'armor' | 'engine') => {
    const updated: UserProfile = {
      ...profile,
      equippedParts: {
        ...profile.equippedParts,
        [type]: partId,
      },
    };
    saveProfile(updated);
  };

  const handleBuyAmmo = (type: AmmoType, count: number, cost: number) => {
    if (profile.scrap >= cost) {
      const currentCount = profile.ammoInventory[type] || 0;
      const updated: UserProfile = {
        ...profile,
        scrap: profile.scrap - cost,
        ammoInventory: {
          ...profile.ammoInventory,
          [type]: currentCount + count,
        },
      };
      saveProfile(updated);
    }
  };

  const handleResetProgress = () => {
    const resetProf = profileStoreRef.current.reset();
    setProfile(resetProf);
    if (clientRef.current) {
      clientRef.current.updateProfile(resetProf);
    }
  };

  const activeSnapshot = clientRef.current?.getSnapshot();
  const playerEntity = clientRef.current?.getPredictedPlayer() || null;
  const currentMapDef = clientRef.current?.['clientWorld']?.mapDef;
  const inSafeZone =
    currentMapDef && playerEntity && clientRef.current
      ? isInSafeZone(clientRef.current['clientWorld'], playerEntity.pos)
      : false;

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950 font-sans select-none">
      {/* 2D World Canvas */}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
      />

      {/* Title Screen Overlay */}
      {gameState === 'TITLE' && (
        <TitleScreen
          onStart={() => setGameState('PLAYING')}
          playerLevel={profile.level}
        />
      )}

      {/* In-Game HUD & Controls */}
      {gameState === 'PLAYING' && (
        <>
          <HUD
            player={playerEntity}
            entities={activeSnapshot?.entities || []}
            mapWidth={currentMapDef?.width || 4000}
            mapHeight={currentMapDef?.height || 4000}
            mapName={currentMapDef?.name || 'Green Valley'}
            isSafeZone={inSafeZone}
            profile={profile}
            chatMessages={activeSnapshot?.chatHistory || []}
            soundMuted={soundMuted}
            onToggleMute={() => {
              const next = !soundMuted;
              setSoundMuted(next);
              soundEngine.setSoundEnabled(!next);
              saveProfile({
                ...profile,
                settings: { ...profile.settings, soundEnabled: !next },
              });
            }}
            onOpenGarage={() => setGarageOpen(true)}
            onOpenInventory={() => setInventoryOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenTutorial={() => setTutorialOpen(true)}
          />

          <ControlsOverlay
            player={playerEntity}
            onCommand={handleCommand}
            onLockNearest={handleLockNearest}
            onCycleTarget={handleCycleTarget}
            onCycleAmmo={handleCycleAmmo}
          />
        </>
      )}

      {/* Tutorial Overlay */}
      {tutorialOpen && (
        <TutorialOverlay
          step={profile.tutorialStep}
          onNextStep={() => {
            const nextStep = profile.tutorialStep + 1;
            if (nextStep >= 3) {
              setTutorialOpen(false);
            }
            saveProfile({ ...profile, tutorialStep: nextStep });
          }}
          onDismiss={() => {
            setTutorialOpen(false);
            saveProfile({ ...profile, tutorialStep: 3 });
          }}
        />
      )}

      {/* Modals */}
      <GarageModal
        profile={profile}
        isOpen={garageOpen}
        onClose={() => setGarageOpen(false)}
        onBuyVehicle={handleBuyVehicle}
        onEquipVehicle={handleEquipVehicle}
        onBuyAndEquipPart={handleBuyAndEquipPart}
        onBuyAmmo={handleBuyAmmo}
      />

      <InventoryModal
        profile={profile}
        isOpen={inventoryOpen}
        onClose={() => setInventoryOpen(false)}
      />

      <SettingsModal
        profile={profile}
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onUpdateSettings={(newSettings) => {
          saveProfile({ ...profile, settings: newSettings });
          setShowDebug(newSettings.showDebug);
        }}
        onResetProgress={handleResetProgress}
      />

      {/* F3 Diagnostics Panel */}
      {showDebug && (
        <DebugPanel
          fps={debugStats.fps}
          tickTime={debugStats.tickTime}
          entityCount={debugStats.entityCount}
          tickRate={debugStats.tickRate}
          playerPos={debugStats.playerPos}
        />
      )}
    </div>
  );
};
