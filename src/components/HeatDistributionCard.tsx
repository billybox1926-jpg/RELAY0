import React, { useState, useMemo } from 'react';
import { GameState } from '../types';
import { MAX_NODES, TUNING } from '../game/constants';
import { sound } from '../game/audio';
import {
  Flame,
  Thermometer,
  Zap,
  Radio,
  Wind,
  Layers,
  Grid,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Info,
  SlidersHorizontal,
  Shield,
} from 'lucide-react';

interface HeatDistributionCardProps {
  state: GameState;
}

type HeatmapViewMode = 'cluster' | 'matrix' | 'spectrum';

interface NodeThermalProfile {
  id: number;
  name: string;
  role: string;
  unlocked: boolean;
  baseTemp: number; // °C
  effectiveTemp: number; // °C
  loadFactor: number;
  subsectors: {
    name: string;
    code: string;
    temp: number;
    status: 'cool' | 'nominal' | 'warm' | 'hot' | 'critical';
  }[];
}

interface SensorCell {
  x: number;
  y: number;
  code: string;
  name: string;
  type: 'core' | 'transceiver' | 'memory' | 'bus' | 'heatsink' | 'radiator';
  nodeRef?: number;
  temp: number;
}

// Thermal color mapper helper
function getHeatColor(tempC: number) {
  if (tempC < 35) {
    return {
      bg: 'bg-emerald-950/70',
      border: 'border-emerald-500/40',
      text: 'text-emerald-400',
      badge: 'bg-emerald-900/60 text-emerald-300 border-emerald-600',
      hex: '#10b981',
      glow: 'shadow-[0_0_8px_#10b98120]',
      status: 'COOL / NOMINAL',
    };
  } else if (tempC < 55) {
    return {
      bg: 'bg-lime-950/70',
      border: 'border-lime-500/40',
      text: 'text-lime-400',
      badge: 'bg-lime-900/60 text-lime-300 border-lime-600',
      hex: '#84cc16',
      glow: 'shadow-[0_0_8px_#84cc1625]',
      status: 'OPTIMAL LOAD',
    };
  } else if (tempC < 75) {
    return {
      bg: 'bg-amber-950/70',
      border: 'border-amber-500/50',
      text: 'text-amber-400',
      badge: 'bg-amber-900/60 text-amber-300 border-amber-600',
      hex: '#f59e0b',
      glow: 'shadow-[0_0_10px_#f59e0b30]',
      status: 'ELEVATED THERMAL',
    };
  } else if (tempC < 90) {
    return {
      bg: 'bg-orange-950/80',
      border: 'border-orange-500/60',
      text: 'text-orange-400',
      badge: 'bg-orange-900/70 text-orange-200 border-orange-500 animate-pulse',
      hex: '#f97316',
      glow: 'shadow-[0_0_12px_#f9731640]',
      status: 'PANIC VENT ZONE',
    };
  } else {
    return {
      bg: 'bg-red-950/90',
      border: 'border-red-500',
      text: 'text-red-300',
      badge: 'bg-red-900 text-red-100 border-red-400 animate-pulse',
      hex: '#ef4444',
      glow: 'shadow-[0_0_16px_#ef444460]',
      status: 'CRITICAL OVERHEAT',
    };
  }
}

export const HeatDistributionCard: React.FC<HeatDistributionCardProps> = ({ state }) => {
  const [viewMode, setViewMode] = useState<HeatmapViewMode>('cluster');
  const [selectedSector, setSelectedSector] = useState<{
    title: string;
    subtitle: string;
    temp: number;
    nodeId?: number;
    type: string;
    details: string;
  } | null>(null);

  const { heat, nodesUnlocked, throughput, power, upgradeCounts } = state;
  const coolingLvl = upgradeCounts.cooling || 0;
  const isPanicVent = heat >= TUNING.heatPanicThreshold;
  const isDamageZone = heat >= TUNING.healthHeatDamage;

  // Base ambient mapping: 0 heat = 22°C ambient, 100 heat = 105°C
  const ambientBaselineC = 22 + heat * 0.83;

  // Generate node-specific temperature profiles
  const nodeProfiles: NodeThermalProfile[] = useMemo(() => {
    const nodeNames = [
      { name: 'HUB-00 [CORE]', role: 'Central Routing & Automation Processor', load: 1.15 },
      { name: 'RELAY-01 [TX/RX]', role: 'High-Gain Transceiver Array', load: 1.05 },
      { name: 'SWITCH-02 [EDGE]', role: 'Packet Buffer & Switch Matrix', load: 0.95 },
      { name: 'CRYPTO-03 [ACC]', role: 'Cryptographic Co-Processor', load: 1.1 },
      { name: 'UPLINK-04 [DEEP]', role: 'Deep-Space RF Waveguide Amplifier', load: 1.2 },
    ];

    const coolingBonus = coolingLvl * 2.5;

    return Array.from({ length: MAX_NODES }).map((_, i) => {
      const unlocked = i < nodesUnlocked;
      const def = nodeNames[i];

      if (!unlocked) {
        // Locked nodes stay cool at ambient room temperature
        const idleTemp = 20 + i * 0.8;
        return {
          id: i,
          name: def.name,
          role: def.role,
          unlocked: false,
          baseTemp: idleTemp,
          effectiveTemp: idleTemp,
          loadFactor: 0,
          subsectors: [
            { name: 'Logic Core', code: `N${i}-LOG`, temp: idleTemp, status: 'cool' },
            { name: 'Bus Interface', code: `N${i}-BUS`, temp: idleTemp, status: 'cool' },
            { name: 'Thermal Sink', code: `N${i}-SNK`, temp: idleTemp - 2, status: 'cool' },
          ],
        };
      }

      // Unlocked node temperatures scale with system heat, throughput, and node load
      const throughputThermalAdd = (throughput / 100) * 8 * def.load;
      const nodeSpecificShift = (i === 0 ? 4 : i === 4 ? 6 : (i % 2) * 2) - coolingBonus;
      const nodeTemp = Math.max(22, ambientBaselineC * def.load * 0.9 + nodeSpecificShift + throughputThermalAdd * 0.4);

      const s1Temp = nodeTemp + (i === 0 ? 3.5 : 2.0); // Logic/ALU core runs hottest
      const s2Temp = nodeTemp + (throughput > 60 ? 2.5 : 0.5); // Bus/Transceiver
      const s3Temp = Math.max(18, nodeTemp - (6 + coolingLvl * 3)); // Cryo Heat Sink is coolest

      const getStatus = (t: number) => {
        if (t < 35) return 'cool';
        if (t < 55) return 'nominal';
        if (t < 75) return 'warm';
        if (t < 90) return 'hot';
        return 'critical';
      };

      return {
        id: i,
        name: def.name,
        role: def.role,
        unlocked: true,
        baseTemp: ambientBaselineC,
        effectiveTemp: Math.round(nodeTemp * 10) / 10,
        loadFactor: def.load,
        subsectors: [
          { name: 'Primary Core ALU', code: `N${i}-ALU`, temp: Math.round(s1Temp * 10) / 10, status: getStatus(s1Temp) },
          { name: 'Bus Transceiver', code: `N${i}-TRX`, temp: Math.round(s2Temp * 10) / 10, status: getStatus(s2Temp) },
          { name: 'Cryo Manifold Fin', code: `N${i}-CRYO`, temp: Math.round(s3Temp * 10) / 10, status: getStatus(s3Temp) },
        ],
      };
    });
  }, [ambientBaselineC, nodesUnlocked, throughput, coolingLvl]);

  // 6x4 Sensor Matrix for detailed spatial heatmap
  const sensorMatrix: SensorCell[][] = useMemo(() => {
    const matrix: SensorCell[][] = [];
    const rows = 4;
    const cols = 6;

    for (let r = 0; r < rows; r++) {
      const row: SensorCell[] = [];
      for (let c = 0; c < cols; c++) {
        const code = `S${r + 1}${String.fromCharCode(65 + c)}`;
        let type: SensorCell['type'] = 'bus';
        let nodeRef: number | undefined = undefined;
        let tempOffset = 0;
        let name = `Thermal Sensor ${code}`;

        // Map layout zones
        if (r === 1 && c === 1) {
          type = 'core';
          nodeRef = 0;
          name = 'Node 0 Main CPU Die';
          tempOffset = 4.5;
        } else if (r === 1 && c === 3) {
          type = 'core';
          nodeRef = 1;
          name = 'Node 1 Transceiver Die';
          tempOffset = 3.0;
        } else if (r === 1 && c === 4) {
          type = 'core';
          nodeRef = 3;
          name = 'Node 3 Crypto Die';
          tempOffset = 3.8;
        } else if (r === 2 && c === 1) {
          type = 'core';
          nodeRef = 2;
          name = 'Node 2 Edge Switch Core';
          tempOffset = 2.0;
        } else if (r === 2 && c === 4) {
          type = 'core';
          nodeRef = 4;
          name = 'Node 4 Deep Uplink Amp';
          tempOffset = 5.2;
        } else if (r === 0) {
          type = 'radiator';
          name = `Chassis Radiator Fin #${c + 1}`;
          tempOffset = -12 - coolingLvl * 2;
        } else if (r === 3) {
          type = 'heatsink';
          name = `Cryo Heat Exchanger Coil #${c + 1}`;
          tempOffset = -8 - coolingLvl * 3;
        } else if (c === 0 || c === 5) {
          type = 'transceiver';
          name = `Bus Boundary Transceiver ${code}`;
          tempOffset = (throughput / 100) * 4;
        } else {
          type = 'memory';
          name = `Shared RAM & Cache Bank ${code}`;
          tempOffset = 1.0;
        }

        // Calculate cell temperature
        let cellTemp: number;
        if (nodeRef !== undefined) {
          const profile = nodeProfiles[nodeRef];
          cellTemp = profile.unlocked ? profile.effectiveTemp + tempOffset : 22;
        } else {
          // Ambient / chassis temperature modulated by distance to active nodes
          const activeNodeWeight = (nodesUnlocked / MAX_NODES);
          cellTemp = Math.max(18, ambientBaselineC * (0.8 + (r === 1 || r === 2 ? 0.2 : 0)) + tempOffset * activeNodeWeight);
        }

        row.push({
          x: c,
          y: r,
          code,
          name,
          type,
          nodeRef,
          temp: Math.round(cellTemp * 10) / 10,
        });
      }
      matrix.push(row);
    }
    return matrix;
  }, [nodeProfiles, nodesUnlocked, ambientBaselineC, coolingLvl, throughput]);

  // Overall thermal statistics
  const thermalStats = useMemo(() => {
    const activeProfiles = nodeProfiles.filter((p) => p.unlocked);
    const temps = activeProfiles.map((p) => p.effectiveTemp);
    const peakTemp = temps.length > 0 ? Math.max(...temps) : ambientBaselineC;
    const avgTemp = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : ambientBaselineC;

    const hottestNode = activeProfiles.reduce(
      (prev, curr) => (curr.effectiveTemp > prev.effectiveTemp ? curr : prev),
      activeProfiles[0] || nodeProfiles[0]
    );

    // Cryo heat dissipation rate
    const dissipationPerTick = TUNING.heatDissipation + coolingLvl * TUNING.heatCoolPerLevel;
    const panicBonus = isPanicVent ? TUNING.heatPanicBonus : 0;
    const totalDissipation = dissipationPerTick + panicBonus;

    // Thermal headroom to damage threshold (90)
    const thermalHeadroom = Math.max(0, 90 - heat);

    return {
      peakTemp: Math.round(peakTemp * 10) / 10,
      avgTemp: Math.round(avgTemp * 10) / 10,
      hottestNode,
      totalDissipation,
      thermalHeadroom,
    };
  }, [nodeProfiles, ambientBaselineC, coolingLvl, isPanicVent, heat]);

  return (
    <div id="heat-distribution-card" className="terminal-box rounded-lg p-4 sm:p-5 space-y-4 font-mono">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#00ff4120] pb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`p-2 rounded border ${
              isDamageZone
                ? 'bg-red-950/80 border-red-500 text-red-400 animate-pulse'
                : isPanicVent
                ? 'bg-amber-950/80 border-amber-500 text-amber-400'
                : 'bg-[#ff884415] border-[#ff884440] text-[#ffaa77]'
            }`}
          >
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#ffaa77] tracking-wider uppercase text-glow">
                HEAT DISTRIBUTION // THERMAL CONCENTRATION MATRIX
              </h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                  isDamageZone
                    ? 'bg-red-950 border-red-500 text-red-200 animate-pulse'
                    : isPanicVent
                    ? 'bg-amber-950 border-amber-500 text-amber-300'
                    : 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                }`}
              >
                {isDamageZone ? 'CRITICAL ABLATION' : isPanicVent ? 'PANIC VENTING' : 'STABLE HOMEOSTASIS'}
              </span>
            </div>
            <p className="text-[11px] text-[#88aa88]">
              Spatial infrared telemetry across network nodes, bus interconnects, and Cryo Manifold exchangers
            </p>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1.5 bg-[#061208] border border-[#00ff4130] p-1 rounded-lg text-xs">
          <button
            id="heatmap-view-cluster-btn"
            onClick={() => {
              sound.playKeypress();
              setViewMode('cluster');
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
              viewMode === 'cluster'
                ? 'bg-[#00ff4125] border border-[#00ff4160] text-[#00ff41] font-bold shadow-[0_0_8px_#00ff4120]'
                : 'text-[#88aa88] hover:text-[#88ff88]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>TOPOLOGY NODES</span>
          </button>

          <button
            id="heatmap-view-matrix-btn"
            onClick={() => {
              sound.playKeypress();
              setViewMode('matrix');
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
              viewMode === 'matrix'
                ? 'bg-[#00ff4125] border border-[#00ff4160] text-[#00ff41] font-bold shadow-[0_0_8px_#00ff4120]'
                : 'text-[#88aa88] hover:text-[#88ff88]'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>SENSOR MATRIX</span>
          </button>

          <button
            id="heatmap-view-spectrum-btn"
            onClick={() => {
              sound.playKeypress();
              setViewMode('spectrum');
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
              viewMode === 'spectrum'
                ? 'bg-[#00ff4125] border border-[#00ff4160] text-[#00ff41] font-bold shadow-[0_0_8px_#00ff4120]'
                : 'text-[#88aa88] hover:text-[#88ff88]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>THERMAL SPECTRUM</span>
          </button>
        </div>
      </div>

      {/* Real-Time Key Thermal Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="bg-[#09150980] border border-[#00ff4120] rounded p-2.5 flex flex-col justify-between">
          <span className="text-[#88aa88] flex items-center gap-1 text-[11px]">
            <Thermometer className="w-3 h-3 text-[#ffaa77]" />
            SYSTEM HEAT LOAD
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span
              className={`text-lg font-bold ${
                isDamageZone ? 'text-red-400' : isPanicVent ? 'text-amber-400' : 'text-[#88ff88]'
              }`}
            >
              {heat} / 100
            </span>
            <span className="text-[10px] text-[#558855]">Equil: {TUNING.heatBase - coolingLvl * TUNING.heatPerCooling}</span>
          </div>
        </div>

        <div className="bg-[#09150980] border border-[#00ff4120] rounded p-2.5 flex flex-col justify-between">
          <span className="text-[#88aa88] flex items-center gap-1 text-[11px]">
            <Flame className="w-3 h-3 text-red-400" />
            PEAK HOTSPOT TEMP
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg font-bold text-red-300">{thermalStats.peakTemp}°C</span>
            <span className="text-[10px] text-[#aa7777]">{thermalStats.hottestNode?.name.split(' ')[0] || 'HUB-00'}</span>
          </div>
        </div>

        <div className="bg-[#09150980] border border-[#00ff4120] rounded p-2.5 flex flex-col justify-between">
          <span className="text-[#88aa88] flex items-center gap-1 text-[11px]">
            <Wind className="w-3 h-3 text-[#00e5ff]" />
            CRYO DISSIPATION
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg font-bold text-[#88ddff]">-{thermalStats.totalDissipation} H/tick</span>
            <span className="text-[10px] text-[#558888]">Lvl {coolingLvl} Cryo</span>
          </div>
        </div>

        <div className="bg-[#09150980] border border-[#00ff4120] rounded p-2.5 flex flex-col justify-between">
          <span className="text-[#88aa88] flex items-center gap-1 text-[11px]">
            <Shield className="w-3 h-3 text-[#00ff88]" />
            THERMAL MARGIN
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span
              className={`text-lg font-bold ${
                thermalStats.thermalHeadroom <= 10
                  ? 'text-red-400'
                  : thermalStats.thermalHeadroom <= 25
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {thermalStats.thermalHeadroom} H
            </span>
            <span className="text-[10px] text-[#558866]">to 90 damage</span>
          </div>
        </div>
      </div>

      {/* Thermal Warning Banner if Panic or Critical */}
      {isDamageZone ? (
        <div className="rounded border border-red-500 bg-red-950/80 p-3 flex items-center gap-3 text-red-200 text-xs shadow-[0_0_12px_#ff000030]">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 animate-pulse" />
          <div className="space-y-0.5">
            <div className="font-bold tracking-wider">CRITICAL THERMAL RUNAWAY // STRUCTURAL ABLATION ACTIVE</div>
            <div className="text-[11px] text-red-300">
              Station heat is at {heat}/100 (&ge;90 threshold). Relay node hardware integrity is degrading each tick. Trigger Emergency Cooling immediately!
            </div>
          </div>
        </div>
      ) : isPanicVent ? (
        <div className="rounded border border-amber-500/70 bg-amber-950/70 p-3 flex items-center gap-3 text-amber-200 text-xs">
          <Wind className="w-5 h-5 text-amber-400 shrink-0 animate-spin" />
          <div className="space-y-0.5">
            <div className="font-bold tracking-wider">AUXILIARY CRYOGENIC PANIC VENT ENGAGED (&gt;75 HEAT)</div>
            <div className="text-[11px] text-amber-300">
              Turbine fans are shedding +{TUNING.heatPanicBonus} bonus heat per tick to prevent hardware burnout.
            </div>
          </div>
        </div>
      ) : null}

      {/* Main Heatmap Visualization Panels */}
      {viewMode === 'cluster' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-[#88aa88]">
            <span>NODE THERMAL CONCENTRATION CLUSTERS</span>
            <span>Click any node sector for telemetry diagnostics</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {nodeProfiles.map((node) => {
              const color = getHeatColor(node.effectiveTemp);
              const isSelected = selectedSector?.nodeId === node.id;

              return (
                <div
                  key={node.id}
                  id={`thermal-node-card-${node.id}`}
                  onClick={() => {
                    sound.playKeypress();
                    setSelectedSector({
                      title: node.name,
                      subtitle: node.role,
                      temp: node.effectiveTemp,
                      nodeId: node.id,
                      type: node.unlocked ? 'Active Node Cluster' : 'Locked Hardware Slot',
                      details: node.unlocked
                        ? `Node ${node.id} is operating at load multiplier ${node.loadFactor}x. Core ALU: ${node.subsectors[0].temp}°C | TRX: ${node.subsectors[1].temp}°C | Sink: ${node.subsectors[2].temp}°C.`
                        : `Node ${node.id} hardware slot is unpowered and in ambient standby (~${node.baseTemp}°C). Expand network from node actions to activate.`,
                    });
                  }}
                  className={`cursor-pointer rounded-lg border p-3 font-mono transition-all flex flex-col justify-between ${
                    color.bg
                  } ${color.border} ${color.glow} ${
                    isSelected ? 'ring-2 ring-[#00ff41] scale-[1.02]' : 'hover:border-[#00ff4180]'
                  } ${!node.unlocked ? 'opacity-50' : ''}`}
                >
                  <div>
                    {/* Node Header */}
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${node.unlocked ? color.text : 'text-[#667766]'}`}>
                        NODE {node.id}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${color.badge}`}>
                        {node.unlocked ? `${node.effectiveTemp}°C` : 'OFFLINE'}
                      </span>
                    </div>

                    <div className="text-[10px] text-[#88aa88] truncate mt-0.5">{node.name.split(' ')[1] || 'RELAY'}</div>

                    {/* Temperature Progress Fill */}
                    <div className="mt-2.5 space-y-1">
                      <div className="h-2 w-full bg-[#050e06] rounded overflow-hidden border border-[#00ff4120]">
                        <div
                          className="h-full transition-all duration-500 rounded"
                          style={{
                            width: `${Math.min(100, Math.max(8, (node.effectiveTemp / 110) * 100))}%`,
                            backgroundColor: color.hex,
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] text-[#668866]">
                        <span>Amb 22°</span>
                        <span>{node.unlocked ? color.status : 'STANDBY'}</span>
                        <span>105°</span>
                      </div>
                    </div>
                  </div>

                  {/* Sub-Sectors Breakdown */}
                  {node.unlocked && (
                    <div className="mt-3 pt-2 border-t border-[#00ff4115] space-y-1.5">
                      {node.subsectors.map((sub, idx) => {
                        const subCol = getHeatColor(sub.temp);
                        return (
                          <div key={idx} className="flex items-center justify-between text-[10px]">
                            <span className="text-[#88aa88]">{sub.code}</span>
                            <span className={`font-bold ${subCol.text}`}>{sub.temp}°C</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === 'matrix' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-[#88aa88]">
            <span>6x4 HIGH-DENSITY CHASSIS THERMAL SENSOR HEATMAP</span>
            <span>Hover or click any cell for infrared coordinate reading</span>
          </div>

          <div className="grid grid-cols-6 gap-2 bg-[#040c06] p-3 rounded-lg border border-[#00ff4125]">
            {sensorMatrix.flat().map((cell) => {
              const color = getHeatColor(cell.temp);
              const isSelected = selectedSector?.title.includes(cell.code);

              return (
                <button
                  key={cell.code}
                  id={`sensor-cell-${cell.code}`}
                  onClick={() => {
                    sound.playKeypress();
                    setSelectedSector({
                      title: `SENSOR [${cell.code}] // ${cell.name}`,
                      subtitle: `Chassis Grid Coordinate (${cell.x}, ${cell.y})`,
                      temp: cell.temp,
                      type: cell.type.toUpperCase(),
                      details: `Sensor sector monitoring ${cell.type} thermal impedance. Temperature calibrated at ${cell.temp}°C. Current status: ${color.status}.`,
                    });
                  }}
                  className={`p-2 rounded border text-left font-mono transition-all flex flex-col justify-between min-h-[64px] ${
                    color.bg
                  } ${color.border} ${color.glow} ${
                    isSelected ? 'ring-2 ring-white scale-105' : 'hover:scale-[1.03] hover:border-white'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[9px] font-bold text-white/80">{cell.code}</span>
                    <span className={`text-[9px] font-bold px-1 rounded ${color.text}`}>
                      {cell.type.slice(0, 3).toUpperCase()}
                    </span>
                  </div>

                  <div className="mt-1">
                    <div className={`text-xs font-bold ${color.text}`}>{cell.temp}°C</div>
                    <div className="text-[8px] text-[#88aa88] truncate">{cell.name.split(' ')[0]}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === 'spectrum' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-[#88aa88]">
            <span>SPECTRAL INFRARED THERMAL GRADIENTS</span>
            <span>Radial heat dispersion from hub processing cores to cooling sink manifolds</span>
          </div>

          <div className="bg-[#050f07] border border-[#00ff4125] rounded-lg p-4 space-y-4">
            {/* Heat Gradient Bar with Node Pinpoints */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold text-[#88aa88]">
                <span className="text-emerald-400">COOL ZONE (&lt;35°C)</span>
                <span className="text-lime-400">NOMINAL (35-55°C)</span>
                <span className="text-amber-400">ELEVATED (55-75°C)</span>
                <span className="text-orange-400">VENTING (75-90°C)</span>
                <span className="text-red-400">ABLATION (&gt;90°C)</span>
              </div>

              {/* Thermal Rainbow Spectrum Bar */}
              <div className="relative h-6 w-full rounded overflow-hidden border border-[#00ff4140] bg-gradient-to-r from-emerald-600 via-lime-500 via-amber-500 via-orange-500 to-red-600">
                {/* Node Markers */}
                {nodeProfiles
                  .filter((p) => p.unlocked)
                  .map((p) => {
                    const pct = Math.min(96, Math.max(4, ((p.effectiveTemp - 20) / 85) * 100));
                    return (
                      <div
                        key={p.id}
                        style={{ left: `${pct}%` }}
                        className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_8px_#ffffff] transform -translate-x-1/2 flex flex-col items-center justify-between cursor-pointer"
                        title={`${p.name}: ${p.effectiveTemp}°C`}
                        onClick={() => {
                          sound.playKeypress();
                          setSelectedSector({
                            title: p.name,
                            subtitle: p.role,
                            temp: p.effectiveTemp,
                            nodeId: p.id,
                            type: 'Active Node Pinpoint',
                            details: `Thermal pin mapping at ${p.effectiveTemp}°C on the infrared distribution continuum.`,
                          });
                        }}
                      >
                        <div className="text-[8px] bg-black/90 text-white px-1 rounded font-bold border border-white/50 -translate-y-5 whitespace-nowrap">
                          N{p.id} ({p.effectiveTemp}°)
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Heat Dissipation Vector Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
              <div className="border border-[#00ff4120] bg-[#09150960] rounded p-2.5 space-y-1">
                <span className="text-[#88aa88] text-[11px]">Active Core Dissipation Flux:</span>
                <div className="text-[#88ff88] font-bold">
                  {nodesUnlocked} Active Cores Generating ~{(nodesUnlocked * 1.8 + (throughput / 100) * 3).toFixed(1)} H/t
                </div>
              </div>

              <div className="border border-[#00ff4120] bg-[#09150960] rounded p-2.5 space-y-1">
                <span className="text-[#88aa88] text-[11px]">Cryo Manifold Absorption:</span>
                <div className="text-[#00e5ff] font-bold">
                  -{thermalStats.totalDissipation} H/t Passive & Fan Evaporation
                </div>
              </div>

              <div className="border border-[#00ff4120] bg-[#09150960] rounded p-2.5 space-y-1">
                <span className="text-[#88aa88] text-[11px]">Net Thermal Delta (Equilibrium):</span>
                <div
                  className={`font-bold ${
                    heat > TUNING.heatBase ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                >
                  {heat > TUNING.heatBase ? `Drifting Down to ${TUNING.heatBase - coolingLvl * TUNING.heatPerCooling}` : 'Equilibrium Stable'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Selected Sector Telemetry Inspector Drawer */}
      {selectedSector && (
        <div className="bg-[#071309] border border-[#00ff4140] rounded-lg p-3.5 space-y-2 animate-fadeIn text-xs">
          <div className="flex items-center justify-between border-b border-[#00ff4120] pb-2">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-[#00ff41]" />
              <div>
                <span className="font-bold text-[#88ff88]">{selectedSector.title}</span>
                <span className="text-[10px] text-[#669966] ml-2">[{selectedSector.type}]</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded border ${getHeatColor(selectedSector.temp).badge}`}>
                {selectedSector.temp}°C
              </span>
              <button
                onClick={() => setSelectedSector(null)}
                className="text-[11px] text-[#88aa88] hover:text-[#00ff41] px-1.5 py-0.5 rounded border border-[#00ff4130] bg-[#051105]"
              >
                CLOSE [X]
              </button>
            </div>
          </div>

          <p className="text-[11px] text-[#aaccbb] leading-relaxed">{selectedSector.details}</p>
        </div>
      )}

      {/* Thermal Legend & Help Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#00ff4115] text-[11px] text-[#668866]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" /> &lt;35°C Nominal
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-lime-400 inline-block" /> 35-55°C Optimal
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" /> 55-75°C Elevated
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-orange-400 inline-block" /> 75-90°C Panic Vent
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-400 inline-block" /> &gt;90°C Ablation
          </span>
        </div>

        <span className="text-[#557755]">Cryo Manifold cooling upgrades lower baseline dissipation</span>
      </div>
    </div>
  );
};
