import React, { useState } from 'react';
import { UserProfile } from '../save/profile.ts';
import { soundEngine } from '../audio/soundEngine.ts';
import { Settings as SettingsIcon, Volume2, VolumeX, RefreshCcw, X } from 'lucide-react';

interface SettingsModalProps {
  profile: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onUpdateSettings: (newSettings: UserProfile['settings']) => void;
  onResetProgress: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  profile,
  isOpen,
  onClose,
  onUpdateSettings,
  onResetProgress,
}) => {
  const [confirmReset, setConfirmReset] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 text-slate-200 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <SettingsIcon className="text-orange-500" size={20} />
            <h3 className="font-semibold text-white text-base">Game Settings</h3>
          </div>
          <button
            onClick={() => {
              soundEngine.playUIClick();
              onClose();
            }}
            className="text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-xs">
          {/* Sound Mute Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950/50 border border-slate-800">
            <div className="flex items-center gap-2.5">
              {profile.settings.soundEnabled ? (
                <Volume2 size={16} className="text-orange-400" />
              ) : (
                <VolumeX size={16} className="text-slate-500" />
              )}
              <span className="font-medium text-white">Audio Effects & Engine Hum</span>
            </div>
            <button
              onClick={() => {
                const next = !profile.settings.soundEnabled;
                soundEngine.setSoundEnabled(next);
                onUpdateSettings({ ...profile.settings, soundEnabled: next });
              }}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                profile.settings.soundEnabled
                  ? 'bg-orange-500 text-slate-950'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {profile.settings.soundEnabled ? 'Enabled' : 'Muted'}
            </button>
          </div>

          {/* Volume Slider */}
          <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800 space-y-2">
            <div className="flex justify-between text-slate-400">
              <span>Master Volume</span>
              <span className="tabular-nums text-white">
                {Math.round(profile.settings.masterVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={profile.settings.masterVolume}
              onChange={(e) => {
                const vol = parseFloat(e.target.value);
                soundEngine.setVolume(vol);
                onUpdateSettings({ ...profile.settings, masterVolume: vol });
              }}
              className="w-full accent-orange-500 cursor-pointer"
            />
          </div>

          {/* Debug Overlay Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950/50 border border-slate-800">
            <div>
              <span className="font-medium text-white">Developer Diagnostics Overlay (F3)</span>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Displays real-time FPS, tick time, and entity counts
              </div>
            </div>
            <button
              onClick={() => {
                soundEngine.playUIClick();
                onUpdateSettings({ ...profile.settings, showDebug: !profile.settings.showDebug });
              }}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                profile.settings.showDebug
                  ? 'bg-orange-500 text-slate-950'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {profile.settings.showDebug ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Reset Progress Section */}
          <div className="p-3 rounded-lg bg-red-950/20 border border-red-900/40">
            <div className="text-red-300 font-medium flex items-center gap-1.5">
              <RefreshCcw size={14} />
              <span>Reset Game Progress</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Clears saved vehicles, scrap, and returns profile to starter Patchwork Scout.
            </div>

            {confirmReset ? (
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => {
                    soundEngine.playUIClick();
                    onResetProgress();
                    setConfirmReset(false);
                    onClose();
                  }}
                  className="px-3 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-semibold transition-colors"
                >
                  Confirm Reset
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmReset(true)}
                className="mt-2.5 px-3 py-1 rounded bg-red-900/50 hover:bg-red-800/80 text-red-200 font-medium transition-colors"
              >
                Reset Progress
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 text-right">
          <button
            onClick={() => {
              soundEngine.playUIClick();
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
