// ============================================================
// RELAY-0 - TypeScript Definitions
// ============================================================

export interface TuningTable {
  incomeBase: number;
  incomeFloor: number;
  offlineRate: number;
  offlineFloor: number;

  powerBase: number;
  powerPerReactor: number;
  powerPerBattery: number;
  powerPerNode: number;
  powerMin: number;

  heatBase: number;
  heatPerCooling: number;
  heatMin: number;
  heatDissipation: number;
  heatCoolPerLevel: number;
  heatPanicThreshold: number;
  heatPanicBonus: number;

  throughputBase: number;
  throughputPerBand: number;
  throughputStarve: number;
  throughputPenalty: number;

  healthRegen: number;
  healthPerArmor: number;
  healthHeatDamage: number;
  healthPowerDamage: number;

  eventChance: number;
  eventChanceStruggle: number;
  settleMinutes: number;
}

export type TabId = 0 | 1 | 2 | 3 | 4;

export interface AutomationRule {
  condition: string;
  action: string;
  target?: string;
}

export interface UpgradeItem {
  key: string;
  name: string;
  desc: string;
  baseCost: number;
  costMult: number;
  maxLevel: number;
}

export interface NodeActionDef {
  key: string;
  name: string;
  cost: number;
  desc: string;
  primaryOnly?: boolean;
  unlockedOnly?: boolean;
}

export interface GameState {
  credits: number;
  power: number;
  heat: number;
  throughput: number;
  nodesUnlocked: number;
  upgradeLevel: number;
  networkHealth: number;
  upgradeCounts: Record<string, number>;
  rules: AutomationRule[];
  logEntries: string[];
  creditRemainder: number;
  lastSaveTime: number; // Unix timestamp in seconds
  saveVersion: number;
}

export interface OfflineResumeResult {
  elapsedSeconds: number;
  deltaCredits: number;
  powerBefore: number;
  powerAfter: number;
  heatBefore: number;
  heatAfter: number;
  throughputBefore: number;
  throughputAfter: number;
  healthBefore: number;
  healthAfter: number;
}

export interface RandomEventDef {
  id: number;
  name: string;
  msg: string;
  deltaP: number;
  deltaH: number;
  deltaT: number;
  deltaC: number;
  deltaHp: number;
}

export type ToastType = 'critical' | 'warning' | 'success' | 'info';

export interface ToastNotification {
  id: string;
  title: string;
  message: string;
  type: ToastType;
  timestamp: string;
  duration?: number;
  deltas?: {
    deltaP?: number;
    deltaH?: number;
    deltaT?: number;
    deltaC?: number;
    deltaHp?: number;
  };
  actionTab?: TabId;
  actionLabel?: string;
}
