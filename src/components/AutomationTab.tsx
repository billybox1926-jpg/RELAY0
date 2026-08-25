import React, { useState } from 'react';
import { AutomationRule } from '../types';
import { CONDITION_OPTIONS, ACTION_OPTIONS, MAX_RULES } from '../game/constants';
import { sound } from '../game/audio';
import { Plus, Trash2, GitBranch, ArrowRight, X } from 'lucide-react';

interface AutomationTabProps {
  rules: AutomationRule[];
  onAddRule: (condition: string, action: string) => void;
  onDeleteRule: (index: number) => void;
}

export const AutomationTab: React.FC<AutomationTabProps> = ({
  rules,
  onAddRule,
  onDeleteRule,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCondition, setSelectedCondition] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [modalStep, setModalStep] = useState<1 | 2>(1);

  const handleOpenModal = () => {
    if (rules.length >= MAX_RULES) {
      sound.playAlert();
      return;
    }
    sound.playKeypress();
    setSelectedCondition(null);
    setSelectedAction(null);
    setModalStep(1);
    setIsModalOpen(true);
  };

  const handleSelectCondition = (condKey: string) => {
    sound.playKeypress();
    setSelectedCondition(condKey);
    setModalStep(2);
  };

  const handleSelectActionAndSubmit = (actKey: string) => {
    if (!selectedCondition) return;
    sound.playSuccess();
    onAddRule(selectedCondition, actKey);
    setIsModalOpen(false);
    setSelectedCondition(null);
    setSelectedAction(null);
    setModalStep(1);
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="terminal-box rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#00ff4120] pb-3">
          <div>
            <h2 className="text-sm font-bold tracking-wider text-[#00ff41] text-glow flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              IF-THEN AUTOMATION RULE ENGINE
            </h2>
            <p className="mt-1 text-xs text-[#88aa88]">
              Automated triggers evaluate every 30 seconds before random event generation.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-[#44aa44] font-mono">
              Capacity: <span className="text-white font-bold">{rules.length}</span> / {MAX_RULES}
            </span>

            <button
              id="add-rule-btn"
              onClick={handleOpenModal}
              disabled={rules.length >= MAX_RULES}
              className={`flex items-center gap-2 rounded px-3 py-1.5 text-xs font-bold transition-all ${
                rules.length >= MAX_RULES
                  ? 'border border-[#445544] bg-[#111] text-[#556655] cursor-not-allowed'
                  : 'border border-[#00ff41] bg-[#00ff4120] text-[#00ff41] hover:bg-[#00ff4135] shadow-[0_0_8px_#00ff4140]'
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>NEW RULE</span>
            </button>
          </div>
        </div>
      </div>

      {/* Rules List */}
      <div className="space-y-3">
        {rules.length === 0 ? (
          <div className="terminal-box rounded-lg p-8 text-center">
            <GitBranch className="mx-auto h-8 w-8 text-[#44aa4460]" />
            <p className="mt-3 text-sm text-[#88aa88]">No automation rules installed.</p>
            <p className="mt-1 text-xs text-[#557755]">
              Add automated logic to automatically boost power, shed heat, or earn emergency credits.
            </p>
            <button
              onClick={handleOpenModal}
              className="mt-4 inline-flex items-center gap-1.5 rounded border border-[#00ff4160] bg-[#00ff4115] px-3 py-1.5 text-xs font-bold text-[#00ff41] hover:bg-[#00ff4125]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>CREATE FIRST RULE</span>
            </button>
          </div>
        ) : (
          rules.map((rule, idx) => {
            const condObj = CONDITION_OPTIONS.find((c) => c.key === rule.condition);
            const actObj = ACTION_OPTIONS.find((a) => a.key === rule.action);

            return (
              <div
                key={idx}
                id={`rule-item-${idx}`}
                className="terminal-box group flex items-center justify-between rounded-lg p-3 sm:p-4 hover:border-[#00ff4180] transition-all"
              >
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm font-mono">
                  <span className="rounded bg-[#00ff4120] px-2 py-0.5 text-xs font-bold text-[#00ff41]">
                    #{idx}
                  </span>

                  <div className="rounded border border-[#ffaa2240] bg-[#ffaa2210] px-2.5 py-1 text-[#ffbb44] font-semibold">
                    IF {condObj ? condObj.label : rule.condition}
                  </div>

                  <ArrowRight className="h-4 w-4 text-[#44aa44]" />

                  <div className="rounded border border-[#00ff4140] bg-[#00ff4110] px-2.5 py-1 text-[#88ff88] font-semibold">
                    DO {actObj ? actObj.label : rule.action}
                  </div>
                </div>

                <button
                  id={`delete-rule-btn-${idx}`}
                  onClick={() => {
                    sound.playAlert();
                    onDeleteRule(idx);
                  }}
                  className="ml-2 flex items-center gap-1 rounded border border-[#ff444430] bg-[#1a0a0a] p-1.5 text-[#ff6666] hover:border-[#ff444480] hover:bg-[#ff444425] transition-all"
                  title="Delete this rule"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Interactive Modal for New Rule Flow */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="terminal-box-active w-full max-w-lg rounded-lg bg-[#0d1a0d] p-6 shadow-[0_0_30px_#00ff4130]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#00ff4140] pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[#00ff41] text-glow">
                <GitBranch className="h-4 w-4" />
                <span>NEW AUTOMATION RULE // STEP {modalStep} OF 2</span>
              </div>
              <button
                onClick={() => {
                  sound.playKeypress();
                  setIsModalOpen(false);
                }}
                className="text-[#668866] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="mt-4">
              {modalStep === 1 ? (
                <div>
                  <p className="text-xs text-[#88aa88] mb-3">
                    Select a <span className="text-[#ffbb44] font-bold">TRIGGER CONDITION</span>:
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {CONDITION_OPTIONS.map((cond) => (
                      <button
                        key={cond.key}
                        onClick={() => handleSelectCondition(cond.key)}
                        className="rounded border border-[#ffaa2240] bg-[#1c180e] p-3 text-left font-mono text-xs font-semibold text-[#ffcc66] hover:border-[#ffaa22] hover:bg-[#ffaa2225] transition-all"
                      >
                        {cond.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-3 rounded bg-[#ffaa2215] border border-[#ffaa2230] p-2 text-xs text-[#ffbb44]">
                    Trigger: <span className="font-bold">{selectedCondition}</span>
                  </div>
                  <p className="text-xs text-[#88aa88] mb-3">
                    Select an <span className="text-[#00ff41] font-bold">ACTION</span> to execute when true:
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {ACTION_OPTIONS.map((act) => (
                      <button
                        key={act.key}
                        onClick={() => handleSelectActionAndSubmit(act.key)}
                        className="rounded border border-[#00ff4140] bg-[#0e1c0e] p-3 text-left font-mono text-xs font-semibold text-[#88ff88] hover:border-[#00ff41] hover:bg-[#00ff4125] transition-all"
                      >
                        {act.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="mt-6 flex justify-end gap-2 border-t border-[#00ff4120] pt-3">
              {modalStep === 2 && (
                <button
                  onClick={() => {
                    sound.playKeypress();
                    setModalStep(1);
                  }}
                  className="rounded border border-[#556655] px-3 py-1.5 text-xs text-[#889988] hover:bg-[#223322]"
                >
                  Back
                </button>
              )}
              <button
                onClick={() => {
                  sound.playKeypress();
                  setIsModalOpen(false);
                }}
                className="rounded border border-[#556655] px-3 py-1.5 text-xs text-[#889988] hover:bg-[#223322]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
