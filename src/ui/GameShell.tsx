import React, { useEffect, useRef, useState, useCallback } from 'react';
import { tr, nm, localizeEntityName } from '../i18n.ts';
import { Camera } from '../render/camera.ts';
import { ParticleSystem } from '../render/particles.ts';
import { WorldRenderer } from '../render/worldRenderer.ts';
import { GameClient, LocalGameClient } from '../net/client.ts';
import { OnlineGameClient } from '../net/onlineClient.ts';
import { LocalStorageProfileStore, UserProfile } from '../save/profile.ts';
import { SimRNG } from '../../shared/prng.ts';
import { calculateKillXP } from '../../shared/rules/progression.ts';
import { rollLoot } from '../../shared/data/loot.ts';
import * as C from '../../shared/rules/character.ts';
import type { CharacterState } from '../../shared/rules/character.ts';
import { AMMO_PRICES, ammoCost, executeAction, ClientAction } from '../../shared/rules/actions.ts';
import { QUEST_BY_ID } from '../../shared/data/quests.ts';
import { describeItem } from '../game/actions.ts';
import { applyQuestEvent, rotateQuests, questName } from '../game/questBridge.ts';
import type { QuestEvent } from '../../shared/rules/quests.ts';
import { QuestModal } from './QuestModal.tsx';
import { SocialModal } from './SocialModal.tsx';
import { ChatDock, EMOTES } from './hud/ChatDock.tsx';
import { Hotbar } from './hud/Hotbar.tsx';
import { NotificationHistory, NotificationHost, useNotifications } from './hud/Notifications.tsx';
import { TargetFrame } from './hud/TargetFrame.tsx';
import { notifications, diffCharacter, type CharSnapshot } from './hud/notify.ts';
import { ChatWindow } from './social/ChatWindow.tsx';
import { ProfileWindow } from './social/ProfileWindow.tsx';
import { chatStore, setChatName, useChat } from './social/chat.ts';
import { CareerWindow } from './career/CareerWindow.tsx';
import { MarketWindow } from './items/MarketWindow.tsx';
import { useTouchLayout } from './useTouchLayout.ts';
import { Banner, BossBar, ProgressChip } from './Overlays.tsx';
import { soundEngine } from '../audio/soundEngine.ts';
import { AmmoType, dist, SimCommand, SimEntity, SimEvent } from '../sim/types.ts';
import { HUD } from './HUD.tsx';
import { ControlsOverlay } from './ControlsOverlay.tsx';
import { SpectateBar } from './SpectateBar.tsx';
import { DialogueModal } from './Dialogue.tsx';
import { pendingScene } from '../../shared/rules/quests.ts';
import type { StoryScene } from '../../shared/data/story.ts';
import { HintToast, HowToPlay, TutorialChip } from './Guidance.tsx';
import { markShown, newHintMemory, nextHint, type HintState } from '../../shared/rules/hints.ts';
import { tutorialStatus, tutorialFlag, questMarkers } from '../../shared/rules/quests.ts';
import { TUTORIAL_STEPS } from '../../shared/data/quests.ts';
import { WAR_MAPS } from '../../shared/sim/war.ts';
import { activeEvents, eventAppliesToMap, worldBossSlot, WORLD_BOSS_PERIOD_SECONDS } from '../../shared/sim/events.ts';
import { KillFeed, LowHealthVignette } from './CombatHud.tsx';
import { DamageNumberMerger, killFeedEntry, type KillFeedEntry } from './combatLogic.ts';
import { impactLevel, RING_BY_LEVEL, SPARKS_BY_LEVEL } from '../render/combatFx.ts';
import { GarageModal } from './GarageModal.tsx';
import { InventoryModal } from './InventoryModal.tsx';
import { dprCap, PerfMonitor } from './perfMonitor.ts';
import { useWindowFlag } from './wm/useWindows.ts';
import { useNavPips } from './useNavPips.ts';
import { WindowKeys } from './wm/WindowKeys.tsx';
import { HelpOverlay } from './wm/HelpOverlay.tsx';
import { SettingsModal } from './SettingsModal.tsx';
import { FeedbackModal } from './FeedbackModal.tsx';
import { TutorialOverlay } from './TutorialOverlay.tsx';
import { DebugPanel } from './DebugPanel.tsx';
import { TitleScreen } from './TitleScreen.tsx';
import { PortraitWarning } from './PortraitWarning.tsx';
import { WorldMapModal } from './WorldMapModal.tsx';
import { isInSafeZone, spawnDebugTargetEnemies } from '../sim/world.ts';

function isInClientSafeZone(def: { safeZones?: Array<{ x: number; y: number; radius: number }>; safeZone?: { x: number; y: number; radius: number } }, pos: { x: number; y: number }): boolean {
  const zones = def.safeZones && def.safeZones.length > 0 ? def.safeZones : def.safeZone ? [def.safeZone] : [];
  return zones.some((z) => (pos.x - z.x) ** 2 + (pos.y - z.y) ** 2 <= z.radius * z.radius);
}

/** "Invasion · 12:30" for every world event that is running on this map right now (schedule only, no server state needed). */
function runningEventLines(mapId: number): string[] {
  const now = Date.now() / 1000;
  const lines: string[] = [];
  for (const e of activeEvents(now)) {
    if (!eventAppliesToMap(e.kind, mapId)) continue;
    lines.push(`${nm(`event.${e.kind}.name`, e.kind.replace(/_/g, ' '))} · ${fmtClock(e.endsAt - now)}`);
  }
  const wb = worldBossSlot(now);
  if (wb.mapId === mapId) lines.push(`${nm('event.world_boss.name', 'World Boss')} · ${fmtClock(wb.startsAt + WORLD_BOSS_PERIOD_SECONDS - now)}`);
  return lines;
}
/** One plain-language line after a player kill / death, including why honor was withheld. */
function pvpSummaryText(d: any): string {
  if (d.role === 'death') return tr('Defeated by {other} (-{n} honor)', { other: d.other, n: -d.honor });
  const parts: string[] = [];
  if (d.honor > 0) parts.push(tr('Kill: {other} (+{honor} honor)', { other: d.other, honor: d.honor }));
  else if (d.reason === 'level_gap') parts.push(tr('Kill: {other}, no honor: the level gap is more than {n}', { other: d.other, n: 5 }));
  else if (d.reason === 'repeat_target') parts.push(tr('Kill: {other}, no honor: you were paid for this player in the last {n} minutes', { other: d.other, n: 30 }));
  else parts.push(tr('Kill: {other} (+{honor} honor)', { other: d.other, honor: 0 }));
  if (d.bounty > 0) parts.push(tr('Bounty claimed: +{n} scrap', { n: d.bounty }));
  if (d.capped) parts.push(tr('You can not hit {other} for the next hour: kill limit reached', { other: d.other }));
  return parts.join(' · ');
}
const FACTION_LABEL: Record<string, string> = { coastal: 'Coastal Union', highland: 'Highland Union', steppe: 'Steppe Caravan' };
const fmtClock = (sec: number) => { const s = Math.max(0, Math.floor(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export const GameShell: React.FC<{ online?: OnlineGameClient | null }> = ({ online }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Persistence
  const profileStoreRef = useRef(new LocalStorageProfileStore());
  const [profile, setProfile] = useState<UserProfile>(() => profileStoreRef.current.load());

  // Game UI States
  const [gameState, setGameState] = useState<'TITLE' | 'PLAYING'>('TITLE');
  const [garageOpen, setGarageOpen] = useWindowFlag('garage');
  const [questOpen, setQuestOpen] = useWindowFlag('quests');
  const [socialOpen, setSocialOpen] = useWindowFlag('social');
  const [notices, setNotices] = useState<string[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const lastEmoteTs = useRef(0);
  const arenaRef = useRef<{ phase: string; round: number; wins: number[]; endsAt: number } | null>(null);
  const gateRef = useRef<{ wave: number; total: number; endsAt: number } | null>(null);
  const moveTargetRef = useRef<{ x: number; y: number } | null>(null);
  const lastMoveSend = useRef(0);
  const [progress, setProgress] = useState<string | null>(null);
  const [spectating, setSpectating] = useState(false);
  const mergerRef = useRef(new DamageNumberMerger());
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([]);
  const [howToOpen, setHowToOpen] = useWindowFlag('howto');
  const [feedbackOpen, setFeedbackOpen] = useWindowFlag('feedback');
  const [replayScene, setReplayScene] = useState<StoryScene | null>(null);
  const warRef = useRef<Array<{ id: string; x: number; y: number; radius: number; owner: string | null; progress: Record<string, number>; contested: boolean }>>([]);
  const warOwnersRef = useRef<Record<string, string | null>>({});
  const [warLines, setWarLines] = useState<string[]>([]);
  const [hint, setHint] = useState<{ id: string; text: string } | null>(null);
  const hintMemRef = useRef(newHintMemory());
  const lastSpecialAmmo = useRef(0);
  useEffect(() => { if (!online) return; const t = setInterval(() => setSpectating(online.spectating), 400); return () => clearInterval(t); }, [online]);
  const [, forceRender] = useState(0);
  const [partyNames, setPartyNames] = useState<string[]>([]);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showBanner = useCallback((text: string) => {
    setBanner(text);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 4000);
  }, []);
  const [inventoryOpen, setInventoryOpen] = useWindowFlag('inventory');
  const [settingsOpen, setSettingsOpen] = useWindowFlag('settings');
  const [worldMapOpen, setWorldMapOpen] = useWindowFlag('map');
  const [tutorialOpen, setTutorialOpen] = useState(profile.tutorialStep < 4);

  const [showDebug, setShowDebug] = useState(profile.settings.showDebug);
  const [soundMuted, setSoundMuted] = useState(!profile.settings.soundEnabled);

  // Tutorial tracking
  const drivenDistanceRef = useRef(0);

  // Pinch-to-zoom tracking
  const activeTouchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDistRef = useRef<number | null>(null);

  // Profiler stats
  const drawStatsRef = useRef({ avg: 0, worst: 0 });
  const [debugStats, setDebugStats] = useState({
    drawMs: 0,
    drawWorstMs: 0,
    fps: 60,
    tickTime: 0,
    entityCount: 0,
    tickRate: 30,
    playerPos: { x: 2000, y: 2000 },
  });

  // Client & Engine References
  const clientRef = useRef<(GameClient & Record<string, any>) | null>(null);
  const cameraRef = useRef<Camera>(new Camera());
  const particlesRef = useRef<ParticleSystem>(new ParticleSystem());
  const rendererRef = useRef<WorldRenderer | null>(null);

  // Initialize LocalGameClient once
  useEffect(() => {
    const client: GameClient & Record<string, any> = online ?? new LocalGameClient(profile);
    clientRef.current = client;
    if (online) {
      const adopt = (ch: CharacterState, ammo: Record<string, number>) =>
        setProfile((prev) => ({ ...prev, playerName: ch.name, currentMapId: String(online.mapId), character: ch, ammoInventory: { ...prev.ammoInventory, ...(ammo as any) } }));
      if (online.character) adopt(online.character, online.ammo);
      online.onCharacter(adopt);
      const refreshParty = () => void online.social({ op: 'party_info' }).then((r) => setPartyNames(r.ok && r.data ? r.data.members.map((m: any) => m.name) : []));
      refreshParty();
      setChatName(online.character?.name ?? profile.playerName);
      online.onChat((m) => chatStore.add(m));
      online.onSocialEvent((kind, d) => {
        if (kind === 'party_update') setPartyNames(d ? d.members.map((m: any) => m.name) : []);
        const text = kind === 'friend_request' ? tr('{from} sent you a friend request', { from: d.from }) : kind === 'friend_accepted' ? tr('{from} is now your friend', { from: d.from }) : kind === 'party_invite' ? tr('{from} invited you to a party', { from: d.from }) : kind === 'clan_invite' ? tr('{from} invited you to {clan}', { from: d.from, clan: d.clan }) : kind === 'pvp_summary' ? pvpSummaryText(d) : kind === 'event_reward' ? tr('{event} reward: +{scrap} scrap for {kills} kills', { event: nm(`event.${d.event}.name`, d.event), scrap: d.scrap, kills: d.kills }) : kind === 'announcement' ? `${tr('Announcement')}: ${d.text}` : kind === 'achievement' ? `${tr('Achievement unlocked')}: ${String(d.id).replace('ach_', '').replace(/_/g, ' ')}` : kind === 'dungeon' && d.result ? `${tr('Gate')} ${tr(String(d.result))}` : kind === 'arena_start' ? tr('Arena match starting') : kind === 'arena_round' ? `${tr('Round over')}: ${d.wins?.join(' - ')}` : kind === 'arena_result' ? `${d.won ? tr('Arena won') : tr('Arena lost')} (${d.ratingDelta >= 0 ? '+' : ''}${d.ratingDelta})` : '';
        if (text) setNotices((n) => [...n.slice(-4), text]);
        if (kind === 'arena_phase') { arenaRef.current = { phase: d.phase, round: d.round, wins: d.wins, endsAt: Date.now() + d.secondsLeft * 1000 }; setProgress('arena'); }
        else if (kind === 'arena_start') setProgress(`${tr('Arena')} · ${tr('Round')} 1`);
        else if (kind === 'arena_round' && !arenaRef.current) setProgress(`${tr('Arena')} · ${d.wins?.join(' - ')}`);
        else if (kind === 'arena_result') { arenaRef.current = null; setProgress(null); }
        if (text && (kind.startsWith('arena') || kind === 'dungeon' || kind === 'achievement' || kind === 'event_reward' || kind === 'pvp_summary' || kind === 'announcement')) showBanner(text);
      });
    }
    rendererRef.current = new WorldRenderer(cameraRef.current, particlesRef.current);

    soundEngine.setSoundEnabled(profile.settings.soundEnabled);
    soundEngine.setVolume(profile.settings.masterVolume);

    // Apply saved user zoom
    if (profile.settings.zoom !== undefined) {
      cameraRef.current.setUserZoom(profile.settings.zoom);
    }

    // Check ?debug=1 URL parameter for rapid testing
    if (typeof window !== 'undefined' && window.location.search.includes('debug=1')) {
      (window as any).__tf = { client };
      setShowDebug(true);
      setProfile((prev) => {
        const character = structuredClone(prev.character);
        character.wallet.scrap = Math.max(character.wallet.scrap, 50000);
        character.wallet.fragments = Math.max(character.wallet.fragments, 5000);
        for (const k of ['iron', 'copper', 'titanium', 'crystal'] as const) character.wallet.ore[k] = Math.max(character.wallet.ore[k], 5000);
        const updated = {
          ...prev,
          character,
          settings: { ...prev.settings, showDebug: true },
        };
        profileStoreRef.current.save(updated);
        return updated;
      });

      // Spawn test target enemies right outside safe zone
      try {
        const inst = client['realm'].getInstance(client['currentMapId']);
        const p = inst.getPlayer(client.playerId);
        if (p) {
          spawnDebugTargetEnemies(inst.world, p.pos);
        }
      } catch (err) {
        console.warn('Debug spawn error:', err);
      }
    }

    // Event listener for simulation events
    const unsub = client.onEvent((event: SimEvent) => {
      handleSimEvent(event);
    });

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

  // Feed a game event to the quest log (auto-completion detection happens in the shared rules)
  const questEvent = useCallback((ev: QuestEvent) => {
    if (clientRef.current?.sendAction) {
      // Online: the server tracks quests; only the tutorial steps are reported by the client.
      if (ev.type === 'tutorial') void clientRef.current.sendAction({ kind: 'tutorial', step: ev.step });
      return;
    }
    setProfile((prev) => {
      const { profile: next, ready } = applyQuestEvent(prev, ev);
      for (const id of ready) {
        const me = clientRef.current?.getPredictedPlayer();
        if (me) particlesRef.current.emitDamageText({ x: me.pos.x, y: me.pos.y - 50 }, `${tr('Quest ready')}: ${questName(id)}`, '#34d399');
      }
      if (next !== prev) profileStoreRef.current.save(next);
      return next;
    });
  }, []);

  // The HUD (chat, boss bar, radar) reads the live snapshot at render time: refresh it 5 times a second.
  useEffect(() => {
    const id = setInterval(() => forceRender((n) => (n + 1) % 1e6), 200);
    return () => clearInterval(id);
  }, []);

  // Faction war: poll the control points while on a war map (zones 21 - 24), draw them, show a chip and announce captures
  useEffect(() => {
    if (!online || gameState !== 'PLAYING') return;
    const id = setInterval(async () => {
      if (!WAR_MAPS.includes(online.mapId)) { if (warRef.current.length) { warRef.current = []; warOwnersRef.current = {}; setWarLines([]); if (rendererRef.current) rendererRef.current.warPoints = []; } return; }
      const r = await online.social({ op: 'war_status' });
      if (!r.ok) return;
      const pts = r.data.points as typeof warRef.current;
      const mine = r.data.myFaction as string;
      for (const p of pts) {
        const prev = warOwnersRef.current[p.id];
        if (prev !== undefined && prev !== p.owner) {
          if (p.owner === mine) showBanner(tr('Control point captured by {faction}', { faction: tr(FACTION_LABEL[p.owner] ?? p.owner) }));
          else if (p.owner) showBanner(tr('Control point lost to {faction}', { faction: tr(FACTION_LABEL[p.owner] ?? p.owner) }));
        }
        warOwnersRef.current[p.id] = p.owner;
      }
      warRef.current = pts;
      if (rendererRef.current) rendererRef.current.warPoints = pts;
      const me = clientRef.current?.getPredictedPlayer();
      const near = me ? pts.map((p, i) => ({ p, i, d: Math.hypot(p.x - me.pos.x, p.y - me.pos.y) })).filter((x) => x.d < 1100).sort((a, b) => a.d - b.d)[0] : undefined;
      setWarLines(near ? [tr('Control point {n}: {owner} {pct} %', { n: near.i + 1, owner: near.p.owner ? tr(FACTION_LABEL[near.p.owner] ?? near.p.owner) : tr('neutral'), pct: Math.round(Math.max(...Object.values(near.p.progress))) }) + (near.p.contested ? ` · ${tr('contested')}` : '')] : []);
    }, 2000);
    return () => clearInterval(id);
  }, [online, gameState, showBanner]);

  // Contextual hints for new players: evaluated twice a second, shown for 8 s, never nagging (see shared/rules/hints.ts)
  useEffect(() => {
    if (gameState !== 'PLAYING') return;
    const id = setInterval(() => {
      const me = clientRef.current?.getPredictedPlayer();
      const def = clientRef.current?.['clientWorld']?.mapDef;
      if (!me || !def) return;
      const ch = profileRef.current.character;
      const ammo = profileRef.current.ammoInventory as Record<string, number>;
      const special = Object.entries(ammo).filter(([k]) => k !== 'STANDARD').reduce((a, [, v]) => a + Math.max(0, v), 0);
      const s: HintState = {
        level: ch.level, mapId: Number(clientRef.current?.['mapId'] ?? 1), inSafeZone: isInClientSafeZone(def, me.pos), hullRatio: me.maxHull > 0 ? me.hull / me.maxHull : 1,
        inventoryFull: ch.inventory.length >= C.inventoryCapacity(ch), specialAmmo: special, specialAmmoJustRanOut: lastSpecialAmmo.current > 0 && special === 0,
        unspentTalentPoints: C.talentPointsAvailable(ch), tutorialDone: tutorialStatus(ch).step === undefined,
      };
      lastSpecialAmmo.current = special;
      const h = nextHint(s, hintMemRef.current, Date.now() / 1000);
      if (h) { markShown(hintMemRef.current, h.id, Date.now() / 1000); setHint({ id: h.id, text: h.textKey }); setTimeout(() => setHint((cur) => (cur?.id === h.id ? null : cur)), 8000); }
    }, 500);
    return () => clearInterval(id);
  }, [gameState]);

  // Accessibility: reduced effects and UI scale follow the settings
  useEffect(() => {
    const lowFx = !!profile.settings.reducedEffects || !!profile.settings.performanceMode;
    particlesRef.current.enabled = !profile.settings.reducedEffects; // performance mode keeps the effects but caps them
    particlesRef.current.setReduced(lowFx);
    if (rendererRef.current) { rendererRef.current.reducedEffects = lowFx; rendererRef.current.plainGround = !!profile.settings.performanceMode; rendererRef.current.colorBlind = !!profile.settings.colorBlind; rendererRef.current.uiScale = profile.settings.uiScale || 1; }
    document.documentElement.style.setProperty('--ui-scale', String(profile.settings.uiScale || 1));
  }, [profile.settings.reducedEffects, profile.settings.performanceMode, profile.settings.uiScale, profile.settings.colorBlind]);
  useEffect(() => { window.dispatchEvent(new Event('resize')); }, [profile.settings.performanceMode]); // re-applies the DPR cap

  // Rotate daily/weekly quests on start and when the level changes (more quests become eligible)
  useEffect(() => {
    setProfile((prev) => {
      const next = rotateQuests(prev);
      if (next !== prev) profileStoreRef.current.save(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (profile.character.level > 1) questEvent({ type: 'tutorial', step: 'levelup' });
  }, [profile.character.level]);

  // Handle Simulation Events
  const handleSimEvent = useCallback(
    (event: SimEvent) => {
      const particles = particlesRef.current;
      const camera = cameraRef.current;

      switch (event.type) {
        case 'projectile_fired': {
          const isPlayer = !!clientRef.current && event.shooterId === clientRef.current.playerId;
          if (!event.isSecondary) {
            const family = clientRef.current?.getEntity(event.shooterId)?.weaponFamily;
            particles.emitMuzzleFlash(event.pos, event.angle, family);
            soundEngine.playCannonShot(isPlayer);
          }
          // Tutorial auto-advance: Player fired cannon!
          if (isPlayer && !event.isSecondary) questEvent({ type: 'tutorial', step: 'fire' });
          if (isPlayer && !event.isSecondary && profile.tutorialStep === 2) {
            saveProfile({ ...profile, tutorialStep: 3 });
          }
          break;
        }

        case 'drone_fx': { rendererRef.current?.drones.onEvent(event, performance.now() / 1000); break; }
        case 'event_ended': { showBanner(`${tr('Event over')}: ${nm(`event.${event.kind}.name`, tr(event.kind.replace(/_/g, ' ')))}`); break; }
        case 'event_started': { showBanner(`${tr('Event')}: ${nm(`event.${event.kind}.name`, tr(event.kind.replace(/_/g, ' ')))}`); break; }
        case 'dungeon_wave': { showBanner(`${tr('Wave')} ${event.wave} / ${event.total}`); gateRef.current = { wave: event.wave, total: event.total, endsAt: event.timeLeft != null ? Date.now() + event.timeLeft * 1000 : 0 }; setProgress('gate'); break; }
        case 'dungeon_cleared': { showBanner(tr('Gate cleared!')); setProgress(null); gateRef.current = null; break; }
        case 'dungeon_failed': { showBanner(`${tr('Gate failed')} (${tr(String(event.reason))})`); setProgress(null); gateRef.current = null; break; }
        case 'boss_rewards': { showBanner(tr('Boss defeated')); break; }
        case 'explosion': {
          particles.emitExplosion(event.pos, true);
          particles.emitRing(event.pos, Math.min(160, event.radius ?? 80), '#f97316');
          soundEngine.playExplosion(true);
          camera.addShake(8);
          break;
        }

        case 'damage_dealt': {
          {
            const victim = clientRef.current?.getEntity(event.targetId);
            const level = impactLevel(event.finalDamage, victim ? victim.maxHull + victim.maxArmor : 1000);
            particles.emitHitSparks(event.pos, SPARKS_BY_LEVEL[level], event.armorDamage > 0 ? '#38bdf8' : '#f97316');
            if (RING_BY_LEVEL[level]) particles.emitRing(event.pos, RING_BY_LEVEL[level], event.isCrit ? '#fde047' : '#f97316');
            if (event.isCrit) particles.emitRing(event.pos, 30, '#fde047');
            if (event.armorDamage > 0 && victim && victim.armor <= 1 && victim.maxArmor > 0) { particles.emitRing(event.pos, 44, '#38bdf8'); particles.emitDamageText(event.pos, tr('ARMOR BREAK'), '#38bdf8', true); }
            if (event.isRearHit) particles.emitDamageText({ x: event.pos.x, y: event.pos.y + 14 }, tr('REAR'), '#fb923c');
          }
          soundEngine.playImpact(event.armorDamage > 0);
          if (event.finalDamage > 0) mergerRef.current.add(event.targetId, event.pos, event.finalDamage, { crit: event.isCrit || event.isRearHit, armor: event.armorDamage > 0 }, performance.now());
          if (clientRef.current && event.targetId === clientRef.current.playerId) {
            camera.addShake(event.finalDamage > 400 ? 14 : 6);
          }
          break;
        }

        case 'entity_killed': {
          {
            const v = clientRef.current?.getEntity(event.victimId);
            const k = event.killerId !== undefined ? clientRef.current?.getEntity(event.killerId) : undefined;
            const fe = v ? killFeedEntry({ id: v.id, kind: v.kind, isElite: v.isElite, name: v.kind === 'player' ? v.name : localizeEntityName(v.name) }, k?.name ?? '?', performance.now()) : undefined;
            if (fe) setKillFeed((f) => [...f.filter((x) => x.until > performance.now()), fe].slice(-4));
          }
          particles.emitExplosion(event.pos, true);
          soundEngine.playExplosion(true);
          camera.addShake(10);
          if (!clientRef.current || event.killerId !== clientRef.current.playerId || clientRef.current.sendAction) break;
          const victim = clientRef.current.getEntity(event.victimId);
          if (!victim || !victim.isHostile) break;
          const isBoss = victim.kind === 'boss';
          questEvent({ type: 'kill', kind: victim.archetypeId ? victim.kind : victim.kind, level: victim.level, isElite: !!victim.isElite, isBoss });
          if (isBoss) questEvent({ type: 'defeat_boss', bossId: victim.archetypeId || 'boss' });
          setProfile((prev) => {
            const next = structuredClone(prev);
            const ch = next.character;
            const rng = new SimRNG((Date.now() ^ (event.victimId * 2654435761)) >>> 0);
            const xp = calculateKillXP(ch.level, victim.level, !!victim.isElite, isBoss);
            const before = ch.level;
            const { levelsGained } = C.grantXP(ch, xp);
            C.addMasteryXp(ch, ch.activeVehicle, Math.round(xp / 4));
            if (xp > 0) particles.emitDamageText(event.pos, `+${xp} XP`, '#a78bfa');
            if (levelsGained > 0) particles.emitDamageText(event.pos, `${tr('LEVEL UP!')} [Lv.${ch.level}]`, '#10b981');
            const loot = rollLoot(rng, victim.level, 1, !!victim.isElite, isBoss, ch.pityCounter);
            ch.pityCounter = loot.newPityCounter;
            if (loot.itemId && loot.rarity) {
              const made = C.createItem(ch, loot.itemId, loot.rarity, rng);
              if (made.ok) {
                const info = describeItem(made.item);
                particles.emitDamageText({ x: event.pos.x, y: event.pos.y - 30 }, info.name, info.color);
              }
            }
            if (loot.keys > 0) ch.wallet.gateKeys += loot.keys;
            profileStoreRef.current.save(next);
            if (clientRef.current && (levelsGained > 0 || before !== ch.level)) clientRef.current.updateProfile(next);
            return next;
          });
          break;
        }

        case 'ability_used': {
          // Tutorial auto-advance: Player used an ability!
          if (profile.tutorialStep === 3) {
            const updated = { ...profile, tutorialStep: 4 };
            saveProfile(updated);
            setTutorialOpen(false);
          }
          break;
        }

        case 'loot_collected': {
          if (!clientRef.current || event.collectorId !== clientRef.current.playerId) break;
          soundEngine.playPickup();
          { const [k0, s0] = event.crateType.split(':'); const col = k0 === 'ore' ? '#38bdf8' : k0 === 'scrap' ? '#eab308' : k0 === 'parts' ? '#a78bfa' : '#4ade80'; if (clientRef.current.sendAction) particles.emitDamageText(event.pos, `+${event.amount} ${tr(String(k0 === 'ore' ? s0 || 'ore' : k0 === 'scrap' ? 'Scrap' : k0))}`, col); }
          if (clientRef.current.sendAction) break; // server applies the reward
          questEvent({ type: 'tutorial', step: 'loot' });
          const [kind, sub] = event.crateType.split(':');
          if (kind === 'ore') {
            questEvent({ type: 'collect_ore', ore: sub || 'iron', amount: event.amount });
            particles.emitDamageText(event.pos, `+${event.amount} ${tr(String(sub || 'ore')).toUpperCase()}`, '#38bdf8');
          } else if (kind === 'scrap') {
            particles.emitDamageText(event.pos, `+${event.amount} ${tr('Scrap')}`, '#eab308');
          }

          // Tutorial auto-advance: Collected loot!
          if (profile.tutorialStep === 3) {
            saveProfile({ ...profile, tutorialStep: 4 });
            setTutorialOpen(false);
          }

          // Update user profile currencies
          setProfile((prev) => {
            const next = structuredClone(prev);
            const w = next.character.wallet;
            if (kind === 'scrap') w.scrap += event.amount;
            else if (kind === 'parts') w.fragments += event.amount;
            else if (kind === 'ore' && sub) w.ore[sub as 'iron'] += event.amount;
            else if (kind === 'ammo' && sub) next.ammoInventory[sub as AmmoType] = (next.ammoInventory[sub as AmmoType] || 0) + event.amount;
            else return prev;
            profileStoreRef.current.save(next);
            return next;
          });
          break;
        }

        case 'gate_used': {
          if (!clientRef.current || event.entityId !== clientRef.current.playerId) break;
          soundEngine.playGateHum();
          if (clientRef.current.sendAction) break; // server moves the player and sends s_map
          camera.addShake(7);
          clientRef.current.switchMap(event.targetMapId, event.gateId);
          questEvent({ type: 'use_portal', mapId: Number(event.targetMapId) });
          questEvent({ type: 'reach_map', mapId: Number(event.targetMapId) });
          questEvent({ type: 'tutorial', step: 'portal' });
          setProfile((prev) => {
            const updated = { ...prev, currentMapId: event.targetMapId };
            profileStoreRef.current.save(updated);
            return updated;
          });
          break;
        }

        case 'player_died': {
          if (!clientRef.current || event.entityId !== clientRef.current.playerId || clientRef.current.sendAction) break;
          // Drop 10% scrap on death (keep 90%)
          setProfile((prev) => {
            const updated = structuredClone(prev);
            updated.character.wallet.scrap = Math.floor(updated.character.wallet.scrap * 0.9);
            profileStoreRef.current.save(updated);
            return updated;
          });
          break;
        }
      }
    },
    [profile, saveProfile]
  );

  // Main Render & Animation Loop
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
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap(profileRef.current.settings.performanceMode));
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
      if (perfRef.current.frame(currentTime - lastTime)) perfActionRef.current();
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
          const specClient = client as unknown as { spectating?: boolean; freeCam?: { x: number; y: number }; spectateTarget?: () => import('../../shared/types.ts').SimEntity | null };
          const spectate = !!specClient.spectating;
          const player = spectate ? (specClient.spectateTarget?.() ?? null) : (predictedPlayer || entities.find((e) => e.id === client.playerId) || null);
          if (spectate && !player && specClient.freeCam) camera.setTarget(specClient.freeCam);

          if (player) {
            camera.setTarget(player.pos);

            // Engine sound updates based on vehicle speed
            const speed = Math.hypot(player.vel.x, player.vel.y);
            const speedRatio = player.maxSpeed > 0 ? speed / player.maxSpeed : 0;
            soundEngine.updateEngine(speedRatio);

            // Emit dust trails and tread marks when driving
            if (speed > 15) {
              particles.emitDust(player.pos, player.chassisAngle, speedRatio);
              particles.addTreadMark(player.pos, player.chassisAngle, player.radius * 1.1);

              // Tutorial auto-advance: Driving tracking
              drivenDistanceRef.current += speed * dt;
              if (profile.tutorialStep === 0 && drivenDistanceRef.current >= 50) {
                saveProfile({ ...profile, tutorialStep: 1 });
              }
            }

            // Tutorial auto-advance: Target locked
            if (profile.tutorialStep === 1 && player.targetId !== undefined) {
              saveProfile({ ...profile, tutorialStep: 2 });
            }
          }

          for (const n of mergerRef.current.flush(performance.now())) particles.emitDamageText(n.pos, n.text, n.armor ? '#38bdf8' : '#ef4444', n.crit);
          camera.update(dt, 5000, 5000);
          particles.update(dt);

          const currentMap = client['clientWorld']?.mapDef;
          if (currentMap) {
            renderer.viewerFaction = player?.faction;
            const drawT0 = performance.now();
            renderer.render(ctx, entities, player, currentMap, snapshot.time);
            const drawMs = performance.now() - drawT0;
            drawStatsRef.current = { avg: drawStatsRef.current.avg * 0.9 + drawMs * 0.1, worst: Math.max(drawMs, drawStatsRef.current.worst * 0.98) };
          }

          // Emotes arrive as map chat consisting only of an emote glyph: show them as bubbles
          for (const m of snapshot.chatHistory || []) {
            if (m.channel === 'M' && m.timestamp !== lastEmoteTs.current && (EMOTES as readonly string[]).includes(m.text) && Date.now() - m.timestamp < 4000) {
              renderer.bubbles.set(m.sender, { text: m.text, until: performance.now() + 4000 });
              lastEmoteTs.current = m.timestamp;
            }
          }

          // Click-to-move: steer toward the clicked ground point, stop on arrival
          const mt = moveTargetRef.current;
          if (mt && player && player.hull > 0) {
            const dx = mt.x - player.pos.x, dy = mt.y - player.pos.y;
            const d = Math.hypot(dx, dy);
            if (d < 50) {
              moveTargetRef.current = null;
              client.sendCommand({ type: 'Drive', x: 0, y: 0 });
            } else {
              // slow down for the last 250 units so the tank does not overshoot
              const k = Math.min(1, d / 250);
              if (performance.now() - lastMoveSend.current > 100) {
                lastMoveSend.current = performance.now();
                client.sendCommand({ type: 'Drive', x: (dx / d) * Math.max(0.35, k), y: (dy / d) * Math.max(0.35, k) });
              }
              const sp = camera.worldToScreen(mt);
              const pulse = 1 + 0.15 * Math.sin(performance.now() / 150);
              ctx.save();
              ctx.strokeStyle = 'rgba(251,191,36,0.9)';
              ctx.lineWidth = 2;
              ctx.beginPath(); ctx.arc(sp.x, sp.y, 14 * pulse, 0, Math.PI * 2); ctx.stroke();
              ctx.beginPath(); ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(251,191,36,0.9)'; ctx.fill();
              ctx.restore();
            }
          }

          // Update profiler telemetry
          if (showDebug && player) {
            const stats = client.getTickStats();
            setDebugStats({
              drawMs: Math.round(drawStatsRef.current.avg * 10) / 10,
              drawWorstMs: Math.round(drawStatsRef.current.worst),
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
  }, [profile, saveProfile, showDebug]);

  // F3 debug panel; window shortcuts and Escape live in wm/WindowKeys
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) moveTargetRef.current = null;
      if (e.code === 'F3') {
        e.preventDefault();
        setShowDebug((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);


  // Multi-Touch Pinch-to-Zoom & Canvas Interaction Handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    soundEngine.init();
    activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activeTouchesRef.current.size === 2) {
      const points = Array.from(activeTouchesRef.current.values());
      lastPinchDistRef.current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeTouchesRef.current.has(e.pointerId)) {
      activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (activeTouchesRef.current.size === 2 && lastPinchDistRef.current !== null) {
      const points = Array.from(activeTouchesRef.current.values());
      const currentDist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (lastPinchDistRef.current > 0) {
        const factor = currentDist / lastPinchDistRef.current;
        cameraRef.current.adjustZoom(factor);
      }
      lastPinchDistRef.current = currentDist;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    activeTouchesRef.current.delete(e.pointerId);
    if (activeTouchesRef.current.size < 2) {
      lastPinchDistRef.current = null;
      // Persist chosen zoom to settings
      if (cameraRef.current.userZoomOverride !== null) {
        saveProfile({
          ...profile,
          settings: { ...profile.settings, zoom: cameraRef.current.userZoomOverride },
        });
      }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.05 : 0.95;
    cameraRef.current.adjustZoom(factor);
    if (cameraRef.current.userZoomOverride !== null) {
      saveProfile({
        ...profile,
        settings: { ...profile.settings, zoom: cameraRef.current.userZoomOverride },
      });
    }
  };

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
      if (isAttackable(clientRef.current?.getPredictedPlayer() ?? null, ent) && dist(worldPos, ent.pos) <= ent.radius + 20) {
        clickedEntity = ent;
        break;
      }
    }

    if (clickedEntity) {
      soundEngine.playLockOn();
      clientRef.current.sendCommand({ type: 'SetTarget', targetId: clickedEntity.id });
    } else {
      // empty ground: drive there (DarkOrbit style)
      moveTargetRef.current = worldPos;
      lastMoveSend.current = 0;
    }
  };

  // Commands helper
  const eventLinesNow = [...runningEventLines(online ? online.mapId : Number(profile.currentMapId) || 1), ...warLines];
  const touchLayout = useTouchLayout(profile.settings.touchControls);
  const { unread } = useNotifications();
  const chatUnread = useChat();
  const navPips = { ...useNavPips(profile.character, online, inventoryOpen, eventLinesNow.length > 0), notifications: unread, chat: chatUnread.mentions > 0 ? chatUnread.mentions : chatUnread.total > 0 };
  // HUD opacity as a CSS variable (panels read it), notices derived from character changes (loot, XP, level-ups, ready quests)
  useEffect(() => { document.documentElement.style.setProperty('--hud-opacity', String(profile.settings.hudOpacity ?? 0.7)); }, [profile.settings.hudOpacity]);
  const prevChar = useRef<CharSnapshot | null>(null);
  useEffect(() => {
    const ch = profile.character;
    const snap: CharSnapshot = { xp: ch.xp, level: ch.level, scrap: ch.wallet.scrap, fragments: ch.wallet.fragments, ore: Object.values(ch.wallet.ore).reduce((a, b) => a + b, 0), itemUids: ch.inventory.map((i) => i.uid), readyQuests: Object.values(ch.quests.active).filter((q) => q.ready).map((q) => q.id), honor: ch.wallet.honor };
    const prev = prevChar.current; prevChar.current = snap;
    if (!prev || gameState !== 'PLAYING') return;
    const itemName = (uid: string) => { const it = ch.inventory.find((i) => i.uid === uid); return it ? describeItem(it).name : uid; };
    const questName = (id: string) => { const d = QUEST_BY_ID.get(id); return d ? nm(d.nameKey, d.name) : id; };
    for (const n of diffCharacter(prev, snap, itemName, questName, { levelUp: (lv) => tr('Level up! You are now level {n}', { n: lv }), xp: 'XP', scrap: tr('scrap'), fragments: tr('fragments'), ore: tr('ore'), honor: tr('honor'), questReady: tr('Quest ready') })) notifications.push(n);
  }, [profile.character, gameState]); // eslint-disable-line react-hooks/exhaustive-deps
  // opening the garage by any route (menu, G key) completes the garage lesson of the guided start
  useEffect(() => { if (garageOpen) questEvent({ type: 'tutorial', step: 'garage' }); }, [garageOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const perfRef = useRef(new PerfMonitor());
  /** Frames stayed above 22 ms for 5 s: switch to performance mode once (never again after the player decided) and say so. */
  const perfActionRef = useRef<() => void>(() => {});
  perfActionRef.current = () => {
    const p = profileRef.current;
    if (p.settings.performanceMode || p.settings.perfAutoDone) return;
    saveProfile({ ...p, settings: { ...p.settings, performanceMode: true, perfAutoDone: true } });
    showBanner(tr('Performance mode turned on because the game was running slowly. You can change it in Settings.'));
  };

  /** Workshop/garage/quest actions: sent to the server when online, executed with the same shared rules when offline. */
  const performAction = useCallback(async (action: ClientAction): Promise<{ ok: boolean; error?: string }> => {
    const client = clientRef.current;
    if (client?.sendAction) return client.sendAction(action);
    const next: UserProfile = structuredClone(profileRef.current);
    const me = client?.getPredictedPlayer();
    const def = client?.['clientWorld']?.mapDef;
    const r = executeAction(next.character, action, new SimRNG((Date.now() ^ (next.character.nextUid * 2654435761)) >>> 0), {
      inSafeZone: !!me && !!def && isInClientSafeZone(def, me.pos),
      nowSeconds: Math.floor(Date.now() / 1000),
      buyAmmo: (ammo, packs) => {
        const price = AMMO_PRICES[ammo];
        const n = Math.floor(packs);
        if (!price || n < 1) return { ok: false, error: 'bad_request' };
        const cost = ammoCost(next.character, ammo, n)!;
        if (next.character.wallet.scrap < cost) return { ok: false, error: 'not_enough_scrap' };
        next.character.wallet.scrap -= cost;
        next.ammoInventory[ammo] = (next.ammoInventory[ammo] || 0) + price.pack * n;
        return { ok: true };
      },
    });
    if (r.ok) {
      profileRef.current = next;
      saveProfile(next);
    }
    return r.ok ? { ok: true } : { ok: false, error: (r as any).error };
  }, [saveProfile]);

  /** Can the local player attack this entity? Monsters always; players only of another faction at level 15+ (the server decides for real). */
  const isAttackable = (me: SimEntity | null, e: SimEntity): boolean =>
    e.isHostile || (!!me && e.kind === 'player' && e.id !== me.id && !!me.faction && !!e.faction && e.faction !== me.faction && me.level >= 15 && e.level >= 15);

  const handleCommand = useCallback((cmd: SimCommand) => {
    if (cmd.type === 'Drive' && (Math.abs(cmd.x) > 0.2 || Math.abs(cmd.y) > 0.2)) questEvent({ type: 'tutorial', step: 'drive' });
    if (cmd.type === 'SetTarget' && cmd.targetId !== null && cmd.targetId !== undefined) questEvent({ type: 'tutorial', step: 'lock' });
    if (clientRef.current) {
      clientRef.current.sendCommand(cmd);
    }
  }, [questEvent]);

  const handleLockNearest = useCallback(() => {
    if (!clientRef.current) return;
    const snapshot = clientRef.current.getSnapshot();
    const player = clientRef.current.getPredictedPlayer();
    if (!snapshot || !player) return;

    let nearest: SimEntity | undefined;
    let minD = 750;

    for (const ent of snapshot.entities) {
      if (ent.id === player.id || ent.hull <= 0 || !isAttackable(player, ent)) continue;
      if (ent.kind === 'gate' || ent.kind === 'loot_crate' || ent.kind === 'projectile' || ent.kind === 'mine') continue;
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
        isAttackable(player, e) &&
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

    const sequence: AmmoType[] = ['STANDARD', 'ARMOR_PIERCING', 'EXPLOSIVE'];
    const currentIdx = sequence.indexOf(player.selectedAmmo);
    const nextAmmo = sequence[(currentIdx + 1) % sequence.length];

    clientRef.current.sendCommand({ type: 'SelectAmmo', ammo: nextAmmo });
  }, []);

  // Garage Handlers
  const handleResetProgress = () => {
    const resetProf = profileStoreRef.current.reset();
    setProfile(resetProf);
    if (clientRef.current) {
      clientRef.current.updateProfile(resetProf);
    }
  };

  const handleTravelToMap = useCallback(
    (targetMapId: number | string) => {
      if (online) {
        void online.social({ op: 'fast_travel', mapId: Number(targetMapId) });
        return;
      }
      if (clientRef.current) {
        soundEngine.playGateHum();
        cameraRef.current.addShake(7);
        clientRef.current.fastTravelToMap(String(targetMapId));
        setProfile((prev) => {
          const updated = { ...prev, currentMapId: String(targetMapId) };
          profileStoreRef.current.save(updated);
          return updated;
        });
      }
    },
    []
  );

  const activeSnapshot = clientRef.current?.getSnapshot();
  const playerEntity = clientRef.current?.getPredictedPlayer() || null;

  const currentMapDef = clientRef.current?.['clientWorld']?.mapDef;
  const inSafeZone =
    currentMapDef && playerEntity && clientRef.current
      ? isInClientSafeZone(currentMapDef, playerEntity.pos)
      : false;

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950 font-sans select-none touch-none">
      {/* Portrait Mode Warning Overlay */}
      <PortraitWarning />

      {/* 2D World Canvas with Pinch-to-Zoom & Mouse Wheel */}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="absolute inset-0 w-full h-full cursor-crosshair touch-none select-none"
      />

      {/* Title Screen Overlay */}
      {gameState === 'TITLE' && (
        <TitleScreen
          onStart={() => setGameState('PLAYING')}
          playerLevel={profile.character.level}
        />
      )}

      {/* In-Game HUD & Controls */}
      {gameState === 'PLAYING' && (
        <>
          <HUD
            leftHanded={!!profile.settings.leftHanded}
            minimal={!!profile.settings.minimalHud}
            hasTarget={playerEntity?.targetId !== undefined}
            targetNode={<TargetFrame target={playerEntity?.targetId !== undefined ? (clientRef.current?.getEntity(playerEntity.targetId) ?? null) : null} me={playerEntity} ammo={profile.ammoInventory as any} colorBlind={profile.settings.colorBlind} />}
            feedNode={<KillFeed entries={killFeed.filter((e) => e.until > performance.now())} />}
            tutorialChip={(() => { const t = tutorialStatus(profile.character); return t.step ? <TutorialChip step={t.step} done={t.done} total={t.total} onSkip={() => { void performAction({ kind: 'skip_tutorial' }); }} /> : undefined; })()}
            player={playerEntity}
            entities={activeSnapshot?.entities || []}
            mapWidth={currentMapDef?.width || 4000}
            mapHeight={currentMapDef?.height || 4000}
            partyNames={partyNames}
            mapName={currentMapDef?.name || 'Green Valley'}
            eventLines={eventLinesNow}
            isSafeZone={inSafeZone}
            profile={profile}
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
            hasSocial={!!online}
            navPips={navPips}
          />


          <HintToast text={hint?.text ?? null} onClose={() => setHint(null)} />
          <LowHealthVignette me={playerEntity} />
          {spectating && online && <SpectateBar client={online} onLeave={() => { void online.social({ op: 'spectate_leave' }); }} />}
          <ControlsOverlay
            player={playerEntity}
            onCommand={handleCommand}
            onLockNearest={handleLockNearest}
            onCycleTarget={handleCycleTarget}
            onCycleAmmo={handleCycleAmmo}
            leftHanded={!!profile.settings.leftHanded}
            visual={touchLayout}
          />
          {!touchLayout && <div className="absolute left-1/2 -translate-x-1/2 z-20" style={{ bottom: 'max(0.75rem, var(--safe-bottom))' }}><Hotbar player={playerEntity} onCommand={handleCommand} onLockNearest={handleLockNearest} /></div>}
          <NotificationHost leftHanded={!!profile.settings.leftHanded} touchLayout={touchLayout} minimal={!!profile.settings.minimalHud} />

          {/* The old 4-card tutorial overlay is gone: the guided start (chip in the HUD) replaces it. */}
        </>
      )}

      {/* Modals */}
      <GarageModal
        profile={profile}
        isOpen={garageOpen}
        onClose={() => setGarageOpen(false)}
        onAction={performAction}
      />

      {online && <SocialModal client={online} isOpen={socialOpen} onClose={() => setSocialOpen(false)} notices={notices} character={profile.character} />}
      {gameState === 'PLAYING' && <ChatDock client={online ?? null} messages={activeSnapshot?.chatHistory || []} leftHanded={!!profile.settings.leftHanded} touchLayout={touchLayout} />}
      <NotificationHistory />
      <MarketWindow client={online ?? null} profile={profile} />
      <CareerWindow profile={profile} onAction={performAction} />
      <ChatWindow client={online ?? null} character={profile.character} myName={profile.character.name} />
      <ProfileWindow client={online ?? null} myName={profile.character.name} />
      {gameState === 'PLAYING' && <Banner text={banner} />}
      {gameState === 'PLAYING' && <ProgressChip text={progress === 'arena' && arenaRef.current ? `${tr('Arena')} · ${tr('Round')} ${arenaRef.current.round} · ${arenaRef.current.wins.join(' - ')} · ${arenaRef.current.phase === 'fighting' ? '' : arenaRef.current.phase === 'break' ? `${tr('Break')} ` : `${tr('Start in')} `}${fmtClock(Math.max(0, (arenaRef.current.endsAt - Date.now()) / 1000))}` : progress === 'gate' && gateRef.current ? `${tr('Gate')} · ${tr('Wave')} ${gateRef.current.wave} / ${gateRef.current.total}${gateRef.current.endsAt ? ` · ${fmtClock((gateRef.current.endsAt - Date.now()) / 1000)}` : ''}` : progress} />}
      {gameState === 'PLAYING' && <BossBar player={playerEntity} entities={activeSnapshot?.entities || []} />}

      <QuestModal
        profile={profile}
        isOpen={questOpen}
        onClose={() => setQuestOpen(false)}
        onReplay={(sc) => { setQuestOpen(false); setReplayScene(sc); }}
        onAction={performAction}
      />

      <InventoryModal
        profile={profile}
        isOpen={inventoryOpen}
        onClose={() => setInventoryOpen(false)}
        onAction={performAction}
      />

      <WorldMapModal isOpen={worldMapOpen} onClose={() => setWorldMapOpen(false)} currentMapId={online ? online.mapId : profile.currentMapId} playerLevel={profile.character.level} onTravelToMap={(id) => { setWorldMapOpen(false); handleTravelToMap(id); }} questMapIds={questMarkers(profile.character).mapIds} visitedMaps={profile.character.visitedMaps} scrap={profile.character.wallet.scrap} inSafeZone={inSafeZone} />
      {gameState === 'PLAYING' && (() => {
        const blocked = garageOpen || inventoryOpen || socialOpen || settingsOpen || worldMapOpen || questOpen || howToOpen;
        const scene = replayScene ?? (blocked ? null : pendingScene(profile.character) ?? null);
        return <DialogueModal scene={scene} onDone={(id) => { if (replayScene) setReplayScene(null); else void performAction({ kind: 'scene_seen', sceneId: id }); }} />;
      })()}
      <HowToPlay open={howToOpen} onClose={() => setHowToOpen(false)} done={TUTORIAL_STEPS.filter((s) => profile.character.stats[tutorialFlag(s)] === 1)} />
      <WindowKeys enabled={gameState === 'PLAYING'} />
      <HelpOverlay />
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} send={online ? (r) => online.social({ op: 'feedback', ...r }) : null} />
      <SettingsModal
        onHowToPlay={() => { setSettingsOpen(false); setHowToOpen(true); }}
        onFeedback={() => { setSettingsOpen(false); setFeedbackOpen(true); }}
        profile={profile}
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onUpdateSettings={(newSettings) => {
          saveProfile({ ...profile, settings: newSettings });
          setShowDebug(newSettings.showDebug);
          if (newSettings.zoom !== undefined) {
            cameraRef.current.setUserZoom(newSettings.zoom);
          }
        }}
        onResetProgress={handleResetProgress}
      />

      {/* F3 Diagnostics Panel */}
      {showDebug && (
        <DebugPanel
          fps={debugStats.fps}
          drawMs={debugStats.drawMs}
          drawWorstMs={debugStats.drawWorstMs}
          tickTime={debugStats.tickTime}
          entityCount={debugStats.entityCount}
          tickRate={debugStats.tickRate}
          playerPos={debugStats.playerPos}
        />
      )}
    </div>
  );
};
