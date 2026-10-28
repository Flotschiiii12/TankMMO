import React, { useState } from 'react';
import { WindowFrame } from './wm/WindowFrame.tsx';
import { Tabs, SegmentedControl } from './kit/Tabs.tsx';
import { Button } from './kit/Button.tsx';
import { tr, currentLang, setLang } from '../i18n.ts';
import { UserProfile } from '../save/profile.ts';
import { soundEngine } from '../audio/soundEngine.ts';
import { getCredential } from '../net/connect.ts';
import { Row, Slider, Toggle } from './settings/parts.tsx';
import { KeysTab } from './settings/KeysTab.tsx';
import { AccountTab } from './settings/AccountTab.tsx';
import { AboutTab } from './settings/AboutTab.tsx';

interface SettingsModalProps {
  profile: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onUpdateSettings: (newSettings: UserProfile['settings']) => void;
  onResetProgress: () => void;
  onHowToPlay?: () => void;
  onFeedback?: () => void;
}

type Tab = 'graphics' | 'audio' | 'controls' | 'interface' | 'access' | 'account' | 'about';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'graphics', label: 'Graphics' }, { id: 'audio', label: 'Audio' }, { id: 'controls', label: 'Controls' },
  { id: 'interface', label: 'Interface' }, { id: 'access', label: 'Accessibility' }, { id: 'account', label: 'Account' }, { id: 'about', label: 'About' },
];
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Settings window with seven tabs. Everything is stored in the profile settings, except key bindings (per device, see title/keybinds.ts). */
export const SettingsModal: React.FC<SettingsModalProps> = ({ profile, isOpen, onClose, onUpdateSettings, onResetProgress, onHowToPlay, onFeedback }) => {
  const [tab, setTab] = useState<Tab>('graphics');
  if (!isOpen) return null;
  const s = profile.settings;
  const set = (patch: Partial<UserProfile['settings']>) => onUpdateSettings({ ...s, ...patch });

  return (
    <WindowFrame id="settings" title="Settings" width="min(640px, 96vw)" height="min(620px, 92vh)">
      <Tabs label={tr('Settings')} value={tab} onChange={(id) => setTab(id as Tab)} tabs={TABS.map((t) => ({ id: t.id, label: tr(t.label) }))} />
      {tab === 'graphics' && (
        <div className="st-body" data-testid="tab-graphics">
          <Row title={tr('Battlefield Camera Zoom')} hint={tr('0.5x is wide, 1.2x is close. Pinch or scroll in the game also works.')}>
            <Slider setting="zoom" label={tr('Battlefield Camera Zoom')} min={0.5} max={1.2} step={0.05} value={s.zoom || 0.85} onChange={(zoom) => set({ zoom })} format={(v) => `${v.toFixed(2)}x`} />
          </Row>
          <Row title={tr('Performance mode')} hint={tr('Lower resolution (max 1.5x), fewer effects, plain ground. Turns on by itself when the game runs slowly')}>
            <Toggle setting="performanceMode" label={tr('Performance mode')} on={!!s.performanceMode} onChange={(v) => set({ performanceMode: v, perfAutoDone: true })} />
          </Row>
          <Row title={tr('Reduced effects')} hint={tr('No particles or tread marks (less motion, better on slow phones)')}>
            <Toggle setting="reducedEffects" label={tr('Reduced effects')} on={!!s.reducedEffects} onChange={(v) => set({ reducedEffects: v })} />
          </Row>
          <Row title={tr('Developer Diagnostics Overlay (F3)')} hint={tr('Displays real-time FPS, tick time, and entity counts')}>
            <Toggle setting="showDebug" label={tr('Developer Diagnostics Overlay (F3)')} on={!!s.showDebug} onChange={(v) => set({ showDebug: v })} />
          </Row>
        </div>
      )}
      {tab === 'audio' && (
        <div className="st-body" data-testid="tab-audio">
          <Row title={tr('Audio Effects & Engine Hum')}>
            <Toggle setting="soundEnabled" label={tr('Audio Effects & Engine Hum')} on={s.soundEnabled} onText={tr('Enabled')} offText={tr('Muted')} onChange={(v) => { soundEngine.setSoundEnabled(v); set({ soundEnabled: v }); }} />
          </Row>
          <Row title={tr('Master Volume')}>
            <Slider setting="masterVolume" label={tr('Master Volume')} min={0} max={1} step={0.05} value={s.masterVolume} onChange={(v) => { soundEngine.setVolume(v); set({ masterVolume: v }); }} format={pct} />
          </Row>
        </div>
      )}
      {tab === 'controls' && (
        <div className="st-body">
          <Row title={tr('On-screen controls')} hint={tr('Joystick and thumb buttons. Auto uses them on touch screens and the hotbar with mouse and keyboard.')}>
            <SegmentedControl label={tr('On-screen controls')} value={s.touchControls ?? 'auto'} onChange={(v) => set({ touchControls: v as 'auto' | 'on' | 'off' })} options={[{ id: 'auto', label: tr('Auto') }, { id: 'on', label: tr('On') }, { id: 'off', label: tr('Off') }]} />
          </Row>
          <Row title={tr('Left-handed controls')} hint={tr('Joystick on the right, fire buttons on the left')}>
            <Toggle setting="leftHanded" label={tr('Left-handed controls')} on={!!s.leftHanded} onChange={(v) => set({ leftHanded: v })} />
          </Row>
          {onHowToPlay && <Row title={tr('How to play')}><Button onClick={() => { soundEngine.playUIClick(); onHowToPlay(); }}>{tr('Replay tutorial hints')}</Button></Row>}
          <KeysTab />
        </div>
      )}
      {tab === 'interface' && (
        <div className="st-body" data-testid="tab-interface">
          <Row title={tr('Language')}>
            <SegmentedControl label={tr('Language')} value={currentLang} onChange={(v) => { if (v !== currentLang) setLang(v as 'de' | 'en'); }} options={[{ id: 'de', label: 'Deutsch' }, { id: 'en', label: 'English' }]} />
          </Row>
          <Row title={tr('HUD scale')}>
            <Slider setting="uiScale" label={tr('HUD scale')} min={0.8} max={1.4} step={0.1} value={s.uiScale || 1} onChange={(uiScale) => set({ uiScale })} format={pct} />
          </Row>
          <Row title={tr('HUD opacity')}>
            <Slider setting="hudOpacity" label={tr('HUD opacity')} min={0.3} max={1} step={0.05} value={s.hudOpacity ?? 0.7} onChange={(hudOpacity) => set({ hudOpacity })} format={pct} />
          </Row>
          <Row title={tr('Minimal HUD')} hint={tr('Only bars, target and controls: no quest tracker, events or party frames')}>
            <Toggle setting="minimalHud" label={tr('Minimal HUD')} on={!!s.minimalHud} onChange={(v) => set({ minimalHud: v })} />
          </Row>
        </div>
      )}
      {tab === 'access' && (
        <div className="st-body" data-testid="tab-access">
          <Row title={tr('Colour-blind mode')} hint={tr('Radar uses amber instead of red for enemies')}>
            <Toggle setting="colorBlind" label={tr('Colour-blind mode')} on={!!s.colorBlind} onChange={(v) => set({ colorBlind: v })} />
          </Row>
          <Row title={tr('Reduce motion')} hint={tr('Turns off window and banner animations. Also follows your system setting.')}>
            <Toggle setting="reduceMotion" label={tr('Reduce motion')} on={!!s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} />
          </Row>
          <Row title={tr('HUD scale')} hint={tr('Larger buttons and text on the HUD')}>
            <Slider setting="uiScale-a11y" label={tr('HUD scale')} min={0.8} max={1.4} step={0.1} value={s.uiScale || 1} onChange={(uiScale) => set({ uiScale })} format={pct} />
          </Row>
          <Row title={tr('Reduced effects')} hint={tr('No particles or tread marks (less motion, better on slow phones)')}>
            <Toggle setting="reducedEffects-a11y" label={tr('Reduced effects')} on={!!s.reducedEffects} onChange={(v) => set({ reducedEffects: v })} />
          </Row>
        </div>
      )}
      {tab === 'account' && <AccountTab playerName={profile.playerName} online={!!getCredential()} onResetProgress={onResetProgress} onClose={onClose} />}
      {tab === 'about' && <AboutTab onFeedback={onFeedback} />}
    </WindowFrame>
  );
};
