import React from 'react';
import { Volume2, VolumeX, Save, RotateCcw, Monitor, Terminal, Zap, Sparkles } from 'lucide-react';
import { sound } from '../game/audio';
import { DailySignalChallenge } from '../types';
import { isSignalMultiplierActive, getSignalMultiplier, formatTimeRemaining } from '../game/dailySignal';

interface HeaderProps {
  crtEnabled: boolean;
  onToggleCrt: () => void;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  onManualSave: () => void;
  onResetGame: () => void;
  saveFlash: boolean;
  dailySignal?: DailySignalChallenge;
}

export const Header: React.FC<HeaderProps> = ({
  crtEnabled,
  onToggleCrt,
  audioEnabled,
  onToggleAudio,
  onManualSave,
  onResetGame,
  saveFlash,
  dailySignal,
}) => {
  const boostActive = isSignalMultiplierActive(dailySignal);
  const multiplier = getSignalMultiplier(dailySignal);
  const boostRemaining = dailySignal?.rewardExpiresAt ? Math.max(0, dailySignal.rewardExpiresAt - Date.now()) : 0;

  return (
    <header className="relative w-full border-b border-[#00ff4140] bg-[#091109] px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Branding & Version */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded border border-[#00ff4180] bg-[#00ff4115]">
            <Terminal className="h-5 w-5 text-[#00ff41]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-wider text-[#00ff41] text-glow">
                RELAY-0
              </h1>
              <span className="text-xs text-[#00aa30] font-semibold">// NETWORK TERMINAL v1.2</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[#44aa44]">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#00ff41]" />
              <span>SYSTEM ACTIVE &bull; HOMEOSTASIS STABLE</span>
            </div>
          </div>
        </div>

        {/* Center/Right: Active Signal Multiplier Badge (if engaged) */}
        {boostActive && (
          <div className="flex items-center gap-2 rounded border border-[#00ff41] bg-[#00ff4120] px-3 py-1.5 shadow-[0_0_12px_rgba(0,255,65,0.2)] animate-pulse">
            <Zap className="h-4 w-4 fill-current text-[#00ff41]" />
            <span className="text-xs font-mono font-bold text-white">
              DAILY SIGNAL BOOST: {multiplier}x
            </span>
            <span className="text-[11px] font-mono text-[#88ff88] hidden sm:inline">
              ({formatTimeRemaining(boostRemaining)})
            </span>
          </div>
        )}

        {/* Right: Controls & Toggles */}
        <div className="flex items-center gap-2 text-xs">
          {/* Quick Save Status */}
          <button
            id="header-save-btn"
            onClick={() => {
              sound.playBeep(980, 0.05);
              onManualSave();
            }}
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 font-mono transition-all ${
              saveFlash
                ? 'border-[#00ff41] bg-[#00ff4130] text-white shadow-[0_0_12px_#00ff41]'
                : 'border-[#00ff4140] bg-[#0d1c0d] text-[#88ff88] hover:border-[#00ff4180] hover:bg-[#00ff4115]'
            }`}
            title="Force Flush Save to LocalStorage"
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{saveFlash ? 'SAVED' : 'SAVE'}</span>
          </button>

          {/* CRT Effect Toggle */}
          <button
            id="header-crt-btn"
            onClick={() => {
              sound.playKeypress();
              onToggleCrt();
            }}
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 font-mono transition-all ${
              crtEnabled
                ? 'border-[#00ff4180] bg-[#00ff4120] text-[#00ff41]'
                : 'border-[#445544] bg-[#0d1c0d] text-[#557755] hover:text-[#88aa88]'
            }`}
            title="Toggle CRT Scanline Overlay"
          >
            <Monitor className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">CRT {crtEnabled ? 'ON' : 'OFF'}</span>
          </button>

          {/* Audio Toggle */}
          <button
            id="header-audio-btn"
            onClick={() => {
              sound.playKeypress();
              onToggleAudio();
            }}
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 font-mono transition-all ${
              audioEnabled
                ? 'border-[#00ff4180] bg-[#00ff4120] text-[#00ff41]'
                : 'border-[#445544] bg-[#0d1c0d] text-[#557755] hover:text-[#88aa88]'
            }`}
            title="Toggle Audio Feedback"
          >
            {audioEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">SFX</span>
          </button>

          {/* Reset Game */}
          <button
            id="header-reset-btn"
            onClick={() => {
              sound.playAlert();
              onResetGame();
            }}
            className="flex items-center gap-1.5 rounded border border-[#ff444440] bg-[#1a0d0d] px-2.5 py-1.5 font-mono text-[#ff7777] hover:border-[#ff444480] hover:bg-[#ff444420] transition-all"
            title="Reset Game to Factory Defaults"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden md:inline">RESET</span>
          </button>
        </div>
      </div>
    </header>
  );
};
