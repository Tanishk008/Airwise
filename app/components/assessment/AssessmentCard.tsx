"use client";

import { Assessment } from "@/lib/api";
import { statusConfig, fmtDate, pollutantLabel, clsx } from "@/lib/utils";
import { Card, Badge, Button, DataProvenance, Disclaimer } from "@/components/ui/Card";
import { motion, AnimatePresence } from "framer-motion";
import { Info, ChevronDown, ChevronUp, ShieldAlert, ArrowRight, UserCheck } from "lucide-react";
import { useState } from "react";

interface AssessmentCardProps {
  assessment: Assessment;
  onCreatePlan?: (id: string) => void;
  creatingPlan?: boolean;
  compact?: boolean;
}

export default function AssessmentCard({ assessment, onCreatePlan, creatingPlan, compact }: AssessmentCardProps) {
  const config = statusConfig[assessment.status];
  const [showEvidence, setShowEvidence] = useState(!compact);

  return (
    <div className={clsx("rounded-xl border p-4 md:p-5 transition-all bg-[#0f1a2e]", config.bg)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className={clsx("text-lg font-bold", config.color)}>{config.icon}</span>
            <span className={clsx("text-base font-bold", config.color)}>{config.label}</span>
            <span className="text-xs text-[#64748b] mono">({assessment.assessmentId})</span>
          </div>
          <p className="text-xs text-[#94a3b8]">
            Activity: <strong className="text-[#f1f5f9]">{assessment.activity.replace(/_/g, " ")}</strong> · Evaluated {fmtDate(assessment.createdAt)}
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-1">
          <DataProvenance
            mode={assessment.dataMode}
            provider={assessment.sourceName}
          />
          <span className="text-[10px] text-[#64748b] mono">{assessment.guidelineVersion}</span>
        </div>
      </div>

      {/* Reasons breakdown */}
      {assessment.reasons.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-[11px] text-[#94a3b8] uppercase tracking-wider font-semibold">
            Deterministic Decision Provenance
          </p>
          {assessment.reasons.map((r, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-start gap-2.5 bg-[#0b1322] border border-[#1e2f4d] rounded-lg p-3"
            >
              <Info size={14} className="text-[#14b8a6] mt-0.5 shrink-0" />
              <div className="flex-1">
                <span className="text-[10px] text-[#14b8a6] font-bold mono block mb-0.5">{r.code}</span>
                <span className="text-xs text-[#cbd5e1] leading-relaxed">{r.message}</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Evidence section */}
      {Object.keys(assessment.evidence).length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowEvidence(!showEvidence)}
            className="flex items-center gap-2 text-xs font-semibold text-[#94a3b8] hover:text-[#f1f5f9] transition-colors mb-2 cursor-pointer"
          >
            <span className="uppercase tracking-wider">Underlying Numerical Evidence</span>
            {showEvidence ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <AnimatePresence>
            {showEvidence && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                  {Object.entries(assessment.evidence).map(([key, ev]) => (
                    <div key={key} className="bg-[#0b1322] border border-[#1e2f4d] rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-[#f1f5f9]">{pollutantLabel(key)}</span>
                        <span className="text-[10px] text-[#64748b] mono">{ev.hours} valid sample hours</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-1.5 rounded bg-[#0f1a2e] border border-[#1e2f4d]/50">
                          <span className="text-[10px] text-[#94a3b8] block">24h Mean</span>
                          <span className="text-sm font-bold mono text-[#f1f5f9]">{ev.mean24h} {ev.unit}</span>
                        </div>
                        <div className="p-1.5 rounded bg-[#0f1a2e] border border-[#1e2f4d]/50">
                          <span className="text-[10px] text-[#94a3b8] block">Peak 24h</span>
                          <span className="text-sm font-bold mono text-[#f1f5f9]">{ev.max} {ev.unit}</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-[#64748b] mt-2 truncate">{ev.provider}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Recommended actions */}
      {assessment.recommendedActions.length > 0 && !compact && (
        <div className="mb-4">
          <p className="text-[11px] text-[#94a3b8] uppercase tracking-wider font-semibold mb-2">
            Protocol Mitigation Tasks
          </p>
          <div className="space-y-1.5">
            {assessment.recommendedActions.map((a, i) => (
              <div
                key={i}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#0b1322] border border-[#1e2f4d] rounded-lg p-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#14b8a6]" />
                  <span className="text-xs font-medium text-[#cbd5e1]">{a.label}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  <div className="flex items-center gap-1 text-[11px] text-[#94a3b8]">
                    <UserCheck size={12} className="text-[#14b8a6]" />
                    <span>{a.owner}</span>
                  </div>
                  {a.requiresApproval && <Badge variant="amber">Requires Approval</Badge>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action button */}
      {onCreatePlan && assessment.recommendedActions.length > 0 && (
        <div className="pt-2 border-t border-[#1e2f4d]/60 flex items-center justify-between">
          <Button
            onClick={() => onCreatePlan(assessment.assessmentId)}
            loading={creatingPlan}
            variant="teal"
            size="sm"
            icon={<ShieldAlert size={14} />}
          >
            Create Draft Response Plan
          </Button>
          <span className="text-[10px] text-[#64748b]">Requires administrator sign-off before task execution</span>
        </div>
      )}
    </div>
  );
}

