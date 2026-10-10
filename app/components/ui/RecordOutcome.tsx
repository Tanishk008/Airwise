import { useState } from "react";
import { ActionPlan, OutcomeStatus } from "@/lib/api";
import { Button } from "./Card";
import { ClipboardCheck, X } from "lucide-react";
import { motion } from "framer-motion";

export function RecordOutcome({
  plan,
  onRecord,
  onCancel,
}: {
  plan: ActionPlan;
  onRecord: (outcomeStatus: OutcomeStatus, notes: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [outcome, setOutcome] = useState<OutcomeStatus>("improved");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onRecord(outcome, notes);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to record outcome");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md bg-[#0f1a2e] border border-[#1e2f4d] rounded-2xl shadow-2xl p-6"
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#1e2f4d] mb-4">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={18} className="text-[#38bdf8]" />
            <h3 className="text-sm font-bold text-[#f1f5f9]">Record Intervention Outcome</h3>
          </div>
          <button onClick={onCancel} className="text-[#64748b] hover:text-[#f1f5f9]">
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-[#94a3b8] mb-4 leading-relaxed">
          Log the real-world outcome of the mitigations executed for <strong className="text-[#f1f5f9] mono">{plan.planId}</strong>.
          This feeds into the impact tracking reports.
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] text-[#94a3b8] uppercase tracking-wider font-semibold block mb-2">
              Observed Impact
            </label>
            <div className="flex flex-col gap-2">
              {[
                { val: "improved", label: "Measured Impact: Air Quality Improved" },
                { val: "unchanged", label: "Measured Impact: No Significant Change" },
                { val: "worsened", label: "Measured Impact: Air Quality Worsened" },
                { val: "unable_to_determine", label: "Operational Outcome Only (Impact Unverified)" },
              ].map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => setOutcome(opt.val as OutcomeStatus)}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                    outcome === opt.val
                      ? "bg-[#38bdf8]/10 border-[#38bdf8] text-[#38bdf8]"
                      : "bg-[#0b1322] border-[#1e2f4d] text-[#cbd5e1] hover:border-[#64748b]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] text-[#94a3b8] uppercase tracking-wider font-semibold block mb-2">
              Outcome Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Participants reported feeling comfortable indoors. HVAC systems functioned well."
              rows={3}
              className="w-full bg-[#0b1322] border border-[#1e2f4d] text-xs text-[#f1f5f9] rounded-lg p-3 focus:outline-none focus:border-[#38bdf8]"
            />
          </div>

          {error && <p className="text-xs text-[#f87171]">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 mt-2 border-t border-[#1e2f4d]/60">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="teal" size="sm" onClick={handleSubmit} loading={submitting}>
            Log Outcome
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
