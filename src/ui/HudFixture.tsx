import React, { useEffect, useMemo } from 'react';
import { HUD } from './HUD.tsx';
import { ControlsOverlay } from './ControlsOverlay.tsx';
import { Hotbar } from './hud/Hotbar.tsx';
import { ChatDock } from './hud/ChatDock.tsx';
import { NotificationHistory, NotificationHost } from './hud/Notifications.tsx';
import { TargetFrame } from './hud/TargetFrame.tsx';
import { KillFeed } from './CombatHud.tsx';
import { TutorialChip } from './Guidance.tsx';
import { notifications } from './hud/notify.ts';
import { useTouchLayout } from './useTouchLayout.ts';
import { createDefaultProfile } from '../save/profile.ts';
import { createWorld } from '../../shared/sim/world.ts';
import { spawnPlayerFromCharacter } from '../../shared/sim/playerEntity.ts';
import { getMapById } from '../../shared/data/maps.ts';
import type { MapDef } from '../../shared/types.ts';
import { windows } from './wm/windowStore.ts';
import { WindowKeys } from './wm/WindowKeys.tsx';
import { ToastHost } from './kit/Toast.tsx';

/**
 * Worst-case HUD for the layout check (`#/hud-fixture`): target with statuses and a long name, three party members, running
 * cooldowns, event lines, quests, notices, kill feed and a long chat line, all at once. Not reachable from the game.
 */
export default function HudFixture() {
  const touch = useTouchLayout(new URLSearchParams(location.hash.split('?')[1] ?? '').get('touch') === '1' ? 'on' : 'auto');
  const { profile, entities, player } = useMemo(() => {
    const profile = createDefaultProfile();
    profile.playerName = 'Commander-With-A-Long-Name';
    profile.character.wallet.scrap = 1_240_000; profile.character.level = 24;
    const world = createWorld({ map: getMapById(1) as MapDef, seed: 3, populate: false });
    const player = spawnPlayerFromCharacter(world, profile.character, { x: 900, y: 900 });
    const mk = (name: string, x: number) => { const c = createDefaultProfile().character; c.name = name; const e = spawnPlayerFromCharacter(world, c, { x, y: 900 }); e.name = name; return e; };
    const target = mk('Extremely Long Elite Enemy Name', 1200); target.isHostile = true; target.isElite = true; target.level = 31; target.hull = target.maxHull * 0.55;
    target.statusEffects = [{ type: 'burning', duration: 4, maxDuration: 6 }, { type: 'slowed', duration: 2, maxDuration: 5 }, { type: 'marked', duration: 8, maxDuration: 10 }, { type: 'stunned', duration: 1, maxDuration: 2 }];
    player.targetId = target.id; player.hull = player.maxHull * 0.45; player.abilityCooldowns = { smoke: 11, boost: 4 };
    player.statusEffects = [{ type: 'boosted', duration: 5, maxDuration: 8 }, { type: 'repairing', duration: 3, maxDuration: 6 }];
    const party = ['Alpha', 'Bravo-Long-Name', 'Charlie'].map((n, i) => mk(n, 1000 + i * 60));
    return { profile, entities: [player, target, ...party], player };
  }, []);
  useEffect(() => {
    profile.character.quests.active = {};
    notifications.push({ group: 'loot', key: 'scrap', title: '', amount: 1250, unit: 'scrap' }); notifications.push({ group: 'xp', key: 'xp', title: '', amount: 320, unit: 'XP' }); notifications.push({ group: 'quest', title: 'Quest ready: Salvage run', kind: 'success' });
    windows.closeAll();
  }, [profile]);
  const rec = (c: { type: string }) => { ((window as unknown as { __cmds?: string[] }).__cmds ??= []).push(c.type); };
  const msgs = [{ id: 'm1', sender: 'SomeVeryLongPlayerName', channel: 'G', text: 'A long chat message that should be cut off by the ticker instead of growing the dock sideways across the screen', timestamp: 1 }] as never[];
  const target = entities[1];
  return (
    <div className="k-root" style={{ position: 'fixed', inset: 0, background: 'linear-gradient(135deg, #1e293b, #0f172a)' }} data-testid="hud-fixture">
      <WindowKeys />
      <ToastHost />
      <NotificationHistory />
      <HUD player={player} entities={entities} mapWidth={4000} mapHeight={4000} partyNames={['Alpha', 'Bravo-Long-Name', 'Charlie']} mapName="Gravel Bay Outpost" isSafeZone eventLines={['Invasion · 12:30', 'Weekend XP +50 %']} profile={profile} soundMuted={false} onToggleMute={() => {}} hasSocial
        navPips={{ inventory: 3, quests: 1, social: true, map: true, notifications: 4 }} leftHanded={new URLSearchParams(location.hash.split('?')[1] ?? '').get('left') === '1'}
        tutorialChip={<TutorialChip step="drive" done={0} total={11} onSkip={() => {}} />}
        hasTarget targetNode={<TargetFrame target={target} me={player} ammo={{ STANDARD: -1, ARMOR_PIERCING: 12, EXPLOSIVE: 4 }} />}
        feedNode={<KillFeed entries={[{ id: 1, text: 'Gunner Truck destroyed', until: Date.now() + 1e9, boss: false }, { id: 2, text: 'Boss Cape Warden destroyed', until: Date.now() + 1e9, boss: true }]} />} />
      <ControlsOverlay player={player} onCommand={rec} onLockNearest={() => {}} onCycleTarget={() => {}} onCycleAmmo={() => {}} leftHanded={new URLSearchParams(location.hash.split('?')[1] ?? '').get('left') === '1'} visual={touch} />
      {!touch && <div className="absolute left-1/2 -translate-x-1/2 z-20" style={{ bottom: 'max(0.75rem, var(--safe-bottom))' }}><Hotbar player={player} onCommand={rec} onLockNearest={() => {}} /></div>}
      <NotificationHost touchLayout={touch} />
      <ChatDock client={null} messages={msgs} touchLayout={touch} />
    </div>
  );
}
