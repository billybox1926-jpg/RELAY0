import React from 'react';
import { TabId } from '../types';
import { sound } from '../game/audio';
import { Activity, Cpu, GitBranch, ShoppingCart, ListCollapse } from 'lucide-react';

interface TabBarProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  ruleCount: number;
  logCount: number;
}

export const TabBar: React.FC<TabBarProps> = ({
  activeTab,
  onSelectTab,
  ruleCount,
  logCount,
}) => {
  const tabs = [
    { id: 0 as TabId, label: 'MONITOR', icon: Activity, badge: null },
    { id: 1 as TabId, label: 'AUTOMATION', icon: GitBranch, badge: ruleCount > 0 ? `${ruleCount}/10` : null },
    { id: 2 as TabId, label: 'NODES', icon: Cpu, badge: null },
    { id: 3 as TabId, label: 'UPGRADES', icon: ShoppingCart, badge: null },
    { id: 4 as TabId, label: 'LOGS', icon: ListCollapse, badge: logCount > 0 ? `${logCount}` : null },
  ];

  return (
    <nav className="w-full border-b border-[#00ff4130] bg-[#0c160c] px-2 sm:px-6">
      <div className="flex items-center overflow-x-auto scrollbar-none py-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              id={`tab-nav-${tab.label.toLowerCase()}`}
              onClick={() => {
                sound.playKeypress();
                onSelectTab(tab.id);
              }}
              className={`relative flex items-center gap-2 whitespace-nowrap px-4 py-3 text-xs sm:text-sm font-bold tracking-wider transition-all ${
                isActive
                  ? 'text-[#ffffff] bg-[#00ff4115] shadow-inner'
                  : 'text-[#44ff44aa] hover:text-[#88ff88] hover:bg-[#00ff410a]'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-[#00ff41]' : 'text-[#44ff4480]'}`} />
              <span>{tab.label}</span>

              {tab.badge && (
                <span
                  className={`ml-1 rounded px-1.5 py-0.2 text-[10px] ${
                    isActive
                      ? 'border border-[#00ff4180] bg-[#00ff4125] text-[#00ff41]'
                      : 'border border-[#44ff4430] bg-[#00ff4110] text-[#44aa44]'
                  }`}
                >
                  {tab.badge}
                </span>
              )}

              {/* Underline Indicator */}
              <div
                className={`absolute bottom-0 left-0 right-0 h-[3px] transition-all ${
                  isActive
                    ? 'bg-[#ffffff] shadow-[0_0_8px_#ffffff]'
                    : 'bg-[#00ff4120]'
                }`}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
};
