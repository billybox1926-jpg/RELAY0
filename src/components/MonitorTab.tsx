import React from 'react';
import { GameState } from '../types';
import { calculateIncomeRate, powerEquilibrium, heatEquilibrium, throughputEquilibrium } from '../game/engine';
import { Zap, Flame, Radio, Shield, Coins, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';

interface MonitorTabProps {
  state: GameState;
  onManualIncomeTick: () => void;
  onManualEventTick: () => void;
  nextIncomeIn: number;
  nextEventIn: number;
}

export const MonitorTab: React.FC<MonitorTabProps> = ({
  state,
  onManualIncomeTick,
  onManualEventTick,
  nextIncomeIn,
  nextEventIn,
}) => {
  const { power, heat, throughput, networkHealth, credits, upgradeLevel, nodesUnlocked, upgradeCounts } = state;

  const incomeRate = calculateIncomeRate(state);
  const upgradeMult = 1.0 + upgradeLevel * 0.25;

  const counts = upgradeCounts || {};
  const reactorLvl = counts['reactor'] || 0;
  const batteryLvl = counts['battery'] || 0;
  const coolingLvl = counts['cooling'] || 0;
  const bandwidthLvl = counts['bandwidth'] || 0;

  const pTarget = powerEquilibrium(reactorLvl, batteryLvl, nodesUnlocked);
  const hTarget = heatEquilibrium(coolingLvl);
  const tTarget = throughputEquilibrium(bandwidthLvl);

  // Power Bar Color
  let powerFillColor = 'bg-[#00cc33] shadow-[0_0_8px_#00cc33]';
  let powerTextColor = 'text-[#00ff41]';
  if (power < 15) {
    powerFillColor = 'bg-[#ff2222] shadow-[0_0_8px_#ff2222]';
    powerTextColor = 'text-[#ff3333]';
  } else if (power < 40) {
    powerFillColor = 'bg-[#ffaa22] shadow-[0_0_8px_#ffaa22]';
    powerTextColor = 'text-[#ffaa22]';
  }

  // Heat Bar Color
  let heatFillColor = 'bg-[#ff6644] shadow-[0_0_8px_#ff6644]';
  let heatTextColor = 'text-[#ff8855]';
  if (heat > 80) {
    heatFillColor = 'bg-[#ff2222] shadow-[0_0_10px_#ff2222]';
    heatTextColor = 'text-[#ff3333]';
  } else if (heat > 55) {
    heatFillColor = 'bg-[#ff8844] shadow-[0_0_8px_#ff8844]';
    heatTextColor = 'text-[#ffaa44]';
  }

  // Throughput Bar Color
  let tpFillColor = 'bg-[#44aaff] shadow-[0_0_8px_#44aaff]';
  let tpTextColor = 'text-[#44aaff]';
  if (throughput < 20) {
    tpFillColor = 'bg-[#ff4444] shadow-[0_0_8px_#ff4444]';
    tpTextColor = 'text-[#ff4444]';
  } else if (throughput < 50) {
    tpFillColor = 'bg-[#4488ff] shadow-[0_0_8px_#4488ff]';
    tpTextColor = 'text-[#4488ff]';
  }

  // Health Bar Color
  let healthFillColor = 'bg-[#00ff88] shadow-[0_0_8px_#00ff88]';
  let healthTextColor = 'text-[#00ff88]';
  if (networkHealth < 30) {
    healthFillColor = 'bg-[#ff2222] shadow-[0_0_10px_#ff2222]';
    healthTextColor = 'text-[#ff2222]';
  } else if (networkHealth < 60) {
    healthFillColor = 'bg-[#ffaa22] shadow-[0_0_8px_#ffaa22]';
    healthTextColor = 'text-[#ffaa22]';
  }

  // Warnings compilation
  const warnings: { type: 'critical' | 'warning' | 'info'; text: string }[] = [];
  if (heat > 85) warnings.push({ type: 'critical', text: '[CRITICAL] Heat overload! Systems taking damage.' });
  else if (heat > 65) warnings.push({ type: 'warning', text: '[WARNING] Temperature elevated. Consider cooling.' });

  if (power < 10) warnings.push({ type: 'critical', text: '[CRITICAL] Power failure! Throughput degrading.' });
  else if (power < 30) warnings.push({ type: 'warning', text: '[WARNING] Power reserves low.' });

  if (networkHealth < 30) warnings.push({ type: 'critical', text: '[CRITICAL] Network health critical!' });
  else if (networkHealth < 60) warnings.push({ type: 'warning', text: '[WARNING] Network integrity compromised.' });

  if (throughput < 20) warnings.push({ type: 'info', text: '[INFO] Throughput very low. Income reduced.' });

  const hasCritical = warnings.some((w) => w.type === 'critical');
  const hasWarning = warnings.some((w) => w.type === 'warning');

  return (
    <div className="space-y-6">
      {/* Top Banner: Financials & Rates */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Credits Card */}
        <div className="terminal-box rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-[#00aa30]">
            <span className="font-bold tracking-wider">STORED CREDITS</span>
            <Coins className="h-4 w-4 text-[#ffaa22]" />
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold text-[#ffdd55] text-glow-amber">
            {credits.toLocaleString()} <span className="text-xs text-[#aa9944]">CR</span>
          </div>
          <div className="mt-1 text-[11px] text-[#88aa88]">Primary currency for nodes & tech</div>
        </div>

        {/* Income Rate Card */}
        <div className="terminal-box rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-[#00aa30]">
            <span className="font-bold tracking-wider">PROJECTED INCOME</span>
            <TrendingUp className="h-4 w-4 text-[#00ff41]" />
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold text-[#00ff41] text-glow">
            ~{incomeRate} <span className="text-xs text-[#44aa44]">CR / MIN</span>
          </div>
          <div className="mt-1 text-[11px] text-[#88aa88]">
            Next tick in <span className="text-white font-bold">{nextIncomeIn}s</span> (15s cycle)
          </div>
        </div>

        {/* Upgrade Multiplier Card */}
        <div className="terminal-box rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-[#00aa30]">
            <span className="font-bold tracking-wider">UPGRADE STATUS</span>
            <Zap className="h-4 w-4 text-[#44aaff]" />
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold text-[#44aaff] text-glow-blue">
            Lvl {upgradeLevel} <span className="text-xs text-[#3377aa]">(&times;{upgradeMult.toFixed(2)})</span>
          </div>
          <div className="mt-1 text-[11px] text-[#88aa88]">+25% income yield per level</div>
        </div>

        {/* Relay Node Count */}
        <div className="terminal-box rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-[#00aa30]">
            <span className="font-bold tracking-wider">ACTIVE NODES</span>
            <Radio className="h-4 w-4 text-[#00ff41]" />
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold text-[#88ff88]">
            {nodesUnlocked} <span className="text-sm text-[#44aa44]">/ 5 NODES</span>
          </div>
          <div className="mt-1 text-[11px] text-[#88aa88]">
            Next event roll in <span className="text-white font-bold">{nextEventIn}s</span>
          </div>
        </div>
      </div>

      {/* Main Telemetry Grid: 4 Core Resource Gauges */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column: Power & Heat */}
        <div className="space-y-4">
          {/* Power Bar */}
          <div className="terminal-box rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-[#00ff41]" />
                <span className="text-sm font-bold text-[#88ff88]">GRID POWER</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#44aa44]">Equilibrium: {pTarget}/100</span>
                <span className={`text-sm font-bold ${powerTextColor}`}>{power}/100</span>
              </div>
            </div>
            <div className="h-4 w-full overflow-hidden rounded bg-[#0a180a] border border-[#00ff4130]">
              <div
                className={`h-full transition-all duration-300 ${powerFillColor}`}
                style={{ width: `${Math.max(2, power)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-[#558855]">
              <span>Min safe: 25</span>
              <span>Homeostasis drift towards {pTarget}</span>
              <span>Cap: 100</span>
            </div>
          </div>

          {/* Heat Bar */}
          <div className="terminal-box rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-[#ff8844]" />
                <span className="text-sm font-bold text-[#ffaa77]">THERMAL LOAD (HEAT)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#aa6644]">Equilibrium: {hTarget}/100</span>
                <span className={`text-sm font-bold ${heatTextColor}`}>{heat}/100</span>
              </div>
            </div>
            <div className="h-4 w-full overflow-hidden rounded bg-[#180a0a] border border-[#ff442230]">
              <div
                className={`h-full transition-all duration-300 ${heatFillColor}`}
                style={{ width: `${Math.max(2, heat)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-[#885544]">
              <span>Passive cool target: {hTarget}</span>
              <span>Panic vent at &gt;75</span>
              <span>Damage at &gt;90</span>
            </div>
          </div>
        </div>

        {/* Right Column: Throughput & Health */}
        <div className="space-y-4">
          {/* Throughput Bar */}
          <div className="terminal-box rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-[#44aaff]" />
                <span className="text-sm font-bold text-[#88ccff]">PACKET THROUGHPUT</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#3377aa]">Equilibrium: {tTarget}/100</span>
                <span className={`text-sm font-bold ${tpTextColor}`}>{throughput}/100</span>
              </div>
            </div>
            <div className="h-4 w-full overflow-hidden rounded bg-[#0a1218] border border-[#3388ff30]">
              <div
                className={`h-full transition-all duration-300 ${tpFillColor}`}
                style={{ width: `${Math.max(2, throughput)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-[#447788]">
              <span>Starve threshold: &lt;15 Pow</span>
              <span>Drift target: {tTarget}</span>
              <span>Scales Income</span>
            </div>
          </div>

          {/* Network Health Bar */}
          <div className="terminal-box rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-[#00ff88]" />
                <span className="text-sm font-bold text-[#aaffcc]">NETWORK INTEGRITY</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${healthTextColor}`}>{networkHealth}%</span>
              </div>
            </div>
            <div className="h-4 w-full overflow-hidden rounded bg-[#0a1810] border border-[#00ff8830]">
              <div
                className={`h-full transition-all duration-300 ${healthFillColor}`}
                style={{ width: `${Math.max(2, networkHealth)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-[#448866]">
              <span>Self-repairs slowly</span>
              <span>Armor adds regen</span>
              <span>100% max</span>
            </div>
          </div>
        </div>
      </div>

      {/* Warnings & Diagnostic Panel */}
      <div
        className={`terminal-box rounded-lg p-4 transition-all ${
          hasCritical
            ? 'border-[#ff333380] bg-[#220a0a90]'
            : hasWarning
            ? 'border-[#ffaa2260] bg-[#1a120890]'
            : 'border-[#00ff4140] bg-[#09150990]'
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#00ff4120] pb-2">
          <div className="flex items-center gap-2 text-xs font-bold tracking-wider">
            {hasCritical ? (
              <AlertTriangle className="h-4 w-4 text-[#ff3333] animate-pulse" />
            ) : hasWarning ? (
              <AlertTriangle className="h-4 w-4 text-[#ffaa22]" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-[#00ff41]" />
            )}
            <span
              className={
                hasCritical ? 'text-[#ff5555]' : hasWarning ? 'text-[#ffaa44]' : 'text-[#00ff41]'
              }
            >
              SYSTEM DIAGNOSTICS // STATUS LOG
            </span>
          </div>
          <span className="text-[11px] text-[#558855]">AUTONOMOUS MONITORING</span>
        </div>

        <div className="mt-3 space-y-1.5 font-mono text-xs">
          {warnings.length === 0 ? (
            <p className="text-[#88ff88] flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#00ff41]" />
              All relay station subsystems nominal. Homeostasis active.
            </p>
          ) : (
            warnings.map((w, idx) => (
              <p
                key={idx}
                className={`flex items-center gap-2 ${
                  w.type === 'critical'
                    ? 'text-[#ff6666] font-bold'
                    : w.type === 'warning'
                    ? 'text-[#ffaa44]'
                    : 'text-[#88ccff]'
                }`}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    w.type === 'critical'
                      ? 'bg-[#ff3333]'
                      : w.type === 'warning'
                      ? 'bg-[#ffaa22]'
                      : 'bg-[#44aaff]'
                  }`}
                />
                {w.text}
              </p>
            ))
          )}
        </div>
      </div>

      {/* Manual Simulation Controls */}
      <div className="terminal-box rounded-lg p-4">
        <div className="flex items-center justify-between border-b border-[#00ff4120] pb-2">
          <span className="text-xs font-bold text-[#00ff41] tracking-wider">
            MANUAL SIMULATION OVERRIDES
          </span>
          <span className="text-[11px] text-[#558855]">DEBUG & TESTING</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            id="manual-income-tick-btn"
            onClick={onManualIncomeTick}
            className="flex items-center gap-2 rounded border border-[#00ff4160] bg-[#00ff4115] px-3 py-2 text-xs font-bold text-[#00ff41] hover:bg-[#00ff4130] transition-all"
          >
            <TrendingUp className="h-4 w-4" />
            <span>TRIGGER INCOME TICK (+{calculateIncomeRate(state)} CR)</span>
          </button>

          <button
            id="manual-event-tick-btn"
            onClick={onManualEventTick}
            className="flex items-center gap-2 rounded border border-[#44aaff60] bg-[#44aaff15] px-3 py-2 text-xs font-bold text-[#44aaff] hover:bg-[#44aaff30] transition-all"
          >
            <Radio className="h-4 w-4" />
            <span>TRIGGER RANDOM EVENT ROLL</span>
          </button>
        </div>
      </div>
    </div>
  );
};
