import React, { useState } from 'react';
import { GameState } from '../types';
import { UPGRADE_CATALOG } from '../game/constants';
import { calculateUpgradeCost } from '../game/engine';
import { sound } from '../game/audio';
import { ShoppingCart, Check, Zap, Flame, Shield, Radio, Sparkles, BatteryCharging } from 'lucide-react';

interface UpgradesTabProps {
  state: GameState;
  onPurchaseUpgrade: (key: string) => { success: boolean; message: string };
}

export const UpgradesTab: React.FC<UpgradesTabProps> = ({
  state,
  onPurchaseUpgrade,
}) => {
  const [feedback, setFeedback] = useState<{ text: string; success: boolean } | null>(null);

  const { credits, upgradeCounts, upgradeLevel } = state;

  const showFeedback = (text: string, success: boolean) => {
    setFeedback({ text, success });
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleBuy = (key: string) => {
    const res = onPurchaseUpgrade(key);
    if (res.success) {
      sound.playSuccess();
    } else {
      sound.playAlert();
    }
    showFeedback(res.message, res.success);
  };

  const getUpgradeIcon = (key: string) => {
    switch (key) {
      case 'income':
        return <Sparkles className="h-5 w-5 text-[#ffdd55]" />;
      case 'cooling':
        return <Flame className="h-5 w-5 text-[#ff8844]" />;
      case 'reactor':
        return <Zap className="h-5 w-5 text-[#00ff41]" />;
      case 'bandwidth':
        return <Radio className="h-5 w-5 text-[#44aaff]" />;
      case 'armor':
        return <Shield className="h-5 w-5 text-[#00ff88]" />;
      case 'battery':
        return <BatteryCharging className="h-5 w-5 text-[#ffaa22]" />;
      default:
        return <ShoppingCart className="h-5 w-5 text-[#88ff88]" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="terminal-box rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#00ff4120] pb-3">
          <div>
            <h2 className="text-sm font-bold tracking-wider text-[#00ff41] text-glow flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              ENGINEERING UPGRADE CATALOG
            </h2>
            <p className="mt-1 text-xs text-[#88aa88]">
              Permanent hardware and firmware enhancements for relay station equilibrium.
            </p>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs text-[#ffdd55] bg-[#ffdd5515] border border-[#ffdd5530] px-3 py-1.5 rounded-lg">
            <span>CREDITS AVAILABLE:</span>
            <span className="font-bold text-sm">{credits.toLocaleString()} CR</span>
          </div>
        </div>

        {feedback && (
          <div
            className={`mt-3 rounded border p-2.5 text-xs font-mono transition-all ${
              feedback.success
                ? 'border-[#00ff41] bg-[#00ff4115] text-[#88ff88]'
                : 'border-[#ff4444] bg-[#ff444415] text-[#ff7777]'
            }`}
          >
            {feedback.text}
          </div>
        )}
      </div>

      {/* Upgrade Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {UPGRADE_CATALOG.map((item) => {
          const count = item.key === 'income' ? upgradeLevel : (upgradeCounts && upgradeCounts[item.key]) || 0;
          const isMaxed = count >= item.maxLevel;
          const cost = calculateUpgradeCost(item.key, count);
          const canAfford = credits >= cost && !isMaxed;

          return (
            <div
              key={item.key}
              id={`upgrade-card-${item.key}`}
              className={`terminal-box flex flex-col justify-between rounded-lg p-5 transition-all ${
                isMaxed
                  ? 'border-[#00ff4160] bg-[#0c1a0c80]'
                  : canAfford
                  ? 'hover:border-[#00ff41] hover:bg-[#00ff4110]'
                  : 'opacity-80'
              }`}
            >
              <div>
                {/* Top Row: Icon, Title & Level Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded border border-[#00ff4140] bg-[#00ff4115]">
                      {getUpgradeIcon(item.key)}
                    </div>
                    <div>
                      <h3 className="text-xs font-bold tracking-wide text-[#88ff88]">{item.name}</h3>
                      <div className="text-[10px] text-[#44aa44] font-mono">CODE // {item.key.toUpperCase()}</div>
                    </div>
                  </div>

                  <span
                    className={`rounded px-2 py-0.5 text-xs font-bold font-mono ${
                      isMaxed
                        ? 'border border-[#00ff41] bg-[#00ff4130] text-[#00ff41]'
                        : 'border border-[#44aa4440] bg-[#00ff4110] text-[#88aa88]'
                    }`}
                  >
                    LVL {count}/{item.maxLevel}
                  </span>
                </div>

                {/* Description */}
                <p className="mt-3 text-xs text-[#aaccaa] leading-relaxed min-h-[36px]">
                  {item.desc}
                </p>
              </div>

              {/* Purchase Action Button */}
              <div className="mt-4 pt-3 border-t border-[#00ff4115]">
                {isMaxed ? (
                  <div className="flex items-center justify-center gap-1.5 rounded border border-[#00ff4150] bg-[#00ff4115] py-2 text-xs font-bold text-[#00ff41]">
                    <Check className="h-4 w-4" />
                    <span>MAX LEVEL ACHIEVED</span>
                  </div>
                ) : (
                  <button
                    id={`buy-upgrade-btn-${item.key}`}
                    onClick={() => handleBuy(item.key)}
                    disabled={!canAfford}
                    className={`w-full flex items-center justify-between rounded px-3 py-2 text-xs font-bold font-mono transition-all ${
                      canAfford
                        ? 'border border-[#00ff41] bg-[#00ff4120] text-[#00ff41] hover:bg-[#00ff4135] shadow-[0_0_10px_#00ff4130]'
                        : 'border border-[#334433] bg-[#0a110a] text-[#556655] cursor-not-allowed'
                    }`}
                  >
                    <span>PURCHASE UPGRADE</span>
                    <span className={canAfford ? 'text-[#ffdd55] font-bold' : 'text-[#665544]'}>
                      {cost.toLocaleString()} CR
                    </span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
