import React, { useState } from 'react';
import { sound } from '../game/audio';
import { ListCollapse, Trash2, Download, Filter } from 'lucide-react';

interface LogsTabProps {
  logs: string[];
  onClearLogs: () => void;
}

export const LogsTab: React.FC<LogsTabProps> = ({ logs, onClearLogs }) => {
  const [filter, setFilter] = useState<'all' | 'events' | 'rules' | 'system'>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  const getLogStyle = (entry: string) => {
    if (entry.includes('!!') || entry.includes('CRITICAL') || entry.includes('DAMAGE') || entry.includes('CORRUPTION')) {
      return 'text-[#ff5555] bg-[#220a0a40] border-l-2 border-[#ff3333]';
    }
    if (entry.includes('>>') || entry.includes('WARNING') || entry.includes('SPIKE') || entry.includes('FLARE') || entry.includes('STORM')) {
      return 'text-[#ffaa44] bg-[#22170a40] border-l-2 border-[#ffaa22]';
    }
    if (entry.includes('++') || entry.includes('$$') || entry.includes('**') || entry.includes('Rule fired') || entry.includes('Earned') || entry.includes('BOOST')) {
      return 'text-[#00ff88] bg-[#0a221240] border-l-2 border-[#00ff88]';
    }
    return 'text-[#88ff88] border-l-2 border-[#00ff4130]';
  };

  const filteredLogs = logs.filter((log) => {
    if (filter === 'events') return log.includes('!!') || log.includes('>>') || log.includes('++') || log.includes('$$') || log.includes('**') || log.includes('~~');
    if (filter === 'rules') return log.includes('Rule fired');
    if (filter === 'system') return log.includes('terminal') || log.includes('Resuming') || log.includes('Reset') || log.includes('Purchased');
    return true;
  });

  const handleDownload = () => {
    sound.playKeypress();
    const blob = new Blob([logs.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relay0_logs_${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Logs Header Control Strip */}
      <div className="terminal-box rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#00ff4120] pb-3">
          <div className="flex items-center gap-2">
            <ListCollapse className="h-5 w-5 text-[#00ff41]" />
            <div>
              <h2 className="text-sm font-bold tracking-wider text-[#00ff41] text-glow">
                SYSTEM ACTIVITY & TELEMETRY LOGS
              </h2>
              <span className="text-xs text-[#88aa88]">Buffer: {logs.length} / 100 entries</span>
            </div>
          </div>

          {/* Action Tools */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-[#0a140a] border border-[#00ff4130] rounded p-0.5 text-xs font-mono">
              <Filter className="h-3 w-3 text-[#44aa44] ml-1.5" />
              {(['all', 'events', 'rules', 'system'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    sound.playKeypress();
                    setFilter(f);
                  }}
                  className={`rounded px-2 py-1 uppercase text-[10px] font-bold transition-all ${
                    filter === f
                      ? 'bg-[#00ff4130] text-[#00ff41] border border-[#00ff4160]'
                      : 'text-[#558855] hover:text-[#88aa88]'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Export */}
            <button
              id="export-logs-btn"
              onClick={handleDownload}
              className="flex items-center gap-1.5 rounded border border-[#00ff4140] bg-[#00ff4110] px-2.5 py-1.5 text-xs font-mono text-[#88ff88] hover:bg-[#00ff4125] transition-all"
              title="Download text logs"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">EXPORT</span>
            </button>

            {/* Clear Logs */}
            {confirmClear ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    sound.playAlert();
                    onClearLogs();
                    setConfirmClear(false);
                  }}
                  className="rounded border border-[#ff3333] bg-[#ff333330] px-2 py-1 text-[11px] font-bold text-white hover:bg-[#ff333350]"
                >
                  CONFIRM CLEAR
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="rounded border border-[#556655] px-2 py-1 text-[11px] text-[#889988]"
                >
                  CANCEL
                </button>
              </div>
            ) : (
              <button
                id="clear-logs-btn"
                onClick={() => setConfirmClear(true)}
                className="flex items-center gap-1.5 rounded border border-[#ff444440] bg-[#1a0a0a] px-2.5 py-1.5 text-xs font-mono text-[#ff7777] hover:border-[#ff444480] hover:bg-[#ff444420] transition-all"
                title="Clear all logs"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">CLEAR</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Terminal Logs Stream */}
      <div className="terminal-box rounded-lg p-3 sm:p-4 min-h-[400px] max-h-[600px] overflow-y-auto font-mono text-xs space-y-1.5 bg-[#050905]">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-[#558855]">
            No activity logs match the selected filter.
          </div>
        ) : (
          filteredLogs.map((entry, idx) => (
            <div
              key={idx}
              className={`px-3 py-1.5 rounded-sm transition-colors ${getLogStyle(entry)}`}
            >
              {entry}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
