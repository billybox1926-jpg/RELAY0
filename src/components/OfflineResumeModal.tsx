import React from 'react';
import { OfflineResumeResult } from '../types';
import { sound } from '../game/audio';
import { Radio, ArrowRight, Coins, Clock, Check } from 'lucide-react';

interface OfflineResumeModalProps {
  result: OfflineResumeResult;
  onClose: () => void;
}

export const OfflineResumeModal: React.FC<OfflineResumeModalProps> = ({ result, onClose }) => {
  const mins = (result.elapsedSeconds / 60).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs">
      <div className="terminal-box-active w-full max-w-md rounded-xl bg-[#091409] p-6 shadow-[0_0_40px_#00ff4140]">
        <div className="flex items-center gap-2.5 border-b border-[#00ff4140] pb-3 text-[#00ff41]">
          <Radio className="h-5 w-5 animate-pulse" />
          <h2 className="text-sm font-bold tracking-wider text-glow">
            OFFLINE PROGRESSION SUMMARY
          </h2>
        </div>

        <div className="mt-4 space-y-4 font-mono text-xs">
          <div className="flex items-center justify-between rounded bg-[#00ff4110] border border-[#00ff4130] p-3">
            <div className="flex items-center gap-2 text-[#88ff88]">
              <Clock className="h-4 w-4 text-[#00ff41]" />
              <span>DURATION AWAY:</span>
            </div>
            <span className="text-white font-bold">{mins} MINUTES</span>
          </div>

          <div className="flex items-center justify-between rounded bg-[#ffdd5510] border border-[#ffdd5530] p-3">
            <div className="flex items-center gap-2 text-[#ffdd55]">
              <Coins className="h-4 w-4 text-[#ffaa22]" />
              <span>OFFLINE CREDITS EARNED:</span>
            </div>
            <span className="text-2xl font-bold text-[#ffdd55] text-glow-amber">
              +{result.deltaCredits.toLocaleString()} CR
            </span>
          </div>

          <div className="space-y-1.5 rounded border border-[#00ff4120] bg-[#050c05] p-3 text-[11px]">
            <div className="text-[#00aa30] font-bold mb-1">EQUILIBRIUM ADJUSTMENTS:</div>
            <div className="flex justify-between text-[#88aa88]">
              <span>Power:</span>
              <span className="flex items-center gap-1">
                <span>{result.powerBefore}</span>
                <ArrowRight className="h-3 w-3" />
                <span className="text-white font-bold">{result.powerAfter}</span>
              </span>
            </div>
            <div className="flex justify-between text-[#88aa88]">
              <span>Heat:</span>
              <span className="flex items-center gap-1">
                <span>{result.heatBefore}</span>
                <ArrowRight className="h-3 w-3" />
                <span className="text-white font-bold">{result.heatAfter}</span>
              </span>
            </div>
            <div className="flex justify-between text-[#88aa88]">
              <span>Throughput:</span>
              <span className="flex items-center gap-1">
                <span>{result.throughputBefore}</span>
                <ArrowRight className="h-3 w-3" />
                <span className="text-white font-bold">{result.throughputAfter}</span>
              </span>
            </div>
            <div className="flex justify-between text-[#88aa88]">
              <span>Integrity:</span>
              <span className="flex items-center gap-1">
                <span>{result.healthBefore}%</span>
                <ArrowRight className="h-3 w-3" />
                <span className="text-white font-bold">{result.healthAfter}%</span>
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <button
            id="offline-resume-dismiss-btn"
            onClick={() => {
              sound.playSuccess();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 rounded border border-[#00ff41] bg-[#00ff4125] py-2.5 text-xs font-bold font-mono text-[#00ff41] hover:bg-[#00ff4140] shadow-[0_0_12px_#00ff4130] transition-all"
          >
            <Check className="h-4 w-4" />
            <span>RESUME TERMINAL SESSION</span>
          </button>
        </div>
      </div>
    </div>
  );
};
