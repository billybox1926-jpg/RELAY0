// ============================================================
// RELAY-0 - Core Game Engine
// Faithful TypeScript implementation of MainScene.brs
// ============================================================

import { GameState, OfflineResumeResult } from '../types';
import {
  TUNING,
  SAVE_SCHEMA_VERSION,
  MAX_RULES,
  MAX_NODES,
  MAX_LOGS,
  UPGRADE_CATALOG,
  ACTION_OPTIONS,
  RANDOM_EVENTS,
} from './constants';

export const DEFAULT_STATE: GameState = {
  credits: 100,
  power: 80,
  heat: 25,
  throughput: 40,
  nodesUnlocked: 1,
  upgradeLevel: 0,
  networkHealth: 100,
  upgradeCounts: {},
  rules: [],
  logEntries: [],
  creditRemainder: 0.0,
  lastSaveTime: Math.floor(Date.now() / 1000),
  saveVersion: SAVE_SCHEMA_VERSION,
};

export function clamp(val: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, val));
}

// Mirror of roundHalfUp() in MainScene.brs
export function roundHalfUp(v: number): number {
  if (v >= 0) return Math.floor(v + 0.5);
  return -Math.floor(-v + 0.5);
}

export function formatTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const d = `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear().toString().slice(-2)}`;
  const t = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${d} ${t}`;
}

export function powerEquilibrium(
  reactorLvl: number,
  batteryLvl: number,
  nodesUnlocked: number
): number {
  const v =
    TUNING.powerBase +
    reactorLvl * TUNING.powerPerReactor +
    batteryLvl * TUNING.powerPerBattery -
    nodesUnlocked * TUNING.powerPerNode;
  return clamp(v, TUNING.powerMin, 100);
}

export function heatEquilibrium(coolingLvl: number): number {
  const v = TUNING.heatBase - coolingLvl * TUNING.heatPerCooling;
  return Math.max(TUNING.heatMin, v);
}

export function throughputEquilibrium(bandwidthLvl: number): number {
  const v = TUNING.throughputBase + bandwidthLvl * TUNING.throughputPerBand;
  return Math.min(100, v);
}

export function calculateUpgradeCost(key: string, currentLevel: number): number {
  const item = UPGRADE_CATALOG.find((u) => u.key === key);
  if (!item) return 0;
  let cost = item.baseCost;
  for (let i = 1; i <= currentLevel; i++) {
    cost = roundHalfUp(cost * item.costMult);
  }
  return cost;
}

export function calculateIncomeRate(state: GameState): number {
  const throughputMult = state.throughput / 50.0;
  const upgradeMult = 1.0 + state.upgradeLevel * 0.25;
  const rawRate = 10 * throughputMult * upgradeMult;
  return Math.max(1, Math.round(rawRate));
}

// LocalStorage Persistence
const STORAGE_KEY = 'relay0_save';

export function loadGameFromStorage(): { state: GameState; offlineResult: OfflineResumeResult | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initLog = `${formatTimestamp()}: RELAY-0 terminal initialized. System online.`;
      return {
        state: { ...DEFAULT_STATE, logEntries: [initLog] },
        offlineResult: null,
      };
    }

    const parsed = JSON.parse(raw);
    const storedVer = typeof parsed.saveVersion === 'number' ? parsed.saveVersion : 1;

    const candidate: GameState = {
      credits: typeof parsed.credits === 'number' ? clamp(parsed.credits, 0, 2000000000) : DEFAULT_STATE.credits,
      power: typeof parsed.power === 'number' ? clamp(parsed.power, 0, 100) : DEFAULT_STATE.power,
      heat: typeof parsed.heat === 'number' ? clamp(parsed.heat, 0, 100) : DEFAULT_STATE.heat,
      throughput: typeof parsed.throughput === 'number' ? clamp(parsed.throughput, 0, 100) : DEFAULT_STATE.throughput,
      nodesUnlocked: typeof parsed.nodesUnlocked === 'number' ? clamp(parsed.nodesUnlocked, 1, MAX_NODES) : DEFAULT_STATE.nodesUnlocked,
      upgradeLevel: typeof parsed.upgradeLevel === 'number' ? clamp(parsed.upgradeLevel, 0, 999) : DEFAULT_STATE.upgradeLevel,
      networkHealth: typeof parsed.networkHealth === 'number' ? clamp(parsed.networkHealth, 0, 100) : DEFAULT_STATE.networkHealth,
      upgradeCounts: typeof parsed.upgradeCounts === 'object' && parsed.upgradeCounts !== null ? parsed.upgradeCounts : {},
      rules: Array.isArray(parsed.rules) ? parsed.rules.slice(0, MAX_RULES) : [],
      logEntries: Array.isArray(parsed.logEntries) ? parsed.logEntries.slice(0, MAX_LOGS) : [],
      creditRemainder: typeof parsed.creditRemainder === 'number' ? clamp(parsed.creditRemainder, 0, 1) : 0.0,
      lastSaveTime: typeof parsed.lastSaveTime === 'number' ? parsed.lastSaveTime : Math.floor(Date.now() / 1000),
      saveVersion: SAVE_SCHEMA_VERSION,
    };

    // Migrations
    if (storedVer < 3) {
      if (candidate.power < 30) candidate.power = 60;
      if (candidate.heat > 70) candidate.heat = 30;
      if (candidate.throughput < 30) candidate.throughput = 45;
      if (candidate.networkHealth < 50) candidate.networkHealth = 80;
    }

    // Offline Simulation
    const now = Math.floor(Date.now() / 1000);
    const elapsedSeconds = now - candidate.lastSaveTime;
    let offlineResult: OfflineResumeResult | null = null;

    if (elapsedSeconds > 5) {
      const pBefore = candidate.power;
      const hBefore = candidate.heat;
      const tBefore = candidate.throughput;
      const hpBefore = candidate.networkHealth;

      const sim = simulateOfflineProgression(candidate, elapsedSeconds);
      offlineResult = {
        elapsedSeconds,
        deltaCredits: sim.deltaCredits,
        powerBefore: pBefore,
        powerAfter: sim.state.power,
        heatBefore: hBefore,
        heatAfter: sim.state.heat,
        throughputBefore: tBefore,
        throughputAfter: sim.state.throughput,
        healthBefore: hpBefore,
        healthAfter: sim.state.networkHealth,
      };

      return { state: sim.state, offlineResult };
    }

    candidate.lastSaveTime = now;
    return { state: candidate, offlineResult: null };
  } catch (err) {
    console.error('[relay0] Failed to load save, resetting:', err);
    return { state: { ...DEFAULT_STATE }, offlineResult: null };
  }
}

export function saveGameToStorage(state: GameState): void {
  try {
    const toSave: GameState = {
      ...state,
      lastSaveTime: Math.floor(Date.now() / 1000),
      saveVersion: SAVE_SCHEMA_VERSION,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (err) {
    console.error('[relay0] Failed to save state to localStorage:', err);
  }
}

export function simulateOfflineProgression(
  state: GameState,
  elapsedSecs: number
): { state: GameState; deltaCredits: number } {
  let elapsed = Math.max(0, elapsedSecs);
  const maxElapsed = 7 * 24 * 3600; // 7 days cap
  if (elapsed > maxElapsed) elapsed = maxElapsed;

  const now = Math.floor(Date.now() / 1000);
  const updated = { ...state, lastSaveTime: now };

  if (elapsed < 1) {
    return { state: updated, deltaCredits: 0 };
  }

  const counts = updated.upgradeCounts || {};
  const reactorLvl = counts['reactor'] || 0;
  const batteryLvl = counts['battery'] || 0;
  const coolingLvl = counts['cooling'] || 0;
  const bandwidthLvl = counts['bandwidth'] || 0;

  const throughputMult = updated.throughput / 50.0;
  const upgradeMult = 1.0 + updated.upgradeLevel * 0.25;
  let creditRate = TUNING.offlineRate * throughputMult * upgradeMult;
  if (creditRate < TUNING.offlineFloor) creditRate = TUNING.offlineFloor;

  const minutesAwayNum = elapsed / 60.0;
  const carried = updated.creditRemainder || 0.0;
  const earnedExact = creditRate * minutesAwayNum + carried;
  const deltaCredits = Math.floor(earnedExact);
  updated.creditRemainder = earnedExact - deltaCredits;
  updated.credits = Math.max(0, updated.credits + deltaCredits);

  // Equilibrium blends
  const powerTarget = powerEquilibrium(reactorLvl, batteryLvl, updated.nodesUnlocked);
  const heatTarget = heatEquilibrium(coolingLvl);
  const throughputTarget = throughputEquilibrium(bandwidthLvl);

  let blend = minutesAwayNum / TUNING.settleMinutes;
  if (blend > 1.0) blend = 1.0;

  updated.power = clamp(roundHalfUp(updated.power + (powerTarget - updated.power) * blend), 0, 100);
  updated.heat = clamp(roundHalfUp(updated.heat + (heatTarget - updated.heat) * blend), 0, 100);
  updated.throughput = clamp(roundHalfUp(updated.throughput + (throughputTarget - updated.throughput) * blend), 0, 100);

  const healthGain = Math.floor(minutesAwayNum / 2.0);
  updated.networkHealth = clamp(updated.networkHealth + healthGain, 0, 100);

  if (elapsed > 30) {
    const minsFormatted = minutesAwayNum.toFixed(2);
    const logMsg = `${formatTimestamp()}: Resuming after ${minsFormatted} min offline. Earned ${deltaCredits} credits.`;
    updated.logEntries = [logMsg, ...updated.logEntries].slice(0, MAX_LOGS);
  }

  return { state: updated, deltaCredits };
}

// Income Tick (15s)
export function runIncomeTick(state: GameState): { state: GameState; earned: number } {
  const updated = { ...state };
  const counts = updated.upgradeCounts || {};
  const coolingLvl = counts['cooling'] || 0;
  const reactorLvl = counts['reactor'] || 0;
  const batteryLvl = counts['battery'] || 0;
  const bandwidthLvl = counts['bandwidth'] || 0;
  const armorLvl = counts['armor'] || 0;

  // Income
  const throughputMult = updated.throughput / 50.0;
  const upgradeMult = 1.0 + updated.upgradeLevel * 0.25;
  let earned = roundHalfUp(TUNING.incomeBase * throughputMult * upgradeMult);
  if (earned < TUNING.incomeFloor) earned = TUNING.incomeFloor;

  // Power
  const pTarget = powerEquilibrium(reactorLvl, batteryLvl, updated.nodesUnlocked);
  let dP = -1;
  if (updated.power < pTarget) {
    dP = roundHalfUp((pTarget - updated.power) / 4.0) + 2;
  }

  // Heat
  const heatLoad = roundHalfUp(updated.throughput / 20.0) + Math.floor(updated.nodesUnlocked / 2);
  const heatDissipation = TUNING.heatDissipation + coolingLvl * TUNING.heatCoolPerLevel;
  let dH = heatLoad - heatDissipation;
  if (updated.heat > TUNING.heatPanicThreshold) {
    dH -= TUNING.heatPanicBonus;
  }

  // Throughput
  const qTarget = throughputEquilibrium(bandwidthLvl);
  let dT = 0;
  if (updated.throughput < qTarget) {
    dT = roundHalfUp((qTarget - updated.throughput) / 5.0) + 1;
  }
  if (updated.power < TUNING.throughputStarve) {
    dT -= TUNING.throughputPenalty;
  }

  // Health
  let dHp = TUNING.healthRegen + Math.floor(armorLvl / TUNING.healthPerArmor);
  if (updated.heat > TUNING.healthHeatDamage) dHp = -2;
  if (updated.power < TUNING.healthPowerDamage) dHp -= 1;
  if (updated.networkHealth >= 100 && dHp > 0) dHp = 0;

  // Apply Changes
  updated.power = clamp(updated.power + dP, 0, 100);
  updated.heat = clamp(updated.heat + dH, 0, 100);
  updated.throughput = clamp(updated.throughput + dT, 0, 100);
  updated.networkHealth = clamp(updated.networkHealth + dHp, 0, 100);
  updated.credits = Math.max(0, updated.credits + earned);

  return { state: updated, earned };
}

// Rule Processing
export function runAutomationRules(state: GameState): { state: GameState; firedCount: number } {
  let updated = { ...state };
  if (!updated.rules || updated.rules.length === 0) {
    return { state: updated, firedCount: 0 };
  }

  let fired = 0;
  const newLogs: string[] = [];

  for (const rule of updated.rules) {
    const { condition, action } = rule;
    let satisfied = false;

    if (condition === 'power < 30' && updated.power < 30) satisfied = true;
    if (condition === 'power < 10' && updated.power < 10) satisfied = true;
    if (condition === 'heat > 70' && updated.heat > 70) satisfied = true;
    if (condition === 'heat > 85' && updated.heat > 85) satisfied = true;
    if (condition === 'throughput < 20' && updated.throughput < 20) satisfied = true;
    if (condition === 'health < 30' && updated.networkHealth < 30) satisfied = true;

    if (satisfied) {
      const actDef = ACTION_OPTIONS.find((a) => a.key === action);
      if (actDef) {
        const { dP, dH, dT, dC, dHp } = actDef.deltas;
        updated.power = clamp(updated.power + dP, 0, 100);
        updated.heat = clamp(updated.heat + dH, 0, 100);
        updated.throughput = clamp(updated.throughput + dT, 0, 100);
        updated.networkHealth = clamp(updated.networkHealth + dHp, 0, 100);
        updated.credits = Math.max(0, updated.credits + dC);
        newLogs.push(`${formatTimestamp()}: Rule fired: ${condition} -> ${action}`);
        fired++;
      }
    }
  }

  if (newLogs.length > 0) {
    updated.logEntries = [...newLogs, ...updated.logEntries].slice(0, MAX_LOGS);
  }

  return { state: updated, firedCount: fired };
}

// Random Events Trigger
export function runEventTick(state: GameState): {
  state: GameState;
  eventFired: RandomEventDef | null;
  rulesFired: number;
  effectiveDeltas?: {
    deltaP: number;
    deltaH: number;
    deltaT: number;
    deltaC: number;
    deltaHp: number;
  };
} {
  let updated = { ...state };

  // Rule processing first
  const ruleResult = runAutomationRules(updated);
  updated = ruleResult.state;

  // Check event chance
  const struggling = updated.power < 25 || updated.heat > 80 || updated.networkHealth < 40;
  const chance = struggling ? TUNING.eventChanceStruggle : TUNING.eventChance;
  const roll = Math.floor(Math.random() * 100) + 1;

  if (roll > chance) {
    return { state: updated, eventFired: null, rulesFired: ruleResult.firedCount };
  }

  // Roll 1 of 12 events
  const eventId = Math.floor(Math.random() * 12) + 1;
  const eventDef = RANDOM_EVENTS.find((e) => e.id === eventId) || RANDOM_EVENTS[0];

  let { deltaP, deltaH, deltaT, deltaC, deltaHp } = eventDef;
  const armorLvl = (updated.upgradeCounts && updated.upgradeCounts['armor']) || 0;

  // Armor mitigates damage
  if (armorLvl > 0) {
    if (deltaHp < 0) deltaHp = Math.min(0, deltaHp + armorLvl);
    if (deltaT < 0) deltaT = Math.min(0, deltaT + armorLvl);
  }

  updated.power = clamp(updated.power + deltaP, 0, 100);
  updated.heat = clamp(updated.heat + deltaH, 0, 100);
  updated.throughput = clamp(updated.throughput + deltaT, 0, 100);
  updated.networkHealth = clamp(updated.networkHealth + deltaHp, 0, 100);
  updated.credits = Math.max(0, updated.credits + deltaC);

  const logEntry = `${formatTimestamp()}: ${eventDef.msg}`;
  updated.logEntries = [logEntry, ...updated.logEntries].slice(0, MAX_LOGS);

  return {
    state: updated,
    eventFired: eventDef,
    rulesFired: ruleResult.firedCount,
    effectiveDeltas: { deltaP, deltaH, deltaT, deltaC, deltaHp },
  };
}
