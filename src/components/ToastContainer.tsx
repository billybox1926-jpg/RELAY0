import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Activity,
  X,
  ArrowRight,
  Radio,
  Trash2,
} from 'lucide-react';
import { ToastNotification, ToastType, TabId } from '../types';

interface ToastContainerProps {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  onNavigateTab: (tabId: TabId) => void;
}

interface ToastItemProps {
  toast: ToastNotification;
  onDismiss: (id: string) => void;
  onNavigateTab: (tabId: TabId) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss, onNavigateTab }) => {
  const duration = toast.duration || 6000;
  const [progress, setProgress] = useState<number>(100);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  useEffect(() => {
    if (isPaused) return;

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (elapsed >= duration) {
        clearInterval(interval);
        onDismiss(toast.id);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [toast.id, duration, isPaused, onDismiss]);

  const getTypeStyles = (type: ToastType) => {
    switch (type) {
      case 'critical':
        return {
          border: 'border-red-500/80',
          bg: 'bg-zinc-950/95',
          shadow: 'shadow-[0_0_25px_rgba(239,68,68,0.35)]',
          badgeBg: 'bg-red-950/80 text-red-400 border border-red-800',
          titleColor: 'text-red-300',
          iconColor: 'text-red-400',
          barColor: 'bg-red-500',
          Icon: AlertTriangle,
          glow: 'animate-pulse',
        };
      case 'warning':
        return {
          border: 'border-amber-500/80',
          bg: 'bg-zinc-950/95',
          shadow: 'shadow-[0_0_25px_rgba(245,158,11,0.3)]',
          badgeBg: 'bg-amber-950/80 text-amber-400 border border-amber-800',
          titleColor: 'text-amber-300',
          iconColor: 'text-amber-400',
          barColor: 'bg-amber-500',
          Icon: AlertCircle,
          glow: '',
        };
      case 'success':
        return {
          border: 'border-emerald-500/80',
          bg: 'bg-zinc-950/95',
          shadow: 'shadow-[0_0_25px_rgba(34,197,94,0.3)]',
          badgeBg: 'bg-emerald-950/80 text-emerald-400 border border-emerald-800',
          titleColor: 'text-emerald-300',
          iconColor: 'text-emerald-400',
          barColor: 'bg-emerald-500',
          Icon: CheckCircle2,
          glow: '',
        };
      case 'info':
      default:
        return {
          border: 'border-cyan-500/80',
          bg: 'bg-zinc-950/95',
          shadow: 'shadow-[0_0_25px_rgba(6,182,212,0.3)]',
          badgeBg: 'bg-cyan-950/80 text-cyan-400 border border-cyan-800',
          titleColor: 'text-cyan-300',
          iconColor: 'text-cyan-400',
          barColor: 'bg-cyan-500',
          Icon: Radio,
          glow: '',
        };
    }
  };

  const style = getTypeStyles(toast.type);
  const IconComponent = style.Icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, x: 20, transition: { duration: 0.2 } }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      id={`toast-${toast.id}`}
      className={`pointer-events-auto relative overflow-hidden rounded-md border ${style.border} ${style.bg} ${style.shadow} p-3.5 backdrop-blur-md transition-all font-mono select-none`}
    >
      {/* Top Bar: Icon, Badge, Timestamp, Dismiss */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <IconComponent className={`w-4 h-4 shrink-0 ${style.iconColor} ${style.glow}`} />
          <span className={`text-[10px] tracking-wider uppercase px-1.5 py-0.5 rounded font-bold ${style.badgeBg}`}>
            {toast.type.toUpperCase()}
          </span>
          <span className="text-[10px] text-zinc-500 truncate">{toast.timestamp}</span>
        </div>

        <button
          onClick={() => onDismiss(toast.id)}
          id={`toast-dismiss-${toast.id}`}
          className="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5 rounded hover:bg-zinc-800/60"
          aria-label="Dismiss toast notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Title */}
      <div className={`text-xs font-bold tracking-wide uppercase ${style.titleColor} mb-1 flex items-center gap-1.5`}>
        <span>{toast.title}</span>
      </div>

      {/* Message */}
      <p className="text-xs text-zinc-300 leading-relaxed break-words">{toast.message}</p>

      {/* Stat Delta Badges */}
      {toast.deltas && Object.keys(toast.deltas).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2 border-t border-zinc-800/80">
          {toast.deltas.deltaP !== undefined && toast.deltas.deltaP !== 0 && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                toast.deltas.deltaP > 0
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                  : 'bg-red-950/60 text-red-400 border border-red-800/60'
              }`}
            >
              PWR {toast.deltas.deltaP > 0 ? `+${toast.deltas.deltaP}` : toast.deltas.deltaP}
            </span>
          )}
          {toast.deltas.deltaH !== undefined && toast.deltas.deltaH !== 0 && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                toast.deltas.deltaH < 0
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                  : 'bg-amber-950/60 text-amber-400 border border-amber-800/60'
              }`}
            >
              HEAT {toast.deltas.deltaH > 0 ? `+${toast.deltas.deltaH}` : toast.deltas.deltaH}
            </span>
          )}
          {toast.deltas.deltaT !== undefined && toast.deltas.deltaT !== 0 && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                toast.deltas.deltaT > 0
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                  : 'bg-red-950/60 text-red-400 border border-red-800/60'
              }`}
            >
              THRU {toast.deltas.deltaT > 0 ? `+${toast.deltas.deltaT}` : toast.deltas.deltaT}
            </span>
          )}
          {toast.deltas.deltaC !== undefined && toast.deltas.deltaC !== 0 && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                toast.deltas.deltaC > 0
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                  : 'bg-red-950/60 text-red-400 border border-red-800/60'
              }`}
            >
              CR {toast.deltas.deltaC > 0 ? `+${toast.deltas.deltaC}` : toast.deltas.deltaC}
            </span>
          )}
          {toast.deltas.deltaHp !== undefined && toast.deltas.deltaHp !== 0 && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                toast.deltas.deltaHp > 0
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                  : 'bg-red-950/60 text-red-400 border border-red-800/60'
              }`}
            >
              HEALTH {toast.deltas.deltaHp > 0 ? `+${toast.deltas.deltaHp}` : toast.deltas.deltaHp}
            </span>
          )}
        </div>
      )}

      {/* Action / Jump to tab button */}
      {toast.actionTab !== undefined && (
        <div className="mt-2.5 pt-2 border-t border-zinc-800/80 flex justify-end">
          <button
            onClick={() => {
              if (toast.actionTab !== undefined) {
                onNavigateTab(toast.actionTab);
                onDismiss(toast.id);
              }
            }}
            id={`toast-action-${toast.id}`}
            className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-zinc-300 hover:text-emerald-400 bg-zinc-900/80 hover:bg-zinc-800 px-2 py-1 rounded border border-zinc-700 transition-colors"
          >
            <span>{toast.actionLabel || 'VIEW DETAILS'}</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Progress countdown indicator */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-800/60 overflow-hidden">
        <div
          className={`h-full ${style.barColor} transition-all ease-linear`}
          style={{ width: `${progress}%`, transitionDuration: '50ms' }}
        />
      </div>
    </motion.div>
  );
};

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onDismiss,
  onClearAll,
  onNavigateTab,
}) => {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      id="toast-container"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm sm:max-w-md w-full pointer-events-none p-2 sm:p-0"
    >
      {toasts.length > 1 && (
        <div className="flex justify-end pointer-events-auto mb-1">
          <button
            onClick={onClearAll}
            id="toast-clear-all-btn"
            className="flex items-center gap-1 text-[10px] font-mono uppercase bg-zinc-900/90 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700 px-2 py-1 rounded shadow backdrop-blur transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span>DISMISS ALL ({toasts.length})</span>
          </button>
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={onDismiss}
            onNavigateTab={onNavigateTab}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};
