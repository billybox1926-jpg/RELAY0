import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, TabId, OfflineResumeResult, ToastNotification, ToastType, TelemetryPoint } from './types';
import {
  DEFAULT_STATE,
  loadGameFromStorage,
  saveGameToStorage,
  runIncomeTick,
  runEventTick,
  calculateUpgradeCost,
  formatTimestamp,
  clamp,
} from './game/engine';
import { MAX_RULES, MAX_NODES, MAX_LOGS, UPGRADE_CATALOG } from './game/constants';
import { sound } from './game/audio';
import { evaluateDailySignalProgress, generateDailySignal } from './game/dailySignal';
import { Header } from './components/Header';
import { TabBar } from './components/TabBar';
import { MonitorTab } from './components/MonitorTab';
import { AutomationTab } from './components/AutomationTab';
import { NodesTab } from './components/NodesTab';
import { UpgradesTab } from './components/UpgradesTab';
import { LogsTab } from './components/LogsTab';
import { FooterHUD } from './components/FooterHUD';
import { OfflineResumeModal } from './components/OfflineResumeModal';
import { CRTOverlay } from './components/CRTOverlay';
import { ToastContainer } from './components/ToastContainer';
import { MatrixRainBackground } from './components/MatrixRainBackground';

export const App: React.FC = () => {
  const [state, setState] = useState<GameState>(() => {
    const loaded = loadGameFromStorage();
    return loaded.state;
  });

  const [offlineResult, setOfflineResult] = useState<OfflineResumeResult | null>(() => {
    const loaded = loadGameFromStorage();
    return loaded.offlineResult;
  });

  const [activeTab, setActiveTab] = useState<TabId>(0);
  const [crtEnabled, setCrtEnabled] = useState<boolean>(true);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => sound.enabled);
  const [saveFlash, setSaveFlash] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryPoint[]>(() => {
    const loaded = loadGameFromStorage();
    const initP = loaded.state.power;
    const initT = loaded.state.throughput;
    const initH = loaded.state.heat;
    const initEff = initT / Math.max(1, initP);
    const now = Date.now();
    return Array.from({ length: 15 }, (_, i) => ({
      time: now - (15 - i) * 2000,
      label: `-${(15 - i) * 2}s`,
      throughput: initT,
      power: initP,
      heat: initH,
      efficiency: initEff,
    }));
  });

  const [nextIncomeIn, setNextIncomeIn] = useState<number>(15);
  const [nextEventIn, setNextEventIn] = useState<number>(30);

  // Idle Screensaver State (triggers after 30s of inactivity on Monitor Tab)
  const [isIdleOnMonitor, setIsIdleOnMonitor] = useState<boolean>(false);
  const [idleSeconds, setIdleSeconds] = useState<number>(0);
  const lastActivityTimeRef = useRef<number>(Date.now());

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const unsub = sound.subscribe((cfg) => {
      setAudioEnabled(cfg.masterEnabled);
    });
    return unsub;
  }, []);

  const titleIntervalRef = useRef<number | null>(null);
  const lastWarningRef = useRef<{ power: number; heat: number; health: number }>({
    power: 0,
    heat: 0,
    health: 0,
  });

  // Background tab title alerting
  const flashBackgroundTabTitle = useCallback((alertText: string, isCritical: boolean) => {
    if (typeof document === 'undefined') return;
    if (titleIntervalRef.current) {
      clearInterval(titleIntervalRef.current);
    }
    let flag = true;
    const baseTitle = 'RELAY-0 // NETWORK TERMINAL';
    const alertPrefix = isCritical ? '🚨 [CRITICAL ALERT]' : '⚠️ [EVENT ALERT]';
    document.title = `${alertPrefix} ${alertText}`;

    titleIntervalRef.current = window.setInterval(() => {
      document.title = flag ? `${alertPrefix} ${alertText}` : baseTitle;
      flag = !flag;
    }, 1000);
  }, []);

  // Toast Notification Dispatcher
  const addToast = useCallback(
    (toast: Omit<ToastNotification, 'id' | 'timestamp'> & { id?: string; timestamp?: string }) => {
      const id = toast.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const timestamp = toast.timestamp || formatTimestamp();
      const newToast: ToastNotification = {
        ...toast,
        id,
        timestamp,
        duration: toast.duration || 6000,
      };

      setToasts((prev) => [newToast, ...prev.slice(0, 4)]);

      // Audio feedback by severity
      if (toast.type === 'critical') {
        sound.playCriticalAlarm();
      } else if (toast.type === 'warning') {
        sound.playAlert();
      } else if (toast.type === 'success') {
        sound.playSuccess();
      } else {
        sound.playInfoChirp();
      }

      // Check if document is currently unfocused / in background tab
      if (typeof document !== 'undefined' && document.hidden) {
        flashBackgroundTabTitle(toast.title, toast.type === 'critical');
      }
    },
    [flashBackgroundTabTitle]
  );

  const handleDismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleClearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  // Restore normal document title when user refocuses tab
  useEffect(() => {
    const handleFocusOrVisibility = () => {
      if (!document.hidden) {
        if (titleIntervalRef.current) {
          clearInterval(titleIntervalRef.current);
          titleIntervalRef.current = null;
        }
        document.title = 'RELAY-0 // NETWORK TERMINAL';
      }
    };

    document.addEventListener('visibilitychange', handleFocusOrVisibility);
    window.addEventListener('focus', handleFocusOrVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
      window.removeEventListener('focus', handleFocusOrVisibility);
      if (titleIntervalRef.current) clearInterval(titleIntervalRef.current);
    };
  }, []);

  // Auto-save debounce effect
  useEffect(() => {
    const interval = setInterval(() => {
      saveGameToStorage(stateRef.current);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Save on tab close / reload
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveGameToStorage(stateRef.current);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Idle Activity Tracking for Matrix Rain Screensaver (30s on Monitor Tab)
  useEffect(() => {
    const handleActivity = () => {
      lastActivityTimeRef.current = Date.now();
      setIsIdleOnMonitor((prev) => {
        if (prev) {
          sound.playKeyClick();
        }
        return false;
      });
      setIdleSeconds(0);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];
    events.forEach((evt) => {
      window.addEventListener(evt, handleActivity, { passive: true });
    });

    const interval = setInterval(() => {
      if (activeTab === 0) {
        const elapsedSec = Math.floor((Date.now() - lastActivityTimeRef.current) / 1000);
        setIdleSeconds(elapsedSec);
        if (elapsedSec >= 30) {
          setIsIdleOnMonitor(true);
        }
      } else {
        setIsIdleOnMonitor(false);
        lastActivityTimeRef.current = Date.now();
        setIdleSeconds(0);
      }
    }, 1000);

    return () => {
      events.forEach((evt) => {
        window.removeEventListener(evt, handleActivity);
      });
      clearInterval(interval);
    };
  }, [activeTab]);

  const handleTriggerMatrixRain = useCallback(() => {
    setIsIdleOnMonitor(true);
    sound.playInfoChirp();
  }, []);

  // Event Tick Processing with Toast alerts
  const processEventTick = useCallback(
    (isManual: boolean = false) => {
      let eventResult: ReturnType<typeof runEventTick> | null = null;

      setState((curr) => {
        eventResult = runEventTick(curr);
        return eventResult.state;
      });

      if (!eventResult) return;
      const res = eventResult as NonNullable<typeof eventResult>;

      if (res.eventFired) {
        const event = res.eventFired;
        const deltas = res.effectiveDeltas || {
          deltaP: event.deltaP,
          deltaH: event.deltaH,
          deltaT: event.deltaT,
          deltaC: event.deltaC,
          deltaHp: event.deltaHp,
        };

        // Determine severity & styling
        let type: ToastType = 'info';
        if (
          deltas.deltaHp < 0 ||
          deltas.deltaH >= 10 ||
          event.name.includes('INTRUSION') ||
          event.name.includes('SOLAR') ||
          event.name.includes('CORRUPTION')
        ) {
          type = 'critical';
        } else if (deltas.deltaP < 0 || deltas.deltaH > 0 || event.name.includes('THERMAL')) {
          type = 'warning';
        } else if (
          deltas.deltaC > 0 ||
          deltas.deltaHp > 0 ||
          deltas.deltaP > 10 ||
          deltas.deltaH < -10 ||
          event.name.includes('CONTRACT') ||
          event.name.includes('EFFICIENCY') ||
          event.name.includes('FIRMWARE') ||
          event.name.includes('COOLING')
        ) {
          type = 'success';
        }

        // Clean prefix markers like !! or ** for cleaner toast message
        const cleanMsg = event.msg.replace(/^[!*~+>$]{2}\s*/, '');

        addToast({
          title: `EVENT: ${event.name}`,
          message: cleanMsg,
          type,
          deltas,
          actionTab: 4,
          actionLabel: 'VIEW IN LOGS',
        });
      } else if (res.rulesFired > 0) {
        addToast({
          title: 'AUTOMATION TRIGGERED',
          message: `Event cycle executed ${res.rulesFired} automated IF/THEN rule(s) to stabilize system parameters.`,
          type: 'info',
          actionTab: 1,
          actionLabel: 'VIEW AUTOMATION',
        });
      } else if (isManual) {
        addToast({
          title: 'EVENT CYCLE COMPLETED',
          message: 'Subnet scan complete. No anomalous events detected. All sectors reporting nominal telemetry.',
          type: 'info',
          actionTab: 0,
          actionLabel: 'VIEW MONITOR',
        });
      }
    },
    [addToast]
  );

  // Critical Status Watchdog
  useEffect(() => {
    const now = Date.now();
    if (state.networkHealth <= 25 && now - lastWarningRef.current.health > 25000) {
      lastWarningRef.current.health = now;
      addToast({
        title: 'CRITICAL: NETWORK INTEGRITY COMPROMISED',
        message: `Network integrity has plummeted to ${state.networkHealth}%. Restore health or purchase hardening immediately!`,
        type: 'critical',
        actionTab: 2,
        actionLabel: 'RESTORE HEALTH',
      });
    } else if (state.heat >= 85 && now - lastWarningRef.current.heat > 25000) {
      lastWarningRef.current.heat = now;
      addToast({
        title: 'CRITICAL: THERMAL RUNAWAY IMMINENT',
        message: `Core temperature is at ${state.heat}°C. Overheat damage threshold reached. Execute thermal repair!`,
        type: 'critical',
        actionTab: 2,
        actionLabel: 'PERFORM REPAIR',
      });
    } else if (state.power <= 12 && now - lastWarningRef.current.power > 25000) {
      lastWarningRef.current.power = now;
      addToast({
        title: 'WARNING: GRID POWER DEPLETION',
        message: `Relay power at ${state.power}%. System throughput will suffer starvation penalties.`,
        type: 'warning',
        actionTab: 3,
        actionLabel: 'BUY BATTERY',
      });
    }
  }, [state.power, state.heat, state.networkHealth, addToast]);

  // Income Timer (15s), Event Timer (30s), and Telemetry Sampling (every 1s)
  useEffect(() => {
    const interval = setInterval(() => {
      // Sample telemetry point for System Efficiency sparkline
      const curr = stateRef.current;
      const now = Date.now();
      const eff = curr.throughput / Math.max(1, curr.power);
      const timeStr = new Date(now).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      setTelemetryHistory((prev) => {
        const newPoint: TelemetryPoint = {
          time: now,
          label: timeStr,
          throughput: curr.throughput,
          power: curr.power,
          heat: curr.heat,
          efficiency: eff,
        };
        return [...prev.slice(Math.max(0, prev.length - 24)), newPoint];
      });

      setNextIncomeIn((prev) => {
        if (prev <= 1) {
          // Trigger Income Tick
          setState((curr) => {
            const res = runIncomeTick(curr);
            const evaluated = evaluateDailySignalProgress(res.state, {
              type: 'income_tick',
              creditsEarned: res.earned,
            });
            if (!curr.dailySignal?.completed && evaluated.state.dailySignal?.completed) {
              sound.playSuccess();
              const sig = evaluated.state.dailySignal;
              addToast({
                title: 'MISSION COMPLETE: DAILY SIGNAL DECODED!',
                message: `Carrier ${sig.callsign} locked! +${sig.creditBonus} CR awarded & ${sig.rewardMultiplier}x Credit Multiplier active for ${(sig.rewardDurationSeconds / 3600).toFixed(0)} hours!`,
                type: 'success',
                duration: 8000,
                actionLabel: 'VIEW STATUS',
                onAction: () => setActiveTab(0),
              });
            }
            return evaluated.state;
          });
          return 15;
        }
        return prev - 1;
      });

      setNextEventIn((prev) => {
        if (prev <= 1) {
          // Trigger Event Tick with toast alerts
          processEventTick(false);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [processEventTick]);

  // Manual Trigger Handlers
  const handleManualIncomeTick = useCallback(() => {
    sound.playSuccess();
    setState((curr) => {
      const res = runIncomeTick(curr);
      const evaluated = evaluateDailySignalProgress(res.state, {
        type: 'income_tick',
        creditsEarned: res.earned,
      });
      if (!curr.dailySignal?.completed && evaluated.state.dailySignal?.completed) {
        sound.playSuccess();
        const sig = evaluated.state.dailySignal;
        addToast({
          title: 'MISSION COMPLETE: DAILY SIGNAL DECODED!',
          message: `Carrier ${sig.callsign} locked! +${sig.creditBonus} CR awarded & ${sig.rewardMultiplier}x Credit Multiplier active for ${(sig.rewardDurationSeconds / 3600).toFixed(0)} hours!`,
          type: 'success',
          duration: 8000,
          actionLabel: 'VIEW STATUS',
          onAction: () => setActiveTab(0),
        });
      }
      return evaluated.state;
    });
    setNextIncomeIn(15);
  }, []);

  const handleManualEventTick = useCallback(() => {
    processEventTick(true);
    setNextEventIn(30);
  }, [processEventTick]);

  // Daily Signal Retune Handler
  const handleRetuneDailySignal = useCallback(() => {
    const newSignal = generateDailySignal();
    const log = `${formatTimestamp()}: Frequency retuned. Intercepted new carrier [${newSignal.callsign}] at ${newSignal.frequency}.`;
    setState((curr) => ({
      ...curr,
      dailySignal: newSignal,
      logEntries: [log, ...curr.logEntries].slice(0, MAX_LOGS),
    }));
    addToast({
      title: 'FREQUENCY RETUNED',
      message: `Carrier ${newSignal.callsign} [${newSignal.frequency}] intercepted: ${newSignal.title}`,
      type: 'info',
      duration: 5000,
    });
  }, []);

  // Keyboard navigation & Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'ArrowRight') {
        sound.playKeypress();
        setActiveTab((prev) => ((prev + 1) % 5) as TabId);
      } else if (e.key === 'ArrowLeft') {
        sound.playKeypress();
        setActiveTab((prev) => ((prev + 4) % 5) as TabId);
      } else if (e.key === '1') {
        sound.playKeypress();
        setActiveTab(0);
      } else if (e.key === '2') {
        sound.playKeypress();
        setActiveTab(1);
      } else if (e.key === '3') {
        sound.playKeypress();
        setActiveTab(2);
      } else if (e.key === '4') {
        sound.playKeypress();
        setActiveTab(3);
      } else if (e.key === '5') {
        sound.playKeypress();
        setActiveTab(4);
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        handleManualIncomeTick();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleManualIncomeTick]);

  // Audio Toggle
  const handleToggleAudio = () => {
    const next = !audioEnabled;
    setAudioEnabled(next);
    sound.enabled = next;
  };

  // Manual Save
  const handleManualSave = () => {
    saveGameToStorage(stateRef.current);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1500);
    addToast({
      title: 'TELEMETRY SAVED',
      message: 'Station state successfully persisted to local non-volatile storage.',
      type: 'info',
      duration: 3000,
    });
  };

  // Factory Reset
  const handleResetGame = () => {
    if (window.confirm('Reset all relay station progress to factory defaults?')) {
      const resetLog = `${formatTimestamp()}: Terminal factory reset. Station restored to defaults.`;
      const freshState: GameState = {
        ...DEFAULT_STATE,
        logEntries: [resetLog],
        lastSaveTime: Math.floor(Date.now() / 1000),
      };
      setState(freshState);
      saveGameToStorage(freshState);
      setActiveTab(0);
      setNextIncomeIn(15);
      setNextEventIn(30);
      addToast({
        title: 'TERMINAL RESTORED',
        message: 'Factory initialization complete. All sectors restored to baseline parameters.',
        type: 'warning',
        duration: 4000,
      });
    }
  };

  // Automation Rule handlers
  const handleAddRule = (condition: string, action: string) => {
    setState((curr) => {
      if (curr.rules.length >= MAX_RULES) return curr;
      const newRules = [...curr.rules, { condition, action }];
      const log = `${formatTimestamp()}: Added automation rule: IF ${condition} THEN ${action}`;
      const evaluated = evaluateDailySignalProgress(
        {
          ...curr,
          rules: newRules,
          logEntries: [log, ...curr.logEntries].slice(0, MAX_LOGS),
        },
        { type: 'rule_change' }
      );
      if (!curr.dailySignal?.completed && evaluated.state.dailySignal?.completed) {
        sound.playSuccess();
        const sig = evaluated.state.dailySignal;
        addToast({
          title: 'MISSION COMPLETE: DAILY SIGNAL DECODED!',
          message: `Carrier ${sig.callsign} locked! +${sig.creditBonus} CR awarded & ${sig.rewardMultiplier}x Credit Multiplier active for ${(sig.rewardDurationSeconds / 3600).toFixed(0)} hours!`,
          type: 'success',
          duration: 8000,
          actionLabel: 'VIEW STATUS',
          onAction: () => setActiveTab(0),
        });
      }
      return evaluated.state;
    });
  };

  const handleDeleteRule = (index: number) => {
    setState((curr) => {
      const deleted = curr.rules[index];
      const newRules = curr.rules.filter((_, i) => i !== index);
      const log = deleted
        ? `${formatTimestamp()}: Deleted automation rule: IF ${deleted.condition} THEN ${deleted.action}`
        : `${formatTimestamp()}: Deleted automation rule #${index}`;
      return {
        ...curr,
        rules: newRules,
        logEntries: [log, ...curr.logEntries].slice(0, MAX_LOGS),
      };
    });
  };

  // Node Actions
  const handleOverclock = (): { success: boolean; message: string } => {
    if (state.credits < 30) {
      return { success: false, message: 'Insufficient credits! Requires 30 CR.' };
    }
    setState((curr) => {
      const log = `${formatTimestamp()}: Node overclocked. Throughput +10, Heat +15.`;
      const evaluated = evaluateDailySignalProgress(
        {
          ...curr,
          credits: curr.credits - 30,
          throughput: clamp(curr.throughput + 10, 0, 100),
          heat: clamp(curr.heat + 15, 0, 100),
          logEntries: [log, ...curr.logEntries].slice(0, MAX_LOGS),
        },
        { type: 'node_action', actionKey: 'overclock' }
      );
      if (!curr.dailySignal?.completed && evaluated.state.dailySignal?.completed) {
        sound.playSuccess();
        const sig = evaluated.state.dailySignal;
        addToast({
          title: 'MISSION COMPLETE: DAILY SIGNAL DECODED!',
          message: `Carrier ${sig.callsign} locked! +${sig.creditBonus} CR awarded & ${sig.rewardMultiplier}x Credit Multiplier active for ${(sig.rewardDurationSeconds / 3600).toFixed(0)} hours!`,
          type: 'success',
          duration: 8000,
          actionLabel: 'VIEW STATUS',
          onAction: () => setActiveTab(0),
        });
      }
      return evaluated.state;
    });
    return { success: true, message: 'Node Overclock executed! (+10 Throughput, +15 Heat)' };
  };

  const handleRepair = (): { success: boolean; message: string } => {
    if (state.credits < 20) {
      return { success: false, message: 'Insufficient credits! Requires 20 CR.' };
    }
    setState((curr) => {
      const log = `${formatTimestamp()}: Thermal repair completed. Heat normalized to 30.`;
      const evaluated = evaluateDailySignalProgress(
        {
          ...curr,
          credits: curr.credits - 20,
          heat: 30,
          logEntries: [log, ...curr.logEntries].slice(0, MAX_LOGS),
        },
        { type: 'node_action', actionKey: 'repair' }
      );
      if (!curr.dailySignal?.completed && evaluated.state.dailySignal?.completed) {
        sound.playSuccess();
        const sig = evaluated.state.dailySignal;
        addToast({
          title: 'MISSION COMPLETE: DAILY SIGNAL DECODED!',
          message: `Carrier ${sig.callsign} locked! +${sig.creditBonus} CR awarded & ${sig.rewardMultiplier}x Credit Multiplier active for ${(sig.rewardDurationSeconds / 3600).toFixed(0)} hours!`,
          type: 'success',
          duration: 8000,
          actionLabel: 'VIEW STATUS',
          onAction: () => setActiveTab(0),
        });
      }
      return evaluated.state;
    });
    return { success: true, message: 'Thermal repair completed. Heat reset to 30.' };
  };

  const handleExpandNode = (): { success: boolean; message: string } => {
    if (state.nodesUnlocked >= MAX_NODES) {
      return { success: false, message: 'Maximum network capacity reached (5 nodes).' };
    }
    if (state.credits < 500) {
      return { success: false, message: 'Insufficient credits! Requires 500 CR.' };
    }
    setState((curr) => {
      const nextNode = curr.nodesUnlocked + 1;
      const log = `${formatTimestamp()}: Expansion complete. Node ${curr.nodesUnlocked} activated. Total nodes: ${nextNode}.`;
      const evaluated = evaluateDailySignalProgress(
        {
          ...curr,
          credits: curr.credits - 500,
          nodesUnlocked: nextNode,
          logEntries: [log, ...curr.logEntries].slice(0, MAX_LOGS),
        },
        { type: 'node_action', actionKey: 'expand' }
      );
      if (!curr.dailySignal?.completed && evaluated.state.dailySignal?.completed) {
        sound.playSuccess();
        const sig = evaluated.state.dailySignal;
        addToast({
          title: 'MISSION COMPLETE: DAILY SIGNAL DECODED!',
          message: `Carrier ${sig.callsign} locked! +${sig.creditBonus} CR awarded & ${sig.rewardMultiplier}x Credit Multiplier active for ${(sig.rewardDurationSeconds / 3600).toFixed(0)} hours!`,
          type: 'success',
          duration: 8000,
          actionLabel: 'VIEW STATUS',
          onAction: () => setActiveTab(0),
        });
      }
      return evaluated.state;
    });
    return { success: true, message: `Node Expansion successful! Unlocked Node ${state.nodesUnlocked}.` };
  };

  const handleUpgradeNodeLevel = (): { success: boolean; message: string } => {
    if (state.credits < 200) {
      return { success: false, message: 'Insufficient credits! Requires 200 CR.' };
    }
    setState((curr) => {
      const nextLvl = curr.upgradeLevel + 1;
      const log = `${formatTimestamp()}: System upgrade installed. Level ${nextLvl} active (+25% income multiplier).`;
      const evaluated = evaluateDailySignalProgress(
        {
          ...curr,
          credits: curr.credits - 200,
          upgradeLevel: nextLvl,
          logEntries: [log, ...curr.logEntries].slice(0, MAX_LOGS),
        },
        { type: 'node_action', actionKey: 'upgrade_level' }
      );
      if (!curr.dailySignal?.completed && evaluated.state.dailySignal?.completed) {
        sound.playSuccess();
        const sig = evaluated.state.dailySignal;
        addToast({
          title: 'MISSION COMPLETE: DAILY SIGNAL DECODED!',
          message: `Carrier ${sig.callsign} locked! +${sig.creditBonus} CR awarded & ${sig.rewardMultiplier}x Credit Multiplier active for ${(sig.rewardDurationSeconds / 3600).toFixed(0)} hours!`,
          type: 'success',
          duration: 8000,
          actionLabel: 'VIEW STATUS',
          onAction: () => setActiveTab(0),
        });
      }
      return evaluated.state;
    });
    return { success: true, message: `Upgraded to Level ${state.upgradeLevel + 1}! (+25% Income Yield)` };
  };

  const handleRestoreHealth = (): { success: boolean; message: string } => {
    if (state.credits < 150) {
      return { success: false, message: 'Insufficient credits! Requires 150 CR.' };
    }
    setState((curr) => {
      const log = `${formatTimestamp()}: Network integrity restored (+30% health).`;
      const evaluated = evaluateDailySignalProgress(
        {
          ...curr,
          credits: curr.credits - 150,
          networkHealth: clamp(curr.networkHealth + 30, 0, 100),
          logEntries: [log, ...curr.logEntries].slice(0, MAX_LOGS),
        },
        { type: 'node_action', actionKey: 'restore_health' }
      );
      if (!curr.dailySignal?.completed && evaluated.state.dailySignal?.completed) {
        sound.playSuccess();
        const sig = evaluated.state.dailySignal;
        addToast({
          title: 'MISSION COMPLETE: DAILY SIGNAL DECODED!',
          message: `Carrier ${sig.callsign} locked! +${sig.creditBonus} CR awarded & ${sig.rewardMultiplier}x Credit Multiplier active for ${(sig.rewardDurationSeconds / 3600).toFixed(0)} hours!`,
          type: 'success',
          duration: 8000,
          actionLabel: 'VIEW STATUS',
          onAction: () => setActiveTab(0),
        });
      }
      return evaluated.state;
    });
    return { success: true, message: 'Network Health restored +30%!' };
  };

  // Upgrades Purchase
  const handlePurchaseUpgrade = (key: string): { success: boolean; message: string } => {
    const item = UPGRADE_CATALOG.find((u) => u.key === key);
    if (!item) return { success: false, message: 'Unknown upgrade key.' };

    const currentCount = key === 'income' ? state.upgradeLevel : (state.upgradeCounts && state.upgradeCounts[key]) || 0;
    if (currentCount >= item.maxLevel) {
      return { success: false, message: `${item.name} is already at maximum level.` };
    }

    const cost = calculateUpgradeCost(key, currentCount);
    if (state.credits < cost) {
      return { success: false, message: `Insufficient credits! Requires ${cost} CR.` };
    }

    setState((curr) => {
      const nextCredits = curr.credits - cost;
      const nextCounts = { ...(curr.upgradeCounts || {}) };
      let nextLvl = curr.upgradeLevel;
      let nextPower = curr.power;
      let nextThroughput = curr.throughput;
      let nextHealth = curr.networkHealth;

      if (key === 'income') {
        nextLvl += 1;
      } else {
        nextCounts[key] = (nextCounts[key] || 0) + 1;
      }

      // Immediate item bonuses
      if (key === 'bandwidth') nextThroughput = clamp(nextThroughput + 8, 0, 100);
      if (key === 'armor') nextHealth = clamp(nextHealth + 25, 0, 100);
      if (key === 'battery') nextPower = clamp(nextPower + 40, 0, 100);

      const log = `${formatTimestamp()}: Purchased ${item.name} (Lvl ${currentCount + 1}) for ${cost} CR.`;

      const evaluated = evaluateDailySignalProgress(
        {
          ...curr,
          credits: nextCredits,
          upgradeCounts: nextCounts,
          upgradeLevel: nextLvl,
          power: nextPower,
          throughput: nextThroughput,
          networkHealth: nextHealth,
          logEntries: [log, ...curr.logEntries].slice(0, MAX_LOGS),
        },
        { type: 'purchase_upgrade', upgradeKey: key }
      );
      if (!curr.dailySignal?.completed && evaluated.state.dailySignal?.completed) {
        sound.playSuccess();
        const sig = evaluated.state.dailySignal;
        addToast({
          title: 'MISSION COMPLETE: DAILY SIGNAL DECODED!',
          message: `Carrier ${sig.callsign} locked! +${sig.creditBonus} CR awarded & ${sig.rewardMultiplier}x Credit Multiplier active for ${(sig.rewardDurationSeconds / 3600).toFixed(0)} hours!`,
          type: 'success',
          duration: 8000,
          actionLabel: 'VIEW STATUS',
          onAction: () => setActiveTab(0),
        });
      }
      return evaluated.state;
    });

    return { success: true, message: `Purchased ${item.name} Level ${currentCount + 1}!` };
  };

  // Clear Logs
  const handleClearLogs = () => {
    const initLog = `${formatTimestamp()}: Logs buffer purged. Telemetry clear.`;
    setState((curr) => ({
      ...curr,
      logEntries: [initLog],
    }));
  };

  return (
    <div className="relative min-h-screen bg-[#070b07] text-[#88ff88] flex flex-col justify-between selection:bg-[#00ff41] selection:text-black">
      {/* Matrix Scrolling Character Screensaver Overlay (activates when idle > 30s on Monitor tab) */}
      <MatrixRainBackground active={isIdleOnMonitor} />

      {/* CRT Scanline & Vignette Effect */}
      <CRTOverlay enabled={crtEnabled} />

      {/* Floating Terminal Toast Notifications */}
      <ToastContainer
        toasts={toasts}
        onDismiss={handleDismissToast}
        onClearAll={handleClearAllToasts}
        onNavigateTab={(tab) => setActiveTab(tab)}
      />

      {/* Main Terminal Shell */}
      <div className="flex-1 flex flex-col">
        {/* Header Bar */}
        <Header
          crtEnabled={crtEnabled}
          onToggleCrt={() => setCrtEnabled((prev) => !prev)}
          audioEnabled={audioEnabled}
          onToggleAudio={handleToggleAudio}
          onManualSave={handleManualSave}
          onResetGame={handleResetGame}
          saveFlash={saveFlash}
          dailySignal={state.dailySignal}
        />

        {/* Tab Navigation */}
        <TabBar
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab)}
          ruleCount={state.rules.length}
          logCount={state.logEntries.length}
        />

        {/* Main Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
          {activeTab === 0 && (
            <MonitorTab
              state={state}
              telemetry={telemetryHistory}
              onManualIncomeTick={handleManualIncomeTick}
              onManualEventTick={handleManualEventTick}
              onRetuneSignal={handleRetuneDailySignal}
              nextIncomeIn={nextIncomeIn}
              nextEventIn={nextEventIn}
              idleSeconds={idleSeconds}
              isIdleOnMonitor={isIdleOnMonitor}
              onTriggerMatrixRain={handleTriggerMatrixRain}
            />
          )}

          {activeTab === 1 && (
            <AutomationTab
              rules={state.rules}
              onAddRule={handleAddRule}
              onDeleteRule={handleDeleteRule}
            />
          )}

          {activeTab === 2 && (
            <NodesTab
              state={state}
              onOverclock={handleOverclock}
              onRepair={handleRepair}
              onExpand={handleExpandNode}
              onUpgradeNode={handleUpgradeNodeLevel}
              onRestoreHealth={handleRestoreHealth}
            />
          )}

          {activeTab === 3 && (
            <UpgradesTab
              state={state}
              onPurchaseUpgrade={handlePurchaseUpgrade}
            />
          )}

          {activeTab === 4 && (
            <LogsTab
              logs={state.logEntries}
              onClearLogs={handleClearLogs}
            />
          )}
        </main>
      </div>

      {/* Persistent Bottom HUD Ticker */}
      <FooterHUD state={state} />

      {/* Offline Resume Modal */}
      {offlineResult && (
        <OfflineResumeModal
          result={offlineResult}
          onClose={() => setOfflineResult(null)}
        />
      )}
    </div>
  );
};
