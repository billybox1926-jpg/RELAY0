import React, { useState, useMemo } from 'react';
import { TelemetryPoint } from '../types';
import { Activity, Zap, Radio, TrendingUp, TrendingDown, Gauge, Cpu, Layers } from 'lucide-react';

interface SystemEfficiencyCardProps {
  telemetry: TelemetryPoint[];
  currentPower: number;
  currentThroughput: number;
  currentHeat: number;
  nodeCount: number;
}

type ViewMode = 'combined' | 'throughput' | 'power' | 'efficiency';

export const SystemEfficiencyCard: React.FC<SystemEfficiencyCardProps> = ({
  telemetry,
  currentPower,
  currentThroughput,
  currentHeat,
  nodeCount,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('combined');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Compute current efficiency (throughput per unit of power)
  const currentRatio = currentThroughput / Math.max(1, currentPower);
  const throughputPerNode = (currentThroughput / Math.max(1, nodeCount)).toFixed(1);
  const powerPerNode = (currentPower / Math.max(1, nodeCount)).toFixed(1);

  // Determine Efficiency Tier & Color
  const efficiencyTier = useMemo(() => {
    if (currentPower < 15 && currentThroughput < 20) {
      return { label: 'STARVED', color: 'text-red-400', bg: 'bg-red-950/80 border-red-800' };
    }
    if (currentRatio >= 1.4) {
      return { label: 'PEAK EFFICIENCY', color: 'text-emerald-400', bg: 'bg-emerald-950/80 border-emerald-800' };
    }
    if (currentRatio >= 1.0) {
      return { label: 'OPTIMAL', color: 'text-cyan-400', bg: 'bg-cyan-950/80 border-cyan-800' };
    }
    if (currentRatio >= 0.6) {
      return { label: 'BALANCED', color: 'text-lime-400', bg: 'bg-lime-950/80 border-lime-800' };
    }
    if (currentRatio >= 0.3) {
      return { label: 'DRAIN LOAD', color: 'text-amber-400', bg: 'bg-amber-950/80 border-amber-800' };
    }
    return { label: 'CRITICAL LOW', color: 'text-red-400', bg: 'bg-red-950/80 border-red-800' };
  }, [currentRatio, currentPower, currentThroughput]);

  // Compute Rolling Trend (vs earlier history)
  const trendPercent = useMemo(() => {
    if (telemetry.length < 4) return 0;
    const recent = telemetry.slice(-4);
    const older = telemetry.slice(0, Math.max(1, telemetry.length - 4));
    const recentAvg = recent.reduce((sum, p) => sum + p.efficiency, 0) / recent.length;
    const olderAvg = older.reduce((sum, p) => sum + p.efficiency, 0) / older.length;
    if (olderAvg === 0) return 0;
    return ((recentAvg - olderAvg) / olderAvg) * 100;
  }, [telemetry]);

  // SVG Sparkline Dimensions and Coordinate Math
  const svgWidth = 600;
  const svgHeight = 110;
  const paddingX = 10;
  const paddingTop = 12;
  const paddingBottom = 16;
  const plotWidth = svgWidth - paddingX * 2;
  const plotHeight = svgHeight - paddingTop - paddingBottom;

  const pointsCount = Math.max(telemetry.length, 2);
  const getX = (index: number) => paddingX + (index / (pointsCount - 1)) * plotWidth;

  // Normalization math: standard bounds 0 to 100 for Power & Throughput
  const getY = (val: number, maxVal = 100) => {
    const clamped = Math.max(0, Math.min(maxVal, val));
    return paddingTop + plotHeight - (clamped / maxVal) * plotHeight;
  };

  // Sparkline Path Generators
  const throughputPath = useMemo(() => {
    if (telemetry.length === 0) return '';
    return telemetry
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.throughput).toFixed(1)}`)
      .join(' ');
  }, [telemetry]);

  const throughputArea = useMemo(() => {
    if (telemetry.length === 0) return '';
    const firstX = getX(0).toFixed(1);
    const lastX = getX(telemetry.length - 1).toFixed(1);
    const bottomY = (paddingTop + plotHeight).toFixed(1);
    return `${throughputPath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [telemetry, throughputPath, plotHeight]);

  const powerPath = useMemo(() => {
    if (telemetry.length === 0) return '';
    return telemetry
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.power).toFixed(1)}`)
      .join(' ');
  }, [telemetry]);

  const powerArea = useMemo(() => {
    if (telemetry.length === 0) return '';
    const firstX = getX(0).toFixed(1);
    const lastX = getX(telemetry.length - 1).toFixed(1);
    const bottomY = (paddingTop + plotHeight).toFixed(1);
    return `${powerPath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [telemetry, powerPath, plotHeight]);

  // Efficiency path (normalized 0 to 2.5 max ratio)
  const maxEff = 2.5;
  const efficiencyPath = useMemo(() => {
    if (telemetry.length === 0) return '';
    return telemetry
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.efficiency, maxEff).toFixed(1)}`)
      .join(' ');
  }, [telemetry]);

  const efficiencyArea = useMemo(() => {
    if (telemetry.length === 0) return '';
    const firstX = getX(0).toFixed(1);
    const lastX = getX(telemetry.length - 1).toFixed(1);
    const bottomY = (paddingTop + plotHeight).toFixed(1);
    return `${efficiencyPath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [telemetry, efficiencyPath, plotHeight]);

  const activePoint = hoverIndex !== null && telemetry[hoverIndex] ? telemetry[hoverIndex] : telemetry[telemetry.length - 1];

  return (
    <div id="system-efficiency-dashboard-card" className="terminal-box rounded-lg p-4 sm:p-5 space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#00ff4120] pb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#00ff41] animate-pulse" />
          <span className="text-xs sm:text-sm font-bold text-[#00ff41] tracking-wider uppercase">
            SYSTEM EFFICIENCY // TELEMETRY SPARKLINE
          </span>
          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${efficiencyTier.bg} ${efficiencyTier.color}`}>
            {efficiencyTier.label}
          </span>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-[#061408] p-0.5 rounded border border-[#00ff4130] text-[10px] font-mono">
          <button
            onClick={() => setViewMode('combined')}
            id="view-combined-btn"
            className={`px-2 py-0.5 rounded transition-colors ${
              viewMode === 'combined' ? 'bg-[#00ff41] text-black font-bold' : 'text-[#88aa88] hover:text-[#00ff41]'
            }`}
          >
            COMBINED
          </button>
          <button
            onClick={() => setViewMode('throughput')}
            id="view-throughput-btn"
            className={`px-2 py-0.5 rounded transition-colors ${
              viewMode === 'throughput' ? 'bg-[#44aaff] text-black font-bold' : 'text-[#88aa88] hover:text-[#44aaff]'
            }`}
          >
            THROUGHPUT
          </button>
          <button
            onClick={() => setViewMode('power')}
            id="view-power-btn"
            className={`px-2 py-0.5 rounded transition-colors ${
              viewMode === 'power' ? 'bg-[#ffaa22] text-black font-bold' : 'text-[#88aa88] hover:text-[#ffaa22]'
            }`}
          >
            POWER
          </button>
          <button
            onClick={() => setViewMode('efficiency')}
            id="view-efficiency-btn"
            className={`px-2 py-0.5 rounded transition-colors ${
              viewMode === 'efficiency' ? 'bg-[#a855f7] text-black font-bold' : 'text-[#88aa88] hover:text-[#a855f7]'
            }`}
          >
            RATIO
          </button>
        </div>
      </div>

      {/* Top Metric Strip: Efficiency Ratio, Trend, and Node Yields */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
        {/* Metric 1: Realtime Efficiency Index */}
        <div className="bg-[#09150980] border border-[#00ff4120] rounded p-2.5">
          <div className="flex items-center justify-between text-[10px] text-[#88aa88]">
            <span>EFFICIENCY RATIO</span>
            <Gauge className="w-3.5 h-3.5 text-[#00ff41]" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-bold text-[#00ff41] text-glow">
              {currentRatio.toFixed(2)}
            </span>
            <span className="text-[10px] text-[#88aa88]">TP / PWR</span>
          </div>
          <div className="mt-0.5 text-[10px] flex items-center gap-1">
            {trendPercent > 0.5 ? (
              <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                <TrendingUp className="w-3 h-3" /> +{trendPercent.toFixed(1)}%
              </span>
            ) : trendPercent < -0.5 ? (
              <span className="text-amber-400 font-bold flex items-center gap-0.5">
                <TrendingDown className="w-3 h-3" /> {trendPercent.toFixed(1)}%
              </span>
            ) : (
              <span className="text-zinc-400">~ STABLE (0.0%)</span>
            )}
            <span className="text-[#558855]">rolling</span>
          </div>
        </div>

        {/* Metric 2: Net Packet Rate */}
        <div className="bg-[#09150980] border border-[#00ff4120] rounded p-2.5">
          <div className="flex items-center justify-between text-[10px] text-[#88aa88]">
            <span>THROUGHPUT RATE</span>
            <Radio className="w-3.5 h-3.5 text-[#44aaff]" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-bold text-[#44aaff] text-glow-blue">
              {currentThroughput}
            </span>
            <span className="text-[10px] text-[#3377aa]">/ 100 PKT</span>
          </div>
          <div className="mt-0.5 text-[10px] text-[#88aa88]">
            {throughputPerNode} pkt / active node
          </div>
        </div>

        {/* Metric 3: Power Consumption */}
        <div className="bg-[#09150980] border border-[#00ff4120] rounded p-2.5">
          <div className="flex items-center justify-between text-[10px] text-[#88aa88]">
            <span>POWER DRAW</span>
            <Zap className="w-3.5 h-3.5 text-[#ffaa22]" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-bold text-[#ffaa22] text-glow-amber">
              {currentPower}
            </span>
            <span className="text-[10px] text-[#aa8833]">/ 100 PWR</span>
          </div>
          <div className="mt-0.5 text-[10px] text-[#88aa88]">
            {powerPerNode} pwr / active node
          </div>
        </div>

        {/* Metric 4: Node Cluster Status */}
        <div className="bg-[#09150980] border border-[#00ff4120] rounded p-2.5">
          <div className="flex items-center justify-between text-[10px] text-[#88aa88]">
            <span>CLUSTER DENSITY</span>
            <Cpu className="w-3.5 h-3.5 text-[#00ff88]" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-bold text-[#00ff88]">
              {nodeCount}
            </span>
            <span className="text-[10px] text-[#44aa66]">/ 5 NODES</span>
          </div>
          <div className="mt-0.5 text-[10px] text-[#88aa88]">
            Thermal: <span className="text-orange-400 font-bold">{currentHeat}°C</span>
          </div>
        </div>
      </div>

      {/* SVG Sparkline Visualizer */}
      <div className="relative rounded bg-[#050e06] border border-[#00ff4125] p-2.5 overflow-hidden">
        {/* Grid Guides & Labels */}
        <div className="absolute inset-x-2 top-2 bottom-4 pointer-events-none flex flex-col justify-between text-[9px] font-mono text-[#335533]">
          <div className="flex justify-between border-b border-[#00ff4110] pb-0.5">
            <span>MAX (100)</span>
            <span>{viewMode === 'efficiency' ? '2.5x RATIO' : '100% CAP'}</span>
          </div>
          <div className="border-b border-[#00ff4110] border-dashed" />
          <div className="flex justify-between pt-0.5">
            <span>MIN (0)</span>
            <span>0% / BASELINE</span>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-28 sm:h-32 block overflow-visible select-none"
          onMouseLeave={() => setHoverIndex(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const normalizedX = Math.max(0, Math.min(1, mouseX / rect.width));
            const calculatedIndex = Math.round(normalizedX * (pointsCount - 1));
            if (calculatedIndex >= 0 && calculatedIndex < telemetry.length) {
              setHoverIndex(calculatedIndex);
            }
          }}
        >
          <defs>
            {/* Throughput Area Gradient */}
            <linearGradient id="tpGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#00e5ff" stopOpacity="0.0" />
            </linearGradient>

            {/* Power Area Gradient */}
            <linearGradient id="pwrGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffaa00" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#ffaa00" stopOpacity="0.0" />
            </linearGradient>

            {/* Efficiency Area Gradient */}
            <linearGradient id="effGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
            </linearGradient>

            {/* Glow Filter */}
            <filter id="glowFilter" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Render Areas & Lines depending on View Mode */}
          {(viewMode === 'combined' || viewMode === 'power') && powerArea && (
            <path d={powerArea} fill="url(#pwrGradient)" />
          )}

          {(viewMode === 'combined' || viewMode === 'throughput') && throughputArea && (
            <path d={throughputArea} fill="url(#tpGradient)" />
          )}

          {viewMode === 'efficiency' && efficiencyArea && (
            <path d={efficiencyArea} fill="url(#effGradient)" />
          )}

          {/* Power Stroke */}
          {(viewMode === 'combined' || viewMode === 'power') && powerPath && (
            <path
              d={powerPath}
              fill="none"
              stroke="#ffaa22"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glowFilter)"
            />
          )}

          {/* Throughput Stroke */}
          {(viewMode === 'combined' || viewMode === 'throughput') && throughputPath && (
            <path
              d={throughputPath}
              fill="none"
              stroke="#00e5ff"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glowFilter)"
            />
          )}

          {/* Efficiency Stroke */}
          {viewMode === 'efficiency' && efficiencyPath && (
            <path
              d={efficiencyPath}
              fill="none"
              stroke="#c084fc"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glowFilter)"
            />
          )}

          {/* Real-time Hover / Active Crosshair Marker */}
          {activePoint && hoverIndex !== null && (
            <g>
              <line
                x1={getX(hoverIndex)}
                y1={paddingTop}
                x2={getX(hoverIndex)}
                y2={paddingTop + plotHeight}
                stroke="#00ff41"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.8"
              />

              {/* Point on Throughput */}
              {(viewMode === 'combined' || viewMode === 'throughput') && (
                <circle
                  cx={getX(hoverIndex)}
                  cy={getY(activePoint.throughput)}
                  r="4"
                  fill="#00e5ff"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  className="animate-pulse"
                />
              )}

              {/* Point on Power */}
              {(viewMode === 'combined' || viewMode === 'power') && (
                <circle
                  cx={getX(hoverIndex)}
                  cy={getY(activePoint.power)}
                  r="4"
                  fill="#ffaa22"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  className="animate-pulse"
                />
              )}

              {/* Point on Efficiency */}
              {viewMode === 'efficiency' && (
                <circle
                  cx={getX(hoverIndex)}
                  cy={getY(activePoint.efficiency, maxEff)}
                  r="4"
                  fill="#c084fc"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  className="animate-pulse"
                />
              )}
            </g>
          )}
        </svg>

        {/* Dynamic Legend / Point Inspection Strip */}
        <div className="mt-2 pt-2 border-t border-[#00ff4120] flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
          <div className="flex items-center gap-3">
            {(viewMode === 'combined' || viewMode === 'throughput') && (
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#00e5ff] shadow-[0_0_6px_#00e5ff]" />
                <span className="text-[#88ccff]">THROUGHPUT:</span>
                <span className="text-white font-bold">{activePoint ? activePoint.throughput : currentThroughput}</span>
              </div>
            )}

            {(viewMode === 'combined' || viewMode === 'power') && (
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#ffaa22] shadow-[0_0_6px_#ffaa22]" />
                <span className="text-[#ffcc88]">POWER:</span>
                <span className="text-white font-bold">{activePoint ? activePoint.power : currentPower}</span>
              </div>
            )}

            {viewMode === 'efficiency' && (
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#c084fc] shadow-[0_0_6px_#c084fc]" />
                <span className="text-[#e9d5ff]">EFFICIENCY:</span>
                <span className="text-white font-bold">
                  {activePoint ? activePoint.efficiency.toFixed(2) : currentRatio.toFixed(2)}x
                </span>
              </div>
            )}
          </div>

          <div className="text-[#558855] text-[9px]">
            {hoverIndex !== null && activePoint ? (
              <span className="text-[#88ff88]">
                SNAPSHOT @ {activePoint.label} (TP: {activePoint.throughput}, PWR: {activePoint.power})
              </span>
            ) : (
              <span>LIVE TELEMETRY WINDOW (LAST {telemetry.length} SAMPLES)</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
