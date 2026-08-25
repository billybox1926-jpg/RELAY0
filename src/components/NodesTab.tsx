import React, { useState } from 'react';
import { GameState } from '../types';
import { MAX_NODES } from '../game/constants';
import { sound } from '../game/audio';
import { Cpu, Zap, Flame, Radio, Shield, PlusCircle, Wrench, ArrowUpCircle, HeartHandshake, Check } from 'lucide-react';

interface NodesTabProps {
  state: GameState;
  onOverclock: () => { success: boolean; message: string };
  onRepair: () => { success: boolean; message: string };
  onExpand: () => { success: boolean; message: string };
  onUpgradeNode: () => { success: boolean; message: string };
  onRestoreHealth: () => { success: boolean; message: string };
}

export const NodesTab: React.FC<NodesTabProps> = ({
  state,
  onOverclock,
  onRepair,
  onExpand,
  onUpgradeNode,
  onRestoreHealth,
}) => {
  const [selectedNode, setSelectedNode] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<{ text: string; success: boolean } | null>(null);

  const { nodesUnlocked, credits, power, heat, throughput, networkHealth, upgradeLevel } = state;

  const showStatus = (text: string, success: boolean) => {
    setStatusMessage({ text, success });
    setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
  };

  const handleAction = (actionFn: () => { success: boolean; message: string }) => {
    const res = actionFn();
    if (res.success) {
      sound.playSuccess();
    } else {
      sound.playAlert();
    }
    showStatus(res.message, res.success);
  };

  const isPrimary = selectedNode === 0;
  const isUnlocked = selectedNode < nodesUnlocked;

  return (
    <div className="space-y-6">
      {/* Node Selector Strip */}
      <div className="terminal-box rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#00ff4120] pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-[#00ff41]" />
            <h2 className="text-sm font-bold tracking-wider text-[#00ff41] text-glow">
              RELAY STATION NODE TOPOLOGY
            </h2>
          </div>
          <span className="text-xs text-[#88aa88] font-mono">
            {nodesUnlocked} / {MAX_NODES} Nodes Active
          </span>
        </div>

        {/* Node Buttons */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {Array.from({ length: MAX_NODES }).map((_, i) => {
            const unlocked = i < nodesUnlocked;
            const isSelected = selectedNode === i;

            return (
              <button
                key={i}
                id={`select-node-btn-${i}`}
                onClick={() => {
                  sound.playKeypress();
                  setSelectedNode(i);
                }}
                className={`flex flex-col items-center rounded-lg border p-3 font-mono transition-all ${
                  isSelected
                    ? 'border-[#00ff41] bg-[#00ff4125] shadow-[0_0_12px_#00ff4150]'
                    : unlocked
                    ? 'border-[#00ff4140] bg-[#0c160c] hover:border-[#00ff4180] text-[#88ff88]'
                    : 'border-[#334433] bg-[#080d08] opacity-50 hover:opacity-75 text-[#556655]'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <span>NODE {i}</span>
                  {i === 0 && <span className="text-[10px] text-[#ffaa22]">[CORE]</span>}
                </div>
                <div className="mt-1 text-[11px]">
                  {unlocked ? (
                    <span className="text-[#00ff41] font-semibold">ONLINE</span>
                  ) : (
                    <span className="text-[#ff5555]">LOCKED</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Node Details & Actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Node Status Card */}
        <div className="terminal-box rounded-lg p-5 lg:col-span-1 space-y-4">
          <div className="border-b border-[#00ff4120] pb-2">
            <h3 className="text-sm font-bold text-[#00ff41] text-glow">
              {isPrimary ? 'NODE 0 - CORE RELAY HUB' : isUnlocked ? `NODE ${selectedNode} - SATELLITE RELAY` : `NODE ${selectedNode} - OFFLINE (LOCKED)`}
            </h3>
            <p className="text-xs text-[#88aa88] mt-1">
              {isPrimary
                ? 'Central switching hub. Oversees sub-node expansion and system upgrades.'
                : isUnlocked
                ? 'Auxiliary network transceiver. Provides throughput redundancy.'
                : 'Unprovisioned hardware slot. Expand network from primary node to activate.'}
            </p>
          </div>

          <div className="space-y-2 font-mono text-xs">
            <div className="flex justify-between py-1 border-b border-[#00ff4110]">
              <span className="text-[#88aa88]">Operating Status:</span>
              <span className={isUnlocked ? 'text-[#00ff41] font-bold' : 'text-[#ff5555]'}>
                {isUnlocked ? 'OPERATIONAL' : 'LOCKED'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#00ff4110]">
              <span className="text-[#88aa88]">Grid Power:</span>
              <span className="text-[#00ff41] font-bold">{power}/100</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#00ff4110]">
              <span className="text-[#88aa88]">Thermal Temp:</span>
              <span className="text-[#ffaa44] font-bold">{heat}/100</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#00ff4110]">
              <span className="text-[#88aa88]">Throughput:</span>
              <span className="text-[#44aaff] font-bold">{throughput}/100</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#00ff4110]">
              <span className="text-[#88aa88]">Health Integrity:</span>
              <span className="text-[#00ff88] font-bold">{networkHealth}%</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#00ff4110]">
              <span className="text-[#88aa88]">Upgrade Multiplier:</span>
              <span className="text-[#ffdd55] font-bold">&times;{(1 + upgradeLevel * 0.25).toFixed(2)}</span>
            </div>
          </div>

          {/* Feedback Status */}
          {statusMessage && (
            <div
              className={`rounded border p-2.5 text-xs font-mono transition-all ${
                statusMessage.success
                  ? 'border-[#00ff41] bg-[#00ff4115] text-[#88ff88]'
                  : 'border-[#ff4444] bg-[#ff444415] text-[#ff7777]'
              }`}
            >
              {statusMessage.text}
            </div>
          )}
        </div>

        {/* Action Commands Card */}
        <div className="terminal-box rounded-lg p-5 lg:col-span-2 space-y-4">
          <div className="border-b border-[#00ff4120] pb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#00ff41] text-glow">
              NODE {selectedNode} // COMMAND INTERFACE
            </h3>
            <span className="text-xs text-[#ffdd55] font-mono">
              Available Credits: <span className="font-bold">{credits} CR</span>
            </span>
          </div>

          {!isUnlocked ? (
            <div className="rounded-lg border border-[#ff444440] bg-[#1a0a0a] p-6 text-center">
              <p className="text-sm text-[#ff7777] font-semibold">Node {selectedNode} is currently locked.</p>
              <p className="text-xs text-[#887777] mt-1">
                Select Node 0 (Primary) and execute the <span className="text-[#00ff41] font-bold">EXPAND NODE</span> action to unlock additional relay capacity.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Overclock */}
              <button
                id="action-overclock-btn"
                onClick={() => handleAction(onOverclock)}
                disabled={credits < 30}
                className={`flex items-start gap-3 rounded-lg border p-3.5 text-left transition-all ${
                  credits >= 30
                    ? 'border-[#00ff4150] bg-[#0b1a0b] hover:border-[#00ff41] hover:bg-[#00ff4120]'
                    : 'border-[#334433] bg-[#090d09] opacity-60 cursor-not-allowed'
                }`}
              >
                <Zap className="h-5 w-5 text-[#ffaa22] shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#88ff88]">OVERCLOCK</span>
                    <span className="text-xs font-mono text-[#ffdd55]">30 CR</span>
                  </div>
                  <p className="text-[11px] text-[#88aa88] mt-1">
                    Throughput <span className="text-[#44aaff]">+10</span>, Heat <span className="text-[#ff8844]">+15</span>.
                  </p>
                </div>
              </button>

              {/* Repair */}
              <button
                id="action-repair-btn"
                onClick={() => handleAction(onRepair)}
                disabled={credits < 20}
                className={`flex items-start gap-3 rounded-lg border p-3.5 text-left transition-all ${
                  credits >= 20
                    ? 'border-[#00ff4150] bg-[#0b1a0b] hover:border-[#00ff41] hover:bg-[#00ff4120]'
                    : 'border-[#334433] bg-[#090d09] opacity-60 cursor-not-allowed'
                }`}
              >
                <Wrench className="h-5 w-5 text-[#00ff41] shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#88ff88]">THERMAL REPAIR</span>
                    <span className="text-xs font-mono text-[#ffdd55]">20 CR</span>
                  </div>
                  <p className="text-[11px] text-[#88aa88] mt-1">
                    Resets thermal load (Heat) directly to <span className="text-[#00ff41]">30</span>.
                  </p>
                </div>
              </button>

              {/* Restore Health */}
              <button
                id="action-restore-health-btn"
                onClick={() => handleAction(onRestoreHealth)}
                disabled={credits < 150}
                className={`flex items-start gap-3 rounded-lg border p-3.5 text-left transition-all ${
                  credits >= 150
                    ? 'border-[#00ff8850] bg-[#0b1a10] hover:border-[#00ff88] hover:bg-[#00ff8820]'
                    : 'border-[#334433] bg-[#090d09] opacity-60 cursor-not-allowed'
                }`}
              >
                <HeartHandshake className="h-5 w-5 text-[#00ff88] shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#aaffcc]">RESTORE HEALTH</span>
                    <span className="text-xs font-mono text-[#ffdd55]">150 CR</span>
                  </div>
                  <p className="text-[11px] text-[#88aa88] mt-1">
                    Network Integrity <span className="text-[#00ff88]">+30%</span> (max 100%).
                  </p>
                </div>
              </button>

              {/* Primary Node Actions: Expand & Upgrade Level */}
              {isPrimary && (
                <>
                  {/* Expand Node */}
                  <button
                    id="action-expand-node-btn"
                    onClick={() => handleAction(onExpand)}
                    disabled={nodesUnlocked >= MAX_NODES || credits < 500}
                    className={`flex items-start gap-3 rounded-lg border p-3.5 text-left transition-all ${
                      nodesUnlocked < MAX_NODES && credits >= 500
                        ? 'border-[#44aaff50] bg-[#0b1520] hover:border-[#44aaff] hover:bg-[#44aaff20]'
                        : 'border-[#334433] bg-[#090d09] opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <PlusCircle className="h-5 w-5 text-[#44aaff] shrink-0 mt-0.5" />
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#88ccff]">EXPAND NODE</span>
                        <span className="text-xs font-mono text-[#ffdd55]">500 CR</span>
                      </div>
                      <p className="text-[11px] text-[#88aa88] mt-1">
                        {nodesUnlocked >= MAX_NODES
                          ? 'Maximum nodes reached (5/5).'
                          : `Unlock Node ${nodesUnlocked}. Expands total network capacity.`}
                      </p>
                    </div>
                  </button>

                  {/* System Upgrade */}
                  <button
                    id="action-system-upgrade-btn"
                    onClick={() => handleAction(onUpgradeNode)}
                    disabled={credits < 200}
                    className={`flex items-start gap-3 rounded-lg border p-3.5 text-left transition-all ${
                      credits >= 200
                        ? 'border-[#ffaa2250] bg-[#1a140b] hover:border-[#ffaa22] hover:bg-[#ffaa2220]'
                        : 'border-[#334433] bg-[#090d09] opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <ArrowUpCircle className="h-5 w-5 text-[#ffaa22] shrink-0 mt-0.5" />
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#ffbb55]">UPGRADE LEVEL</span>
                        <span className="text-xs font-mono text-[#ffdd55]">200 CR</span>
                      </div>
                      <p className="text-[11px] text-[#88aa88] mt-1">
                        Level <span className="text-[#ffdd55]">+1</span>. Permanently increases income multiplier by +0.25x.
                      </p>
                    </div>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
