"use client";

import { useEffect, useState, useCallback } from "react";
import { useApp } from "@/lib/context";
import { api, ActionPlan, ActionStatus, PlanStatus, AirwiseApiError } from "@/lib/api";
import { Card, ErrorCard, LoadingCard, SectionHeader, Button, Badge, WarnBanner, Disclaimer } from "@/components/ui/Card";
import { fmtDate, fmtRelative, planStatusConfig, actionStatusConfig, clsx } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, User, ChevronDown, ChevronUp, AlertTriangle, Megaphone, Copy, Check, CheckCircle2, X, Filter } from "lucide-react";

function AuditTrail({ audit }: { audit: ActionPlan["audit"] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-3 pt-3 border-t border-[#1e2f4d]/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] text-[#94a3b8] hover:text-[#f1f5f9] transition-colors uppercase tracking-wider font-semibold cursor-pointer"
      >
        <span>Audit Trail Provenance ({audit.length})</span>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-2.5"
          >
            <div className="space-y-2 border-l-2 border-[#1e2f4d] pl-3 ml-1.5 py-1">
              {audit.map((entry, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-[17px] top-1.5 w-1.5 h-1.5 rounded-full bg-[#14b8a6]" />
                  <p className="text-[10px] text-[#64748b] mono">{fmtDate(entry.at)}</p>
                  <p className="text-xs text-[#cbd5e1] mt-0.5">
                    <strong className="text-[#f1f5f9]">{entry.by}</strong> · {entry.event}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActionTaskRow({
  action,
  planApproved,
  onUpdate,
  updating,
}: {
  action: ActionPlan["actions"][0];
  planApproved: boolean;
  onUpdate: (actionId: string, status: ActionStatus) => void;
  updating: boolean;
}) {
  const cfg = actionStatusConfig[action.status];

  return (
    <div className={clsx(
      "flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border transition-all bg-[#0b1322]",
      action.status === "completed"
        ? "border-[#34d399]/40 bg-[#34d399]/5"
        : action.status === "in_progress"
        ? "border-[#38bdf8]/40 bg-[#38bdf8]/5"
        : "border-[#1e2f4d]"
    )}>
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className={clsx("w-2 h-2 rounded-full shrink-0", cfg.dot)} />
        <div className="min-w-0">
          <p className={clsx("text-xs font-semibold", action.status === "completed" ? "line-through text-[#64748b]" : "text-[#f1f5f9]")}>
            {action.label}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <User size={10} className="text-[#64748b]" />
            <span className="text-[11px] text-[#94a3b8]">{action.owner}</span>
            {action.completedAt && (
              <span className="text-[10px] text-[#34d399] mono">✓ {fmtRelative(action.completedAt)}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
        {planApproved && action.status !== "completed" && (
          <div className="flex gap-1.5">
            {action.status === "pending" && (
              <button
                onClick={() => onUpdate(action.actionId, "in_progress")}
                disabled={updating}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[#0f1a2e] border border-[#1e2f4d] hover:border-[#38bdf8] text-[#38bdf8] transition-colors cursor-pointer"
              >
                Start
              </button>
            )}
            <button
              onClick={() => onUpdate(action.actionId, "completed")}
              disabled={updating}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[#34d399]/15 border border-[#34d399]/40 hover:bg-[#34d399]/25 text-[#34d399] transition-colors cursor-pointer"
            >
              Mark Done
            </button>
          </div>
        )}

        {!planApproved && <Badge variant="default">{cfg.label}</Badge>}
        {action.status === "completed" && <Badge variant="green">Done</Badge>}
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  onRefresh,
  onOpenApprove,
  onOpenDismiss,
}: {
  plan: ActionPlan;
  onRefresh: () => void;
  onOpenApprove: (plan: ActionPlan) => void;
  onOpenDismiss: (plan: ActionPlan) => void;
}) {
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const statusCfg = planStatusConfig[plan.status];
  const completedCount = plan.actions.filter(a => a.status === "completed").length;
  const progress = plan.actions.length ? Math.round((completedCount / plan.actions.length) * 100) : 0;

  const alertText = [
    `AIRWISE CAMPUS AIR ADVISORY`,
    `Campus: ${plan.campusId} | Protocol Plan ID: ${plan.planId}`,
    `Status: ${plan.status.toUpperCase()}`,
    `Approved By: ${plan.approvedBy || "Campus Administrator"}`,
    `\nMandated Mitigation Protocols:`,
    ...plan.actions.map((a, i) => `${i + 1}. [${a.status.replace(/_/g, " ").toUpperCase()}] ${a.label} — Role: ${a.owner}`),
    `\nDisclaimer: Operational decision support only; not medical advice or an official government alert.`,
  ].join("\n");

  const updateAction = async (actionId: string, status: ActionStatus) => {
    setUpdating(true);
    try {
      await api.updateAction(plan.planId, actionId, status);
      onRefresh();
    } catch (e) {
      setError(e instanceof AirwiseApiError ? e.message : "Failed to update task state");
    } finally {
      setUpdating(false);
    }
  };

  const copyAlert = async () => {
    try {
      await navigator.clipboard.writeText(alertText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy broadcast text in this browser.");
    }
  };

  return (
    <Card className={clsx(
      "border bg-[#0f1a2e]",
      plan.status === "draft" ? "border-[#fbbf24]/40" :
      plan.status === "approved" ? "border-[#38bdf8]/40" :
      plan.status === "completed" ? "border-[#34d399]/40" :
      "border-[#1e2f4d]"
    )}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={clsx("text-xs font-bold uppercase tracking-wider", statusCfg.color)}>
              {statusCfg.label}
            </span>
            <span className="text-xs text-[#64748b] mono font-bold">({plan.planId})</span>
          </div>
          <p className="text-xs text-[#94a3b8]">
            Source: <span className="text-[#f1f5f9] mono">{plan.assessmentId}</span> · Created {fmtDate(plan.createdAt)}
            {plan.approvedBy && ` · Approved by ${plan.approvedBy}`}
          </p>
        </div>

        {plan.status === "approved" && (
          <div className="sm:text-right">
            <p className="text-xs text-[#94a3b8] mb-1 font-semibold">{completedCount}/{plan.actions.length} tasks completed</p>
            <div className="w-32 h-1.5 rounded-full bg-[#1e2f4d] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#34d399] transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Community Alert Broadcast Box */}
      {(plan.status === "approved" || plan.status === "completed") && (
        <div className="mb-4 rounded-xl border border-[#14b8a6]/30 bg-[#14b8a6]/5 p-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Megaphone size={16} className="text-[#14b8a6] mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-bold text-[#f1f5f9]">Campus Community Alert Broadcast</p>
                <p className="text-[11px] text-[#94a3b8] mt-0.5">
                  Pre-formatted official message derived from approved mitigation tasks.
                </p>
              </div>
            </div>
            <button
              onClick={() => setAlertOpen(!alertOpen)}
              className="px-2.5 py-1 rounded-lg border border-[#1e2f4d] hover:border-[#14b8a6] bg-[#0b1322] text-xs font-semibold text-[#f1f5f9] transition-colors cursor-pointer self-start sm:self-auto"
            >
              {alertOpen ? "Hide Broadcast" : "View Broadcast"}
            </button>
          </div>

          <AnimatePresence>
            {alertOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 rounded-lg border border-[#1e2f4d] bg-[#070c14] p-3 text-xs">
                  <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-[#cbd5e1] font-mono select-all">
                    {alertText}
                  </pre>
                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      variant="teal"
                      onClick={copyAlert}
                      icon={copied ? <Check size={13} /> : <Copy size={13} />}
                    >
                      {copied ? "Copied to Clipboard" : "Copy Message"}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Draft Approval Banner */}
      {plan.status === "draft" && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[#fbbf24]/10 border border-[#fbbf24]/30 mb-4"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-[#fbbf24] shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-[#fbbf24]">Approval Required</p>
              <p className="text-[11px] text-[#94a3b8] mt-0.5">
                Review proposed mitigation actions before authorizing task execution.
              </p>
            </div>
          </div>

          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="teal" onClick={() => onOpenApprove(plan)}>
              Approve Plan
            </Button>
            <Button size="sm" variant="danger" onClick={() => onOpenDismiss(plan)}>
              Dismiss
            </Button>
          </div>
        </motion.div>
      )}

      {/* Actions */}
      <div className="space-y-2 mb-3">
        {plan.actions.map(action => (
          <ActionTaskRow
            key={action.actionId}
            action={action}
            planApproved={plan.status === "approved"}
            onUpdate={updateAction}
            updating={updating}
          />
        ))}
      </div>

      {error && <WarnBanner>{error}</WarnBanner>}

      <AuditTrail audit={plan.audit} />
    </Card>
  );
}

export default function ResponsePage() {
  const { selectedCampus, refreshKey, refresh } = useApp();
  const [plans, setPlans] = useState<ActionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Approval Dialog Modal state
  const [approveModalPlan, setApproveModalPlan] = useState<ActionPlan | null>(null);
  const [approverName, setApproverName] = useState<string>("Campus Administrator");
  const [approving, setApproving] = useState(false);

  // Dismiss Dialog Modal state
  const [dismissModalPlan, setDismissModalPlan] = useState<ActionPlan | null>(null);
  const [dismissalReason, setDismissalReason] = useState<string>("Event relocated indoors");
  const [dismissing, setDismissing] = useState(false);

  const load = useCallback(async () => {
    if (!selectedCampus) return;
    setLoading(true);
    setError(null);
    try {
      const { plans: list } = await api.getActionPlans(selectedCampus.campusId);
      setPlans(list);
    } catch (e) {
      setError(e instanceof AirwiseApiError ? e.message : "Failed to load action plans");
    } finally {
      setLoading(false);
    }
  }, [selectedCampus]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const handleApproveConfirm = async () => {
    if (!approveModalPlan) return;
    setApproving(true);
    try {
      await api.approvePlan(approveModalPlan.planId, approverName.trim() || "Campus Administrator");
      setApproveModalPlan(null);
      await load();
      refresh();
    } catch (e) {
      setError(e instanceof AirwiseApiError ? e.message : "Approval failed");
    } finally {
      setApproving(false);
    }
  };

  const handleDismissConfirm = async () => {
    if (!dismissModalPlan) return;
    setDismissing(true);
    try {
      await api.dismissPlan(
        dismissModalPlan.planId,
        approverName.trim() || "Campus Administrator",
        dismissalReason.trim() || "Operational discretion"
      );
      setDismissModalPlan(null);
      await load();
      refresh();
    } catch (e) {
      setError(e instanceof AirwiseApiError ? e.message : "Dismissal failed");
    } finally {
      setDismissing(false);
    }
  };

  if (!selectedCampus) return <div className="text-[#64748b] text-sm">Select a campus.</div>;

  const draftCount = plans.filter(p => p.status === "draft").length;
  const approvedCount = plans.filter(p => p.status === "approved").length;
  const completedCount = plans.filter(p => p.status === "completed").length;

  const filteredPlans = plans.filter(p => {
    if (statusFilter === "all") return true;
    return p.status === statusFilter;
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <SectionHeader
        title="Response Centre & Task Management"
        description={`Authorise environmental mitigation plans and track task progress for ${selectedCampus.name}`}
      />

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <Card className="border-[#1e2f4d] bg-[#0f1a2e]">
          <p className="text-[11px] text-[#94a3b8] uppercase tracking-wider font-semibold mb-1">Awaiting Approval</p>
          <p className={clsx("text-2xl md:text-3xl font-bold mono", draftCount > 0 ? "text-[#fbbf24]" : "text-[#64748b]")}>
            {draftCount}
          </p>
        </Card>
        <Card className="border-[#1e2f4d] bg-[#0f1a2e]">
          <p className="text-[11px] text-[#94a3b8] uppercase tracking-wider font-semibold mb-1">In Progress</p>
          <p className={clsx("text-2xl md:text-3xl font-bold mono", approvedCount > 0 ? "text-[#38bdf8]" : "text-[#64748b]")}>
            {approvedCount}
          </p>
        </Card>
        <Card className="border-[#1e2f4d] bg-[#0f1a2e]">
          <p className="text-[11px] text-[#94a3b8] uppercase tracking-wider font-semibold mb-1">Completed Plans</p>
          <p className={clsx("text-2xl md:text-3xl font-bold mono", completedCount > 0 ? "text-[#34d399]" : "text-[#64748b]")}>
            {completedCount}
          </p>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {[
          { key: "all", label: `All Plans (${plans.length})` },
          { key: "draft", label: `Draft (${draftCount})` },
          { key: "approved", label: `In Progress (${approvedCount})` },
          { key: "completed", label: `Completed (${completedCount})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0",
              statusFilter === tab.key
                ? "bg-[#14b8a6]/20 border border-[#14b8a6]/40 text-[#2dd4bf]"
                : "bg-[#0f1a2e] border border-[#1e2f4d] text-[#94a3b8] hover:text-[#f1f5f9]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <LoadingCard lines={5} />}
      {error && <ErrorCard message={error} onRetry={load} />}

      {!loading && !error && filteredPlans.length === 0 && (
        <Card>
          <div className="text-center py-12">
            <ShieldAlert size={32} className="text-[#64748b] mx-auto mb-3" />
            <p className="text-[#f1f5f9] text-xs font-semibold">No response plans found for this filter.</p>
            <p className="text-[11px] text-[#64748b] mt-1">Generate a draft plan from the Campus Assessment workbench.</p>
          </div>
        </Card>
      )}

      <AnimatePresence>
        <div className="space-y-4">
          {filteredPlans.map(plan => (
            <motion.div
              key={plan.planId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
            >
              <PlanCard
                plan={plan}
                onRefresh={load}
                onOpenApprove={setApproveModalPlan}
                onOpenDismiss={setDismissModalPlan}
              />
            </motion.div>
          ))}
        </div>
      </AnimatePresence>

      {/* Approval Confirmation Modal */}
      <AnimatePresence>
        {approveModalPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[#0f1a2e] border border-[#1e2f4d] rounded-2xl shadow-2xl p-6"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#1e2f4d] mb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-[#14b8a6]" />
                  <h3 className="text-sm font-bold text-[#f1f5f9]">Authorize Response Plan</h3>
                </div>
                <button
                  onClick={() => setApproveModalPlan(null)}
                  className="text-[#64748b] hover:text-[#f1f5f9]"
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-xs text-[#94a3b8] leading-relaxed mb-4">
                You are authorizing response plan <strong className="text-[#f1f5f9] mono">{approveModalPlan.planId}</strong> for execution.
                This will unlock coordinator action updates and record your signature in the immutable audit trail.
              </p>

              <div className="mb-4">
                <label className="text-[11px] text-[#94a3b8] uppercase tracking-wider font-semibold block mb-1">
                  Authorizing Official Name / Role
                </label>
                <input
                  type="text"
                  value={approverName}
                  onChange={e => setApproverName(e.target.value)}
                  placeholder="e.g. Dr. A. Sharma (Campus Administrator)"
                  className="w-full bg-[#0b1322] border border-[#1e2f4d] text-xs text-[#f1f5f9] rounded-lg px-3 py-2 focus:outline-none focus:border-[#14b8a6]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1e2f4d]/60">
                <Button variant="ghost" size="sm" onClick={() => setApproveModalPlan(null)}>
                  Cancel
                </Button>
                <Button variant="teal" size="sm" onClick={handleApproveConfirm} loading={approving}>
                  Sign & Approve
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dismissal Confirmation Modal */}
      <AnimatePresence>
        {dismissModalPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[#0f1a2e] border border-[#1e2f4d] rounded-2xl shadow-2xl p-6"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#1e2f4d] mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-[#f87171]" />
                  <h3 className="text-sm font-bold text-[#f1f5f9]">Dismiss Response Plan?</h3>
                </div>
                <button
                  onClick={() => setDismissModalPlan(null)}
                  className="text-[#64748b] hover:text-[#f1f5f9]"
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-xs text-[#94a3b8] leading-relaxed mb-3">
                Are you sure you want to dismiss plan <strong className="text-[#f1f5f9] mono">{dismissModalPlan.planId}</strong>?
                This state transition will be permanently recorded in the audit log.
              </p>

              <div className="mb-4">
                <label className="text-[11px] text-[#94a3b8] uppercase tracking-wider font-semibold block mb-1">
                  Dismissal Reason
                </label>
                <input
                  type="text"
                  value={dismissalReason}
                  onChange={e => setDismissalReason(e.target.value)}
                  placeholder="e.g. Activity shifted indoors / Weather normalized"
                  className="w-full bg-[#0b1322] border border-[#1e2f4d] text-xs text-[#f1f5f9] rounded-lg px-3 py-2 focus:outline-none focus:border-[#f87171]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1e2f4d]/60">
                <Button variant="ghost" size="sm" onClick={() => setDismissModalPlan(null)}>
                  Cancel
                </Button>
                <Button variant="danger" size="sm" onClick={handleDismissConfirm} loading={dismissing}>
                  Confirm Dismissal
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Disclaimer />
    </div>
  );
}

