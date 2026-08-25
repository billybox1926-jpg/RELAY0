import React from 'react';
import { GameState } from '../types';

interface FooterHUDProps {
  state: GameState;
}

export const FooterHUD: React.FC<FooterHUDProps> = ({ state }) => {
  const { credits, power, heat, throughput, nodesUnlocked, networkHealth, upgradeLevel } = state;

  let warning = '';
  if (heat > 80) warning += ' [!OVERHEAT!]';
  if (power < 15) warning += ' [LOW POWER]';
  if (networkHealth < 30) warning += ' [CRITICAL]';

  let footerColor = 'text-[#88ff88] border-[#00ff4140] bg-[#081208]';
  if (heat > 80 || power < 15 || networkHealth < 30) {
    footerColor = 'text-[#ff4444] border-[#ff444460] bg-[#1a0808] animate-pulse';
  } else if (heat > 60 || power < 30) {
    footerColor = 'text-[#ffaa44] border-[#ffaa4460] bg-[#1a1208]';
  }

  return (
    <footer className={`sticky bottom-0 z-40 w-full border-t px-3 py-2 sm:px-6 transition-all ${footerColor}`}>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-1 text-[11px] sm:text-xs font-mono">
        {/* Telemetry Readout */}
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1 font-bold tracking-tight">
          <span>Credits: <span className="text-white">{credits.toLocaleString()}</span></span>
          <span className="text-[#445544]">|</span>
          <span>Power: <span className="text-white">{power}/100</span></span>
          <span className="text-[#445544]">|</span>
          <span>Heat: <span className="text-white">{heat}/100</span></span>
          <span className="text-[#445544]">|</span>
          <span>Throughput: <span className="text-white">{throughput}/100</span></span>
          <span className="text-[#445544]">|</span>
          <span>Nodes: <span className="text-white">{nodesUnlocked}</span></span>
          <span className="text-[#445544]">|</span>
          <span>Health: <span className="text-white">{networkHealth}%</span></span>
          <span className="text-[#445544]">|</span>
          <span>Lvl: <span className="text-white">{upgradeLevel}</span></span>
          {warning && <span className="font-extrabold underline">{warning}</span>}
        </div>

        {/* Keyboard Quick Guide */}
        <div className="hidden lg:flex items-center gap-2 text-[10px] text-[#448844]">
          <span className="bg-[#00ff4115] px-1.5 py-0.5 rounded border border-[#00ff4130]">← / → Tab</span>
          <span className="bg-[#00ff4115] px-1.5 py-0.5 rounded border border-[#00ff4130]">1..5 Quick Tab</span>
          <span className="bg-[#00ff4115] px-1.5 py-0.5 rounded border border-[#00ff4130]">Space: Income Tick</span>
        </div>
      </div>
    </footer>
  );
};
