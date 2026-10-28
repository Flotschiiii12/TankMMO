import React from 'react';
import { tr } from '../../i18n.ts';
import { soundEngine } from '../../audio/soundEngine.ts';
import type { AmmoType, SimCommand, SimEntity } from '../../sim/types.ts';
import { AMMO_ICON, GameIcon } from '../GameIcon.tsx';
import { Tooltip } from '../kit/Tooltip.tsx';
import { keybinds } from '../title/keybinds.ts';
import { useKeybinds } from '../title/useKeybinds.ts';
import { CooldownSweep, ABILITY_COOLDOWN } from './Cooldown.tsx';

const ABILITIES = [
  { id: 'smoke', key: 'Q', icon: 'smoke', label: 'Smoke' },
  { id: 'repair_kit', key: 'E', icon: 'repair', label: 'Repair kit' },
  { id: 'boost', key: 'F', icon: 'boost', label: 'Boost' },
] as const;
const ABILITY_ACTION = { smoke: 'smoke', repair_kit: 'repair', boost: 'boost' } as const;
const AMMO_ORDER: AmmoType[] = ['STANDARD', 'ARMOR_PIERCING', 'EXPLOSIVE', 'REINFORCED', 'SHAPED_CHARGE'];
const AMMO_ACTION: Partial<Record<AmmoType, 'ammo1' | 'ammo2' | 'ammo3'>> = { STANDARD: 'ammo1', ARMOR_PIERCING: 'ammo2', EXPLOSIVE: 'ammo3' };
const ammoKey = (a: AmmoType): string => (AMMO_ACTION[a] ? keybinds.label(AMMO_ACTION[a]!) : '');
const AMMO_LABEL: Record<string, string> = { STANDARD: 'Standard', ARMOR_PIERCING: 'Armor piercing', EXPLOSIVE: 'Explosive', REINFORCED: 'Reinforced', SHAPED_CHARGE: 'Shaped charge' };

/**
 * Hotbar for mouse and keyboard play (bottom centre): three abilities with cooldown sweep and key hints, the ammo slots with
 * counts, and the lock / fire button. Phones keep the thumb cluster (ControlsOverlay), which shows the same cooldown sweep.
 */
export const Hotbar: React.FC<{ player: SimEntity | null; onCommand: (c: SimCommand) => void; onLockNearest: () => void }> = ({ player, onCommand, onLockNearest }) => {
  useKeybinds();
  const autoFire = !!player?.autoFire; const hasTarget = player?.targetId !== undefined;
  const ammo = AMMO_ORDER.filter((a) => a === 'STANDARD' || (player?.ammoInventory[a] ?? 0) !== 0);
  return (
    <div className="hud-surface flex items-center gap-1.5 p-1.5 pointer-events-auto" data-hud="hotbar" data-testid="hotbar">
      {ABILITIES.map((a) => {
        const cd = player?.abilityCooldowns[a.id] || 0;
        return (
          <Tooltip key={a.id} content={`${tr(a.label)} (${keybinds.label(ABILITY_ACTION[a.id])})`}>
            <button type="button" className="k-slot" aria-label={tr(a.label)} disabled={cd > 0} onClick={() => { soundEngine.playUIClick(); onCommand({ type: 'UseAbility', abilityId: a.id }); }}>
              <GameIcon name={a.icon} size={32} className={cd > 0 ? 'opacity-40' : ''} />
              <span className="k-slot__key">{keybinds.label(ABILITY_ACTION[a.id])}</span>
              <CooldownSweep remaining={cd} total={ABILITY_COOLDOWN[a.id]} />
            </button>
          </Tooltip>
        );
      })}
      <span aria-hidden style={{ width: 1, alignSelf: 'stretch', background: 'var(--c-line)' }} />
      {ammo.map((a) => {
        const n = player?.ammoInventory[a] ?? 0; const sel = player?.selectedAmmo === a;
        return (
          <Tooltip key={a} content={`${tr(AMMO_LABEL[a] ?? a)}${ammoKey(a) ? ` (${ammoKey(a)})` : ''}`}>
            <button type="button" className="k-slot" style={{ width: 44, height: 44 }} aria-pressed={sel} aria-label={tr(AMMO_LABEL[a] ?? a)} onClick={() => { soundEngine.playUIClick(); onCommand({ type: 'SelectAmmo', ammo: a }); }}>
              <GameIcon name={AMMO_ICON[a] ?? 'ammo_standard'} size={28} />
              {ammoKey(a) && <span className="k-slot__key">{ammoKey(a)}</span>}
              <span className="k-slot__count">{n < 0 ? '∞' : n}</span>
            </button>
          </Tooltip>
        );
      })}
      <span aria-hidden style={{ width: 1, alignSelf: 'stretch', background: 'var(--c-line)' }} />
      <Tooltip content={`${hasTarget ? tr('Toggle auto fire') : tr('Lock nearest target')} (Space)`}>
        <button type="button" className="k-slot" style={{ width: 64, height: 52, background: autoFire ? 'var(--accent)' : undefined, color: autoFire ? 'var(--accent-ink)' : undefined }} aria-pressed={autoFire}
          onClick={() => { soundEngine.init(); if (!hasTarget) { soundEngine.playLockOn(); onLockNearest(); } else { soundEngine.playUIClick(); onCommand({ type: 'ToggleAutoFire' }); } }}>
          <span style={{ font: '800 11px/1.1 var(--font)', textAlign: 'center' }}>{autoFire ? tr('AUTO') : hasTarget ? tr('FIRE') : tr('LOCK')}</span>
        </button>
      </Tooltip>
    </div>
  );
};
