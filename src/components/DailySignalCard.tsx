import React, { useState, useEffect } from 'react';
import { GameState, DailySignalChallenge } from '../types';
import {
  formatTimeRemaining,
  isSignalMultiplierActive,
  getSignalMultiplier,
} from '../game/dailySignal';
import { sound } from '../game/audio';
import {
  Radio,
  Zap,
  Clock,
  Sparkles,
  CheckCircle,
  RotateCw,
  Award,
  ChevronRight,
  ShieldCheck,
  Flame,
  Activity,
  Cpu,
} from 'lucide-react';

interface DailySignalCardProps {
  state: GameState;
  onRetuneSignal?: () => void;
  onManualEvaluate?: () => void;
}

export const DailySignalCard: React.FC<DailySignalCardProps> = ({
  state,
  onRetuneSignal,
}) => {
  const signal = state.dailySignal;
  const [now, setNow] = useState<number>(Date.now());
  const [isRetuning, setIsRetuning] = useState<boolean>(false);

  // Live 1s interval for countdown timers
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!signal) {
    return null;
  }

  const isCompleted = signal.completed;
  const isBoostActive = isSignalMultiplierActive(signal, now);
  const multiplier = getSignalMultiplier(signal, now);
  const timeToExpiry = Math.max(0, signal.expiresAt - now);
  const boostTimeRemaining = signal.rewardExpiresAt ? Math.max(0, signal.rewardExpiresAt - now) : 0;

  const currentProgress = Math.min(signal.currentValue || 0, signal.targetValue);
  const percent = Math.min(100, Math.round((currentProgress / signal.targetValue) * 100));

  const handleRetune = () => {
    sound.playBeep(1200, 0.08);
    setIsRetuning(true);
    setTimeout(() => {
      if (onRetuneSignal) onRetuneSignal();
      setIsRetuning(false);
      sound.playSuccess();
    }, 400);
  };

  // Get appropriate goal icon
  const getGoalIcon = () => {
    switch (signal.goalType) {
      case 'sustain_throughput':
        return <Activity className="h-4 w-4 text-[#38bdf8]" />;
      case 'thermal_stability':
        return <Flame className="h-4 w-4 text-[#fb923c]" />;
      case 'power_grid':
        return <Zap className="h-4 w-4 text-[#facc15]" />;
      case 'credit_surge':
        return <Award className="h-4 w-4 text-[#4ade80]" />;
      case 'network_fortification':
        return <ShieldCheck className="h-4 w-4 text-[#34d399]" />;
      case 'automation_deploy':
        return <Cpu className="h-4 w-4 text-[#a78bfa]" />;
      case 'overclock_matrix':
        return <Zap className="h-4 w-4 text-[#f43f5e]" />;
      case 'hardware_upgrade':
        return <Cpu className="h-4 w-4 text-[#2dd4bf]" />;
      default:
        return <Radio className="h-4 w-4 text-[#00ff41]" />;
    }
  };

  return (
    <div
      id="daily-signal-challenge-card"
      className={`terminal-box relative overflow-hidden rounded-lg p-4 sm:p-5 transition-all duration-300 ${
        isBoostActive
          ? 'border-[#00ff41] bg-[#06180a] shadow-[0_0_20px_rgba(0,255,65,0.15)]'
          : isCompleted
          ? 'border-[#00ff4160] bg-[#08150a]'
          : 'border-[#00ff4135] bg-[#081208]'
      }`}
    >
      {/* Background Radio Grid Scan Effect */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#00ff4106] blur-2xl" />

      {/* Top Bar: Frequency & 24h Window Timer */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#00ff4125] pb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded border transition-all ${
              isBoostActive
                ? 'border-[#00ff41] bg-[#00ff4125] text-[#00ff41] shadow-[0_0_10px_#00ff41]'
                : isCompleted
                ? 'border-[#00ff4180] bg-[#00ff4115] text-[#00ff41]'
                : 'border-[#00ff4140] bg-[#00ff410d] text-[#88ff88]'
            }`}
          >
            <Radio className={`h-4 w-4 ${isBoostActive ? 'animate-pulse' : ''}`} />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold tracking-wider text-[#00ff41]">
                DAILY SIGNAL INTERCEPT
              </span>
              <span className="rounded border border-[#00ff4140] bg-[#00ff4115] px-1.5 py-0.2 text-[10px] font-mono font-semibold text-[#88ff88]">
                {signal.callsign}
              </span>
            </div>
            <div className="text-[11px] font-mono text-[#55aa55] flex items-center gap-1.5">
              <span>{signal.frequency}</span>
              <span className="text-[#336633]">&bull;</span>
              <span className="text-[10px] text-[#448844]">24H ROTATION</span>
            </div>
          </div>
        </div>

        {/* 24-Hour Expiry Clock */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded border border-[#00ff4130] bg-[#050e05] px-2.5 py-1 text-xs font-mono">
            <Clock className="h-3.5 w-3.5 text-[#55bb55]" />
            <span className="text-[11px] text-[#77cc77]">
              Window: <span className="font-bold text-[#ffffff]">{formatTimeRemaining(timeToExpiry)}</span>
            </span>
          </div>

          {onRetuneSignal && (
            <button
              id="retune-signal-btn"
              onClick={handleRetune}
              disabled={isRetuning}
              title="Re-scan and tune frequency to calibrate signal seed"
              className="flex items-center gap-1 rounded border border-[#00ff4130] bg-[#0a1a0a] px-2 py-1 text-[11px] font-mono text-[#66bb66] hover:border-[#00ff4180] hover:bg-[#00ff4115] hover:text-[#00ff41] transition-all disabled:opacity-50"
            >
              <RotateCw className={`h-3 w-3 ${isRetuning ? 'animate-spin text-[#00ff41]' : ''}`} />
              <span className="hidden sm:inline">RETUNE</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Boost Banner (When Multiplier is Active) */}
      {isBoostActive && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-[#00ff41] bg-[#00ff4115] px-3.5 py-2.5 shadow-[0_0_15px_rgba(0,255,65,0.15)] animate-pulse">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#00ff41] text-black">
              <Zap className="h-3.5 w-3.5 fill-current" />
            </div>
            <div>
              <div className="text-xs font-bold tracking-wide text-white flex items-center gap-1.5">
                <span>SIGNAL MULTIPLIER ENGAGED: {multiplier}x CREDIT BOOST</span>
                <Sparkles className="h-3.5 w-3.5 text-[#00ff41]" />
              </div>
              <div className="text-[11px] text-[#88ff88] font-mono">
                All station income & offline generation boosted by +{((multiplier - 1) * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded border border-[#00ff4160] bg-[#003300] px-2.5 py-1 text-xs font-mono font-bold text-[#00ff41]">
            <Clock className="h-3.5 w-3.5 animate-spin text-[#00ff41]" />
            <span>{formatTimeRemaining(boostTimeRemaining)}</span>
          </div>
        </div>
      )}

      {/* Mission Objective Dossier */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        <div className="lg:col-span-8 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded border border-[#00ff4130] bg-[#00ff4110]">
              {getGoalIcon()}
            </span>
            <h3 className="text-sm font-bold tracking-wide text-[#ffffff]">
              {signal.title}
            </h3>
            {isCompleted ? (
              <span className="flex items-center gap-1 rounded border border-[#00ff4180] bg-[#00ff4120] px-2 py-0.5 text-[10px] font-mono font-bold text-[#00ff41]">
                <CheckCircle className="h-3 w-3" />
                DECODED
              </span>
            ) : (
              <span className="rounded border border-[#38bdf840] bg-[#38bdf810] px-2 py-0.5 text-[10px] font-mono font-semibold text-[#38bdf8]">
                IN PROGRESS
              </span>
            )}
          </div>

          <p className="text-xs text-[#a0cfa0] font-mono leading-relaxed">
            {signal.description}
          </p>

          <p className="text-[11px] text-[#558855] italic font-mono">
            &ldquo;{signal.flavorText}&rdquo;
          </p>

          {/* Dynamic Progress Bar */}
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#66aa66] flex items-center gap-1">
                Progress: <span className="text-[#ffffff] font-bold">{currentProgress} / {signal.targetValue} {signal.unit}</span>
              </span>
              <span className={`font-bold ${isCompleted ? 'text-[#00ff41]' : 'text-[#88ff88]'}`}>
                {percent}%
              </span>
            </div>

            <div className="relative h-3 w-full overflow-hidden rounded bg-[#0e1f0e] border border-[#00ff4130]">
              <div
                className={`h-full transition-all duration-500 ${
                  isCompleted
                    ? 'bg-[#00ff41] shadow-[0_0_12px_#00ff41]'
                    : percent > 60
                    ? 'bg-[#38bdf8] shadow-[0_0_8px_#38bdf8]'
                    : 'bg-[#4ade80]'
                }`}
                style={{ width: `${Math.max(3, percent)}%` }}
              />
              {/* Notches */}
              <div className="absolute inset-0 flex justify-between px-2 pointer-events-none opacity-30">
                <span className="h-full w-[1px] bg-black" />
                <span className="h-full w-[1px] bg-black" />
                <span className="h-full w-[1px] bg-black" />
              </div>
            </div>
          </div>
        </div>

        {/* Reward Status & Yield Card */}
        <div className="lg:col-span-4 rounded border border-[#00ff4130] bg-[#051105] p-3 space-y-2">
          <div className="flex items-center justify-between border-b border-[#00ff4120] pb-1.5">
            <span className="text-[11px] font-mono font-bold text-[#88ff88] flex items-center gap-1">
              <Award className="h-3.5 w-3.5 text-[#00ff41]" />
              MISSION PAYLOAD
            </span>
            <span className="text-[10px] font-mono text-[#558855]">SIGNAL REWARD</span>
          </div>

          <div className="space-y-2 font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#669966]">Credit Multiplier:</span>
              <span className="font-bold text-[#00ff41] flex items-center gap-1">
                <Zap className="h-3 w-3 fill-current" />
                {signal.rewardMultiplier}x ({(signal.rewardDurationSeconds / 3600).toFixed(0)}h)
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#669966]">Instant Grant:</span>
              <span className="font-bold text-[#ffffff]">+{signal.creditBonus} CR</span>
            </div>

            <div className="flex items-center justify-between border-t border-[#00ff4115] pt-1.5 text-[11px]">
              <span className="text-[#558855]">Status:</span>
              {isCompleted ? (
                <span className="font-bold text-[#00ff41] flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  CLAIMED
                </span>
              ) : (
                <span className="text-[#eab308] font-semibold flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  AWAITING LOCK
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
