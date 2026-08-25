// ============================================================
// RELAY-0 - Daily Signal Transmission Challenge System
// Intercepts randomized 24-hour frequency objectives and awards
// temporary credit multipliers + instant research grants upon completion.
// ============================================================

import { DailySignalChallenge, DailyGoalType, GameState } from '../types';
import { formatTimestamp } from './engine';

export interface ChallengeTemplate {
  goalType: DailyGoalType;
  title: string;
  descTemplate: (target: number) => string;
  flavor: string;
  unit: string;
  minTarget: number;
  maxTarget: number;
  stepTarget: number;
  rewardMultiplier: number;
  rewardDurationSeconds: number; // 2 hours = 7200, 3 hours = 10800, 4 hours = 14400
  creditBonus: number;
}

export const CALLSIGNS = [
  'ECHO-7',
  'CYGNUS-9',
  'PULSAR-X',
  'SOLARIS-4',
  'ORION-DEEP',
  'AQUILA-3',
  'VANGUARD-12',
  'HYPERION-6',
  'NEXUS-8',
  'ZENITH-1',
  'KESTREL-5',
  'NEBULA-0',
];

export const FREQUENCIES = [
  '142.850 MHz [VHF EMBED]',
  '433.920 MHz [UHF BEACON]',
  '1.420 GHz [HYDROGEN LINE]',
  '2.412 GHz [MICRO-CARRIER]',
  '8.450 GHz [DEEP X-BAND]',
  '14.225 GHz [KU-BAND UPLINK]',
  '24.150 GHz [KA-DOPPLER]',
  '77.500 GHz [MILLIMETER WAVE]',
  '118.750 MHz [SUB-ORBITAL]',
  '915.000 MHz [ISM CARRIER]',
];

export const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    goalType: 'sustain_throughput',
    title: 'HIGH-THROUGHPUT BURST',
    descTemplate: (t) => `Push packet throughput to ≥${t}% and sustain through 4 income cycles`,
    flavor: 'Deep-space payload transmission detected. Lock carrier wave to stream high-bandwidth telemetry packets.',
    unit: 'cycles',
    minTarget: 4,
    maxTarget: 4,
    stepTarget: 1,
    rewardMultiplier: 2.0,
    rewardDurationSeconds: 7200, // 2 hours
    creditBonus: 350,
  },
  {
    goalType: 'thermal_stability',
    title: 'CRYO-CONTAINMENT RUN',
    descTemplate: (t) => `Maintain core heat at or below ${t}°C for 5 consecutive income cycles`,
    flavor: 'Sub-zero cryo-cooling protocol initialized. Dampen core thermal spikes during active routing.',
    unit: 'cycles',
    minTarget: 35,
    maxTarget: 35,
    stepTarget: 5,
    rewardMultiplier: 2.0,
    rewardDurationSeconds: 7200,
    creditBonus: 300,
  },
  {
    goalType: 'power_grid',
    title: 'GRID STABILIZATION MATRIX',
    descTemplate: (t) => `Maintain power grid above ${t}% with at least 2 active relay nodes`,
    flavor: 'Capacitor harmonics required for multi-node crosslink. Synchronize main power bus.',
    unit: 'cycles',
    minTarget: 80,
    maxTarget: 80,
    stepTarget: 5,
    rewardMultiplier: 1.75,
    rewardDurationSeconds: 7200,
    creditBonus: 280,
  },
  {
    goalType: 'credit_surge',
    title: 'CIPHER REVENUE HARVEST',
    descTemplate: (t) => `Generate and accumulate ${t} credits during this transmission window`,
    flavor: 'Sub-space commercial carrier auction open. Route telemetry data packets to claim fiscal quota.',
    unit: 'CR',
    minTarget: 300,
    maxTarget: 600,
    stepTarget: 50,
    rewardMultiplier: 2.5,
    rewardDurationSeconds: 7200,
    creditBonus: 400,
  },
  {
    goalType: 'automation_deploy',
    title: 'AUTONOMOUS SUBROUTINE UPLINK',
    descTemplate: (t) => `Deploy and activate at least ${t} autonomous IF/THEN rules`,
    flavor: 'Unattended relay protocols mandated. Program automated triage rules to manage station telemetry.',
    unit: 'rules',
    minTarget: 3,
    maxTarget: 4,
    stepTarget: 1,
    rewardMultiplier: 2.0,
    rewardDurationSeconds: 7200,
    creditBonus: 320,
  },
  {
    goalType: 'network_fortification',
    title: 'STRUCTURAL HARDENING PROTOCOL',
    descTemplate: () => `Achieve 100% Network Integrity while keeping system throughput above 50%`,
    flavor: 'Debris field and orbital electromagnetic interference ahead. Reinforce chassis integrity.',
    unit: 'ticks',
    minTarget: 3,
    maxTarget: 3,
    stepTarget: 1,
    rewardMultiplier: 2.0,
    rewardDurationSeconds: 7200,
    creditBonus: 350,
  },
  {
    goalType: 'overclock_matrix',
    title: 'HARMONIC FREQUENCY OVERCLOCK',
    descTemplate: (t) => `Execute ${t} successful Node Overclock routines`,
    flavor: 'Pulsed clock synchronization signal intercepted. Overdrive transceiver ALU arrays.',
    unit: 'overclocks',
    minTarget: 2,
    maxTarget: 3,
    stepTarget: 1,
    rewardMultiplier: 2.25,
    rewardDurationSeconds: 7200,
    creditBonus: 380,
  },
  {
    goalType: 'hardware_upgrade',
    title: 'SUBSYSTEM AVIONICS RETROFIT',
    descTemplate: (t) => `Install ${t} hardware upgrade or node expansion`,
    flavor: 'Tech procurement manifest approved. Modernize relay hardware modules to decode deep telemetry.',
    unit: 'installs',
    minTarget: 1,
    maxTarget: 2,
    stepTarget: 1,
    rewardMultiplier: 2.0,
    rewardDurationSeconds: 7200,
    creditBonus: 350,
  },
];

// Helper to generate a deterministic daily seed or random challenge
export function generateDailySignal(nowMs: number = Date.now(), seedOffset: number = 0): DailySignalChallenge {
  const dayIndex = Math.floor(nowMs / (24 * 60 * 60 * 1000)) + seedOffset;
  // Pseudo-random index based on dayIndex
  const pseudoRand = Math.abs(Math.sin(dayIndex * 9301 + 49297) * 233280);
  const templateIdx = Math.floor(pseudoRand) % CHALLENGE_TEMPLATES.length;
  const template = CHALLENGE_TEMPLATES[templateIdx];

  const callsignIdx = Math.floor(Math.abs(Math.sin(dayIndex * 1429 + 17) * 1000)) % CALLSIGNS.length;
  const freqIdx = Math.floor(Math.abs(Math.cos(dayIndex * 3821 + 59) * 1000)) % FREQUENCIES.length;

  let targetValue = template.minTarget;
  if (template.maxTarget > template.minTarget) {
    const rangeSteps = Math.floor((template.maxTarget - template.minTarget) / template.stepTarget);
    const stepChoice = Math.floor(Math.abs(Math.sin(dayIndex * 77 + 13)) * (rangeSteps + 1));
    targetValue = template.minTarget + stepChoice * template.stepTarget;
  }

  // Calculate 24-hour cycle boundary (expires 24 hours from start or at end of current 24-hour UTC day)
  const expiresAt = nowMs + 24 * 60 * 60 * 1000;
  const dateStr = new Date(nowMs).toISOString().slice(0, 10).replace(/-/g, '');

  return {
    id: `SIG-${dateStr}-${CALLSIGNS[callsignIdx].replace(/[^A-Z0-9]/g, '')}`,
    frequency: FREQUENCIES[freqIdx],
    callsign: CALLSIGNS[callsignIdx],
    title: template.title,
    description: template.descTemplate(targetValue),
    goalType: template.goalType,
    targetValue,
    currentValue: 0,
    unit: template.unit,
    completed: false,
    createdAt: nowMs,
    expiresAt,
    rewardMultiplier: template.rewardMultiplier,
    rewardDurationSeconds: template.rewardDurationSeconds,
    creditBonus: template.creditBonus,
    flavorText: template.flavor,
    consecutiveTicksAtTarget: 0,
  };
}

export function isSignalMultiplierActive(signal?: DailySignalChallenge, nowMs: number = Date.now()): boolean {
  if (!signal || !signal.rewardExpiresAt) return false;
  return nowMs < signal.rewardExpiresAt;
}

export function getSignalMultiplier(signal?: DailySignalChallenge, nowMs: number = Date.now()): number {
  if (!signal || !signal.rewardExpiresAt) return 1.0;
  if (nowMs < signal.rewardExpiresAt) {
    return signal.rewardMultiplier || 2.0;
  }
  return 1.0;
}

export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${pad(remHours)}h ${pad(minutes)}m`;
  }
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Checks and updates the daily signal state on ticks and user actions.
 * Returns the updated GameState and whether the challenge was newly completed in this invocation.
 */
export function evaluateDailySignalProgress(
  state: GameState,
  trigger: {
    type: 'income_tick' | 'node_action' | 'purchase_upgrade' | 'rule_change' | 'check';
    actionKey?: string;
    creditsEarned?: number;
  },
  nowMs: number = Date.now()
): { state: GameState; completedNow: boolean } {
  let updated = { ...state };
  let signal = updated.dailySignal;

  // Initialize if missing or regenerate if expired
  if (!signal || nowMs >= signal.expiresAt) {
    const previousMultiplierExpiry = signal?.rewardExpiresAt;
    const newSignal = generateDailySignal(nowMs, signal ? Math.floor(Math.random() * 1000) : 0);

    // If previous reward was active and hasn't expired yet, preserve the boost!
    if (previousMultiplierExpiry && nowMs < previousMultiplierExpiry) {
      newSignal.rewardExpiresAt = previousMultiplierExpiry;
    }

    signal = newSignal;
    updated.dailySignal = signal;
  }

  // If already completed, nothing more to track for progress
  if (signal.completed) {
    return { state: updated, completedNow: false };
  }

  let newCurrent = signal.currentValue || 0;
  let newConsecutive = signal.consecutiveTicksAtTarget || 0;

  switch (signal.goalType) {
    case 'sustain_throughput': {
      if (trigger.type === 'income_tick') {
        if (updated.throughput >= 75) {
          newConsecutive += 1;
        } else {
          newConsecutive = Math.max(0, newConsecutive - 1);
        }
        newCurrent = newConsecutive;
      }
      break;
    }

    case 'thermal_stability': {
      if (trigger.type === 'income_tick') {
        if (updated.heat <= 35) {
          newConsecutive += 1;
        } else {
          newConsecutive = 0; // reset on overheating
        }
        newCurrent = newConsecutive;
      }
      break;
    }

    case 'power_grid': {
      if (trigger.type === 'income_tick') {
        if (updated.power >= 80 && updated.nodesUnlocked >= 2) {
          newConsecutive += 1;
        } else if (updated.power >= 80) {
          newConsecutive += 1;
        } else {
          newConsecutive = Math.max(0, newConsecutive - 1);
        }
        newCurrent = newConsecutive;
      }
      break;
    }

    case 'credit_surge': {
      if (trigger.type === 'income_tick' && trigger.creditsEarned) {
        newCurrent += trigger.creditsEarned;
      }
      break;
    }

    case 'automation_deploy': {
      newCurrent = updated.rules.length;
      break;
    }

    case 'network_fortification': {
      if (trigger.type === 'income_tick') {
        if (updated.networkHealth >= 100 && updated.throughput >= 40) {
          newConsecutive += 1;
        } else {
          newConsecutive = 0;
        }
        newCurrent = newConsecutive;
      }
      break;
    }

    case 'overclock_matrix': {
      if (trigger.type === 'node_action' && trigger.actionKey === 'overclock') {
        newCurrent += 1;
      }
      break;
    }

    case 'hardware_upgrade': {
      if (
        trigger.type === 'purchase_upgrade' ||
        (trigger.type === 'node_action' && (trigger.actionKey === 'expand' || trigger.actionKey === 'upgrade'))
      ) {
        newCurrent += 1;
      }
      break;
    }
  }

  // Check if target met
  const isTargetMet = newCurrent >= signal.targetValue;
  let completedNow = false;

  if (isTargetMet && !signal.completed) {
    completedNow = true;
    const rewardExpiresAt = nowMs + signal.rewardDurationSeconds * 1000;
    const bonus = signal.creditBonus;

    signal = {
      ...signal,
      currentValue: Math.min(newCurrent, signal.targetValue),
      consecutiveTicksAtTarget: newConsecutive,
      completed: true,
      completedAt: nowMs,
      rewardExpiresAt,
    };

    // Credit bonus
    updated.credits += bonus;

    const logEntry = `${formatTimestamp()}: [DAILY SIGNAL COMPLETED] Decoded ${signal.callsign} (${signal.frequency}). Awarded +${bonus} CR & ${signal.rewardMultiplier}x Credit Multiplier for ${(signal.rewardDurationSeconds / 3600).toFixed(0)} hours!`;
    updated.logEntries = [logEntry, ...updated.logEntries].slice(0, 100);
  } else {
    signal = {
      ...signal,
      currentValue: Math.min(newCurrent, signal.targetValue),
      consecutiveTicksAtTarget: newConsecutive,
    };
  }

  updated.dailySignal = signal;
  return { state: updated, completedNow };
}
