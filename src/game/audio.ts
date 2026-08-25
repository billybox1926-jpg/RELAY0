// ============================================================
// RELAY-0 - Retro Terminal Audio Synthesizer (Web Audio API)
// Multi-Channel SoundFX & Ambient Static Generator
// ============================================================

import { AudioConfig } from '../types';

const STORAGE_KEY = 'relay0_audio_config';

export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  masterEnabled: true,
  masterVolume: 80,
  alarms: {
    enabled: true,
    volume: 85,
  },
  ui: {
    enabled: true,
    volume: 65,
  },
  ambient: {
    enabled: false,
    volume: 35,
  },
};

function loadStoredAudioConfig(): AudioConfig {
  if (typeof window === 'undefined') return DEFAULT_AUDIO_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        masterEnabled: typeof parsed.masterEnabled === 'boolean' ? parsed.masterEnabled : DEFAULT_AUDIO_CONFIG.masterEnabled,
        masterVolume: typeof parsed.masterVolume === 'number' ? Math.max(0, Math.min(100, parsed.masterVolume)) : DEFAULT_AUDIO_CONFIG.masterVolume,
        alarms: {
          enabled: typeof parsed.alarms?.enabled === 'boolean' ? parsed.alarms.enabled : DEFAULT_AUDIO_CONFIG.alarms.enabled,
          volume: typeof parsed.alarms?.volume === 'number' ? Math.max(0, Math.min(100, parsed.alarms.volume)) : DEFAULT_AUDIO_CONFIG.alarms.volume,
        },
        ui: {
          enabled: typeof parsed.ui?.enabled === 'boolean' ? parsed.ui.enabled : DEFAULT_AUDIO_CONFIG.ui.enabled,
          volume: typeof parsed.ui?.volume === 'number' ? Math.max(0, Math.min(100, parsed.ui.volume)) : DEFAULT_AUDIO_CONFIG.ui.volume,
        },
        ambient: {
          enabled: typeof parsed.ambient?.enabled === 'boolean' ? parsed.ambient.enabled : DEFAULT_AUDIO_CONFIG.ambient.enabled,
          volume: typeof parsed.ambient?.volume === 'number' ? Math.max(0, Math.min(100, parsed.ambient.volume)) : DEFAULT_AUDIO_CONFIG.ambient.volume,
        },
      };
    }
  } catch {
    // fallback
  }
  return { ...DEFAULT_AUDIO_CONFIG };
}

class SoundFX {
  private ctx: AudioContext | null = null;
  public config: AudioConfig = loadStoredAudioConfig();

  // Ambient synth nodes
  private ambientGain: GainNode | null = null;
  private ambientNoiseSource: AudioBufferSourceNode | null = null;
  private ambientOsc60: OscillatorNode | null = null;
  private ambientOsc120: OscillatorNode | null = null;
  private ambientRunning: boolean = false;

  // Listeners for UI state synchronisation
  private listeners: Array<(cfg: AudioConfig) => void> = [];

  constructor() {
    // Sync initial state
  }

  public subscribe(fn: (cfg: AudioConfig) => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l({ ...this.config }));
    this.saveConfig();
  }

  private saveConfig() {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
      } catch {
        // storage ignored
      }
    }
  }

  public get enabled(): boolean {
    return this.config.masterEnabled;
  }

  public set enabled(val: boolean) {
    this.config.masterEnabled = val;
    this.updateAmbient();
    this.notify();
  }

  public setMasterVolume(vol: number) {
    this.config.masterVolume = Math.max(0, Math.min(100, vol));
    this.updateAmbient();
    this.notify();
  }

  public setCategoryEnabled(cat: 'alarms' | 'ui' | 'ambient', enabled: boolean) {
    this.config[cat].enabled = enabled;
    if (cat === 'ambient') {
      this.updateAmbient();
    }
    this.notify();
  }

  public setCategoryVolume(cat: 'alarms' | 'ui' | 'ambient', vol: number) {
    this.config[cat].volume = Math.max(0, Math.min(100, vol));
    if (cat === 'ambient') {
      this.updateAmbient();
    }
    this.notify();
  }

  public setPreset(preset: 'default' | 'stealth' | 'crt' | 'alert') {
    if (preset === 'default') {
      this.config = { ...DEFAULT_AUDIO_CONFIG };
    } else if (preset === 'stealth') {
      this.config.masterEnabled = false;
    } else if (preset === 'crt') {
      this.config = {
        masterEnabled: true,
        masterVolume: 85,
        alarms: { enabled: true, volume: 75 },
        ui: { enabled: true, volume: 50 },
        ambient: { enabled: true, volume: 55 },
      };
    } else if (preset === 'alert') {
      this.config = {
        masterEnabled: true,
        masterVolume: 100,
        alarms: { enabled: true, volume: 100 },
        ui: { enabled: true, volume: 40 },
        ambient: { enabled: false, volume: 20 },
      };
    }
    this.updateAmbient();
    this.notify();
  }

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private getUiEffectiveGain(baseGain: number): number {
    if (!this.config.masterEnabled || !this.config.ui.enabled) return 0;
    const masterMult = this.config.masterVolume / 100;
    const catMult = this.config.ui.volume / 100;
    return baseGain * masterMult * catMult;
  }

  private getAlarmEffectiveGain(baseGain: number): number {
    if (!this.config.masterEnabled || !this.config.alarms.enabled) return 0;
    const masterMult = this.config.masterVolume / 100;
    const catMult = this.config.alarms.volume / 100;
    return baseGain * masterMult * catMult;
  }

  // ==========================================
  // UI Sound Effects
  // ==========================================

  playKeypress() {
    const effGain = this.getUiEffectiveGain(0.04);
    if (effGain <= 0.0001) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.03);

      gain.gain.setValueAtTime(effGain, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.03);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.03);
    } catch {
      // Ignore
    }
  }

  playBeep(freq: number = 880, dur: number = 0.08, type: OscillatorType = 'square', vol: number = 0.05) {
    const effGain = this.getUiEffectiveGain(vol);
    if (effGain <= 0.0001) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(effGain, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + dur);
    } catch {
      // Ignore
    }
  }

  playSuccess() {
    const effGain = this.getUiEffectiveGain(0.045);
    if (effGain <= 0.0001) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.04);
        gain.gain.setValueAtTime(effGain, now + i * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.04 + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + i * 0.04);
        osc.stop(now + i * 0.04 + 0.08);
      });
    } catch {
      // Ignore
    }
  }

  playInfoChirp() {
    const effGain = this.getUiEffectiveGain(0.04);
    if (effGain <= 0.0001) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      [600, 900].forEach((freq, i) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.05);
        gain.gain.setValueAtTime(effGain, now + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.05 + 0.06);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + i * 0.05);
        osc.stop(now + i * 0.05 + 0.06);
      });
    } catch {
      // Ignore
    }
  }

  // ==========================================
  // System Alarms
  // ==========================================

  playAlert() {
    const effGain = this.getAlarmEffectiveGain(0.06);
    if (effGain <= 0.0001) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      [300, 240].forEach((freq, i) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        gain.gain.setValueAtTime(effGain, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.1);
      });
    } catch {
      // Ignore
    }
  }

  playCriticalAlarm() {
    const effGain = this.getAlarmEffectiveGain(0.085);
    if (effGain <= 0.0001) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      [440, 220, 440, 220].forEach((freq, i) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + i * 0.09);
        gain.gain.setValueAtTime(effGain, now + i * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + i * 0.09);
        osc.stop(now + i * 0.09 + 0.08);
      });
    } catch {
      // Ignore
    }
  }

  // ==========================================
  // Ambient Static & CRT Resonance Generator
  // ==========================================

  public updateAmbient() {
    const shouldPlay = this.config.masterEnabled && this.config.ambient.enabled;
    const targetGain = shouldPlay
      ? 0.015 * (this.config.masterVolume / 100) * (this.config.ambient.volume / 100)
      : 0.00001;

    try {
      this.initCtx();
      if (!this.ctx) return;

      if (shouldPlay && !this.ambientRunning) {
        this.startAmbientNodes();
      }

      if (this.ambientGain) {
        const now = this.ctx.currentTime;
        this.ambientGain.gain.cancelScheduledValues(now);
        this.ambientGain.gain.setValueAtTime(this.ambientGain.gain.value, now);
        this.ambientGain.gain.linearRampToValueAtTime(targetGain, now + 0.15);
      }
    } catch {
      // Ignore ambient error
    }
  }

  private startAmbientNodes() {
    if (!this.ctx) return;
    try {
      // Master ambient gain node
      const masterAmbGain = this.ctx.createGain();
      masterAmbGain.gain.setValueAtTime(0.00001, this.ctx.currentTime);
      masterAmbGain.connect(this.ctx.destination);
      this.ambientGain = masterAmbGain;

      // 1. Pink Noise Static Buffer (3 seconds looped)
      const bufferSize = this.ctx.sampleRate * 3;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
        b6 = white * 0.115926;
      }

      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;

      // Lowpass / Bandpass filter for warm vintage warmth
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, this.ctx.currentTime);

      noiseSource.connect(filter);
      filter.connect(masterAmbGain);
      noiseSource.start();
      this.ambientNoiseSource = noiseSource;

      // 2. 60Hz and 120Hz CRT Transformer Hum
      const osc60 = this.ctx.createOscillator();
      const osc60Gain = this.ctx.createGain();
      osc60.type = 'sine';
      osc60.frequency.setValueAtTime(60, this.ctx.currentTime);
      osc60Gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      osc60.connect(osc60Gain);
      osc60Gain.connect(masterAmbGain);
      osc60.start();
      this.ambientOsc60 = osc60;

      const osc120 = this.ctx.createOscillator();
      const osc120Gain = this.ctx.createGain();
      osc120.type = 'triangle';
      osc120.frequency.setValueAtTime(120, this.ctx.currentTime);
      osc120Gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      osc120.connect(osc120Gain);
      osc120Gain.connect(masterAmbGain);
      osc120.start();
      this.ambientOsc120 = osc120;

      this.ambientRunning = true;
    } catch {
      // Ignore
    }
  }

  // Previews / Audition test triggers
  public testAlarm() {
    this.playAlert();
  }

  public testUi() {
    this.playSuccess();
  }

  public testAmbientSample() {
    this.updateAmbient();
  }
}

export const sound = new SoundFX();
