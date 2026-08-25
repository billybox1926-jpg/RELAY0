import React, { useState, useEffect } from 'react';
import { AudioConfig } from '../types';
import { sound } from '../game/audio';
import {
  Volume2,
  VolumeX,
  Volume1,
  Radio,
  Bell,
  AlertTriangle,
  Waves,
  Sparkles,
  RefreshCw,
  Sliders,
} from 'lucide-react';

export const AudioSettingsCard: React.FC = () => {
  const [config, setConfig] = useState<AudioConfig>(sound.config);
  const [collapsed, setCollapsed] = useState<boolean>(false);

  useEffect(() => {
    const unsub = sound.subscribe((updated) => {
      setConfig({ ...updated });
    });
    return unsub;
  }, []);

  const handleToggleMaster = () => {
    sound.enabled = !config.masterEnabled;
    if (!config.masterEnabled) {
      sound.playSuccess();
    }
  };

  const handleMasterVolume = (val: number) => {
    sound.setMasterVolume(val);
  };

  const handleToggleCategory = (cat: 'alarms' | 'ui' | 'ambient') => {
    const next = !config[cat].enabled;
    sound.setCategoryEnabled(cat, next);
    if (next) {
      if (cat === 'alarms') sound.playAlert();
      else if (cat === 'ui') sound.playKeypress();
      else sound.updateAmbient();
    }
  };

  const handleCategoryVolume = (cat: 'alarms' | 'ui' | 'ambient', val: number) => {
    sound.setCategoryVolume(cat, val);
  };

  const handlePreset = (preset: 'default' | 'stealth' | 'crt' | 'alert') => {
    sound.setPreset(preset);
    if (preset !== 'stealth') {
      sound.playSuccess();
    }
  };

  return (
    <div id="audio-settings-card" className="terminal-box rounded-lg p-4 sm:p-5 space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#00ff4120] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded bg-[#00ff4115] border border-[#00ff4140]">
            {config.masterEnabled ? (
              <Volume2 className="h-4 w-4 text-[#00ff41] animate-pulse" />
            ) : (
              <VolumeX className="h-4 w-4 text-red-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-bold text-[#00ff41] tracking-wider uppercase">
                AUDIO CONTROLLER // MULTI-CHANNEL SYNTHESIZER
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                  config.masterEnabled
                    ? 'bg-emerald-950/80 border-emerald-700 text-emerald-400'
                    : 'bg-red-950/80 border-red-800 text-red-400'
                }`}
              >
                {config.masterEnabled ? `ACTIVE (${config.masterVolume}%)` : 'MUTED'}
              </span>
            </div>
            <p className="text-[11px] text-[#558855]">
              Configure system sirens, interface acoustic feedback, and ambient terminal static
            </p>
          </div>
        </div>

        {/* Master Power Toggle & Collapse Button */}
        <div className="flex items-center gap-2">
          <button
            id="toggle-master-audio-btn"
            onClick={handleToggleMaster}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-bold transition-all border ${
              config.masterEnabled
                ? 'bg-[#00ff4125] border-[#00ff41] text-[#00ff41] hover:bg-[#00ff4135] shadow-[0_0_8px_#00ff4130]'
                : 'bg-red-950/50 border-red-800 text-red-400 hover:bg-red-900/50'
            }`}
          >
            {config.masterEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{config.masterEnabled ? 'MASTER ON' : 'MASTER MUTED'}</span>
          </button>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="px-2.5 py-1.5 rounded border border-[#00ff4130] bg-[#061408] text-[11px] text-[#88aa88] hover:text-[#00ff41] font-mono transition-colors"
          >
            {collapsed ? 'EXPAND [+]' : 'MINIMIZE [-]'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="space-y-4 pt-1">
          {/* Master Volume Bar & Quick Presets */}
          <div className="bg-[#09150980] border border-[#00ff4125] rounded p-3 font-mono space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#88ff88]">
                <Sliders className="w-3.5 h-3.5 text-[#00ff41]" />
                <span>MASTER OUTPUT GAIN</span>
                <span className="text-white font-mono font-bold">[{config.masterVolume}%]</span>
              </div>

              {/* Presets */}
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-[#558855] mr-1">PRESETS:</span>
                <button
                  onClick={() => handlePreset('default')}
                  className="px-2 py-0.5 rounded border border-[#00ff4130] bg-[#051105] text-[#88ff88] hover:bg-[#00ff4120] transition-colors"
                >
                  DEFAULT
                </button>
                <button
                  onClick={() => handlePreset('crt')}
                  className="px-2 py-0.5 rounded border border-[#a855f750] bg-[#140822] text-[#d8b4fe] hover:bg-[#a855f730] transition-colors"
                >
                  CRT IMMERSIVE
                </button>
                <button
                  onClick={() => handlePreset('alert')}
                  className="px-2 py-0.5 rounded border border-[#ffaa2250] bg-[#1a1104] text-[#ffcc88] hover:bg-[#ffaa2230] transition-colors"
                >
                  HIGH ALERT
                </button>
                <button
                  onClick={() => handlePreset('stealth')}
                  className="px-2 py-0.5 rounded border border-red-800 bg-[#160606] text-red-300 hover:bg-red-900/40 transition-colors"
                >
                  SILENT
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <VolumeX className="w-3.5 h-3.5 text-[#558855]" />
              <input
                id="master-volume-slider"
                type="range"
                min="0"
                max="100"
                value={config.masterVolume}
                disabled={!config.masterEnabled}
                onChange={(e) => handleMasterVolume(Number(e.target.value))}
                className="w-full h-1.5 bg-[#0d220f] rounded-lg appearance-none cursor-pointer accent-[#00ff41] disabled:opacity-40"
              />
              <Volume2 className="w-3.5 h-3.5 text-[#00ff41]" />
            </div>
          </div>

          {/* 3 Discrete Audio Channels */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* Channel 1: System Alarms */}
            <div
              className={`rounded-lg border p-3.5 font-mono space-y-3 transition-all ${
                config.alarms.enabled && config.masterEnabled
                  ? 'bg-[#150a0a80] border-red-500/40 shadow-[0_0_10px_#ff222210]'
                  : 'bg-[#09150960] border-[#00ff4115] opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-red-950/80 border border-red-700 text-red-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-red-300 uppercase">SYSTEM ALARMS</div>
                    <div className="text-[10px] text-[#aa7777]">Event & Hazard Sirens</div>
                  </div>
                </div>

                <button
                  id="toggle-alarms-btn"
                  onClick={() => handleToggleCategory('alarms')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                    config.alarms.enabled
                      ? 'bg-red-900/60 border-red-500 text-red-200'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-400'
                  }`}
                >
                  {config.alarms.enabled ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-[#aa7777]">Alarm Volume:</span>
                  <span className="text-red-300 font-bold">{config.alarms.volume}%</span>
                </div>
                <input
                  id="alarms-volume-slider"
                  type="range"
                  min="0"
                  max="100"
                  value={config.alarms.volume}
                  disabled={!config.alarms.enabled || !config.masterEnabled}
                  onChange={(e) => handleCategoryVolume('alarms', Number(e.target.value))}
                  className="w-full h-1 bg-[#220e0e] rounded-lg appearance-none cursor-pointer accent-red-500 disabled:opacity-30"
                />
              </div>

              <button
                id="test-alarm-sound-btn"
                disabled={!config.alarms.enabled || !config.masterEnabled}
                onClick={() => sound.testAlarm()}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded border border-red-800/60 bg-red-950/40 text-red-300 hover:bg-red-900/40 text-[11px] font-bold transition-colors disabled:opacity-40"
              >
                <AlertTriangle className="w-3 h-3 text-red-400" />
                <span>TEST ALARM SIREN</span>
              </button>
            </div>

            {/* Channel 2: UI Notifications */}
            <div
              className={`rounded-lg border p-3.5 font-mono space-y-3 transition-all ${
                config.ui.enabled && config.masterEnabled
                  ? 'bg-[#08182480] border-[#00e5ff30] shadow-[0_0_10px_#00e5ff10]'
                  : 'bg-[#09150960] border-[#00ff4115] opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-[#042436] border border-[#00e5ff60] text-[#00e5ff]">
                    <Bell className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#88ddff] uppercase">UI CHIMES</div>
                    <div className="text-[10px] text-[#6699aa]">Clicks & Rule Triggers</div>
                  </div>
                </div>

                <button
                  id="toggle-ui-sounds-btn"
                  onClick={() => handleToggleCategory('ui')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                    config.ui.enabled
                      ? 'bg-[#00e5ff30] border-[#00e5ff] text-[#88eeff]'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-400'
                  }`}
                >
                  {config.ui.enabled ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-[#6699aa]">Chime Volume:</span>
                  <span className="text-[#88ddff] font-bold">{config.ui.volume}%</span>
                </div>
                <input
                  id="ui-volume-slider"
                  type="range"
                  min="0"
                  max="100"
                  value={config.ui.volume}
                  disabled={!config.ui.enabled || !config.masterEnabled}
                  onChange={(e) => handleCategoryVolume('ui', Number(e.target.value))}
                  className="w-full h-1 bg-[#092233] rounded-lg appearance-none cursor-pointer accent-[#00e5ff] disabled:opacity-30"
                />
              </div>

              <button
                id="test-ui-sound-btn"
                disabled={!config.ui.enabled || !config.masterEnabled}
                onClick={() => sound.testUi()}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded border border-[#00e5ff50] bg-[#00e5ff15] text-[#88eeff] hover:bg-[#00e5ff25] text-[11px] font-bold transition-colors disabled:opacity-40"
              >
                <Sparkles className="w-3 h-3 text-[#00e5ff]" />
                <span>TEST UI CHIME</span>
              </button>
            </div>

            {/* Channel 3: Ambient Background Static */}
            <div
              className={`rounded-lg border p-3.5 font-mono space-y-3 transition-all ${
                config.ambient.enabled && config.masterEnabled
                  ? 'bg-[#150a2480] border-[#a855f740] shadow-[0_0_10px_#a855f715]'
                  : 'bg-[#09150960] border-[#00ff4115] opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-[#240e3b] border border-[#a855f760] text-[#c084fc]">
                    <Waves className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#e9d5ff] uppercase">AMBIENT STATIC</div>
                    <div className="text-[10px] text-[#aa88cc]">CRT Hum & Pink Noise</div>
                  </div>
                </div>

                <button
                  id="toggle-ambient-static-btn"
                  onClick={() => handleToggleCategory('ambient')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                    config.ambient.enabled
                      ? 'bg-[#a855f735] border-[#a855f7] text-[#f3e8ff]'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-400'
                  }`}
                >
                  {config.ambient.enabled ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-[#aa88cc]">Static Volume:</span>
                  <span className="text-[#d8b4fe] font-bold">{config.ambient.volume}%</span>
                </div>
                <input
                  id="ambient-volume-slider"
                  type="range"
                  min="0"
                  max="100"
                  value={config.ambient.volume}
                  disabled={!config.ambient.enabled || !config.masterEnabled}
                  onChange={(e) => handleCategoryVolume('ambient', Number(e.target.value))}
                  className="w-full h-1 bg-[#250d38] rounded-lg appearance-none cursor-pointer accent-[#a855f7] disabled:opacity-30"
                />
              </div>

              <button
                id="test-ambient-sound-btn"
                disabled={!config.ambient.enabled || !config.masterEnabled}
                onClick={() => {
                  sound.testAmbientSample();
                  sound.playBeep(440, 0.05, 'sine', 0.03);
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded border border-[#a855f750] bg-[#a855f715] text-[#f3e8ff] hover:bg-[#a855f725] text-[11px] font-bold transition-colors disabled:opacity-40"
              >
                <Radio className="w-3 h-3 text-[#c084fc]" />
                <span>PULSE STATIC SYNC</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
