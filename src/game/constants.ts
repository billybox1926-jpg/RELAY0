// ============================================================
// RELAY-0 - Game Constants & Tuning Table
// Exact match with BrightScript MainScene.brs and UpgradesTab.brs
// ============================================================

import { TuningTable, UpgradeItem, RandomEventDef } from '../types';

export const SAVE_SCHEMA_VERSION = 4;
export const MAX_RULES = 10;
export const MAX_NODES = 5;
export const MAX_LOGS = 100;

export const TUNING: TuningTable = {
  incomeBase: 6, // credits per tick at 50 throughput, no upgrades
  incomeFloor: 4, // never earn less than this per tick
  offlineRate: 12, // credits per minute while away
  offlineFloor: 6,

  powerBase: 70, // idle power equilibrium
  powerPerReactor: 5, // each Reactor Shielding level
  powerPerBattery: 4, // each Capacitor Bank level
  powerPerNode: 6, // each extra node costs this much headroom
  powerMin: 25, // equilibrium never drops below this

  heatBase: 30, // idle heat equilibrium
  heatPerCooling: 3, // each Cryo Manifold level lowers it
  heatMin: 10,
  heatDissipation: 4, // base cooling per tick
  heatCoolPerLevel: 2, // extra cooling per Cryo level
  heatPanicThreshold: 75, // above this, fans shed extra heat
  heatPanicBonus: 4,

  throughputBase: 45, // idle throughput equilibrium
  throughputPerBand: 5, // each Bandwidth Expander level
  throughputStarve: 15, // below this power, throughput suffers
  throughputPenalty: 3,

  healthRegen: 1, // per tick self-repair
  healthPerArmor: 2, // armor levels add regen (integer divide)
  healthHeatDamage: 90, // heat above this damages health
  healthPowerDamage: 5, // power below this damages health

  eventChance: 22, // percent per 30s tick
  eventChanceStruggle: 8, // reduced while in trouble
  settleMinutes: 30.0, // offline blend fully settles after this
};

export const UPGRADE_CATALOG: UpgradeItem[] = [
  {
    key: 'income',
    name: 'SIGNAL AMPLIFIER',
    desc: 'Permanently increases credit income multiplier by +0.25x per level.',
    baseCost: 200,
    costMult: 1.6,
    maxLevel: 20,
  },
  {
    key: 'cooling',
    name: 'CRYO MANIFOLD',
    desc: 'Reduces passive heat generation. Each level cuts heat gain per tick by 1.',
    baseCost: 150,
    costMult: 1.7,
    maxLevel: 5,
  },
  {
    key: 'reactor',
    name: 'REACTOR SHIELDING',
    desc: 'Reduces passive power drain. Each level cuts power loss per tick by 1.',
    baseCost: 180,
    costMult: 1.7,
    maxLevel: 5,
  },
  {
    key: 'bandwidth',
    name: 'BANDWIDTH EXPANDER',
    desc: 'Raises throughput by +8 immediately and improves recovery.',
    baseCost: 120,
    costMult: 1.5,
    maxLevel: 10,
  },
  {
    key: 'armor',
    name: 'NETWORK HARDENING',
    desc: 'Restores 25 network health and reduces future event damage.',
    baseCost: 160,
    costMult: 1.55,
    maxLevel: 10,
  },
  {
    key: 'battery',
    name: 'CAPACITOR BANK',
    desc: 'Instantly restores 40 power and raises passive power regen.',
    baseCost: 90,
    costMult: 1.45,
    maxLevel: 10,
  },
];

export const CONDITION_OPTIONS = [
  { key: 'power < 30', label: 'Power < 30' },
  { key: 'power < 10', label: 'Power < 10 (Critical)' },
  { key: 'heat > 70', label: 'Heat > 70' },
  { key: 'heat > 85', label: 'Heat > 85 (Critical)' },
  { key: 'throughput < 20', label: 'Throughput < 20' },
  { key: 'health < 30', label: 'Health < 30' },
];

export const ACTION_OPTIONS = [
  {
    key: 'boost_power',
    label: 'Boost Power (+12)',
    deltas: { dP: 12, dH: 0, dT: 0, dC: 0, dHp: 0 },
  },
  {
    key: 'reduce_heat',
    label: 'Reduce Heat (-18)',
    deltas: { dP: 0, dH: -18, dT: 0, dC: 0, dHp: 0 },
  },
  {
    key: 'earn_credits',
    label: 'Earn Credits (+30)',
    deltas: { dP: 0, dH: 0, dT: 0, dC: 30, dHp: 0 },
  },
  {
    key: 'repair_health',
    label: 'Repair Health (+15)',
    deltas: { dP: 0, dH: 0, dT: 0, dC: 0, dHp: 15 },
  },
  {
    key: 'boost_throughput',
    label: 'Boost Throughput (+15, Heat +5)',
    deltas: { dP: 0, dH: 5, dT: 15, dC: 0, dHp: 0 },
  },
  {
    key: 'emergency_cool',
    label: 'Emergency Cool (+5 Pow, -30 Heat, -15 Cr, +5 Hp)',
    deltas: { dP: 5, dH: -30, dT: -10, dC: -15, dHp: 5 },
  },
];

export const RANDOM_EVENTS: RandomEventDef[] = [
  {
    id: 1,
    name: 'INTRUSION DETECTED',
    msg: '!! INTRUSION DETECTED - Unauthorized access. Throughput -8, Credits -5.',
    deltaP: 0,
    deltaH: 0,
    deltaT: -8,
    deltaC: -5,
    deltaHp: -2,
  },
  {
    id: 2,
    name: 'THERMAL SPIKE',
    msg: '>> THERMAL SPIKE - Cooling strained. Heat +10, Power -4.',
    deltaP: -4,
    deltaH: 10,
    deltaT: 0,
    deltaC: 0,
    deltaHp: 0,
  },
  {
    id: 3,
    name: 'PACKET STORM',
    msg: '>> PACKET STORM - Data surge. Throughput +25, Heat +8.',
    deltaP: 0,
    deltaH: 8,
    deltaT: 25,
    deltaC: 0,
    deltaHp: 0,
  },
  {
    id: 4,
    name: 'EFFICIENCY BOOST',
    msg: '** EFFICIENCY BOOST - Optimized routing. Credits +40.',
    deltaP: 0,
    deltaH: 0,
    deltaT: 0,
    deltaC: 40,
    deltaHp: 0,
  },
  {
    id: 5,
    name: 'GHOST SIGNAL',
    msg: '~~ GHOST SIGNAL - Unknown node whispering. Heat -10, Credits +15.',
    deltaP: 0,
    deltaH: -10,
    deltaT: 0,
    deltaC: 15,
    deltaHp: 0,
  },
  {
    id: 6,
    name: 'POWER SURGE',
    msg: '** POWER SURGE - Grid feedback. Power +25, Heat +6.',
    deltaP: 25,
    deltaH: 6,
    deltaT: 0,
    deltaC: 0,
    deltaHp: 0,
  },
  {
    id: 7,
    name: 'DATA CORRUPTION',
    msg: '!! DATA CORRUPTION - Memory damaged. Throughput -10, Health -4.',
    deltaP: 0,
    deltaH: 0,
    deltaT: -10,
    deltaC: 0,
    deltaHp: -4,
  },
  {
    id: 8,
    name: 'FIRMWARE UPDATE',
    msg: '++ FIRMWARE UPDATE - Patch applied. Health +15, Throughput +5.',
    deltaP: 0,
    deltaH: 0,
    deltaT: 5,
    deltaC: 0,
    deltaHp: 15,
  },
  {
    id: 9,
    name: 'SOLAR FLARE',
    msg: '!! SOLAR FLARE - EM interference. Systems disrupted.',
    deltaP: -6,
    deltaH: 12,
    deltaT: -5,
    deltaC: 0,
    deltaHp: -3,
  },
  {
    id: 10,
    name: 'CONTRACT FULFILLED',
    msg: '$$ CONTRACT FULFILLED - Payment received. Credits +70.',
    deltaP: 0,
    deltaH: 0,
    deltaT: 0,
    deltaC: 70,
    deltaHp: 0,
  },
  {
    id: 11,
    name: 'COOLING CACHE',
    msg: '++ COOLING CACHE - Coolant reserves found. Heat -25.',
    deltaP: 0,
    deltaH: -25,
    deltaT: 0,
    deltaC: 0,
    deltaHp: 0,
  },
  {
    id: 12,
    name: 'SYSTEM GLITCH',
    msg: '~~ SYSTEM GLITCH - Minor anomaly. Power +8, Heat -5.',
    deltaP: 8,
    deltaH: -5,
    deltaT: 0,
    deltaC: 0,
    deltaHp: 0,
  },
];
