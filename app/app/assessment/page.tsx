"use client";

import { useEffect, useState, useCallback } from "react";
import { useApp } from "@/lib/context";
import { api, Assessment, ActivityType, AirwiseApiError } from "@/lib/api";
import { Card, LoadingCard, SectionHeader, Button, Disclaimer, WarnBanner, Badge } from "@/components/ui/Card";
import AssessmentCard from "@/components/assessment/AssessmentCard";
import { fmtDate, statusConfig, clsx } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { ClipboardCheck, Dumbbell, Users, HardHat, ChevronRight, Scale, ShieldCheck, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { useRouter } from "next/navigation";

const ACTIVITY_OPTIONS: { value: ActivityType; label: string; desc: string; role: string; icon: React.ReactNode }[] = [
  {
    value: "outdoor_sports",
    label: "Outdoor Sports & PE",
    desc: "Athletics practice, PE sessions, outdoor field tournaments",
    role: "Sports Coordinator",
    icon: <Dumbbell size={18} />,
  },
  {
    value: "assembly",
    label: "Campus Assembly",
    desc: "Whole-school gatherings, outdoor stages, prayer meetings",
    role: "Campus Administrator",
    icon: <Users size={18} />,
  },
  {
    value: "outdoor_work",
    label: "Facilities & Outdoor Work",
    desc: "Groundkeeping, construction, campus maintenance staff",
    role: "Facilities Coordinator",
    icon: <HardHat size={18} />,
  },
];

export default function AssessmentPage() {
  const { selectedCampus, refreshKey, refresh } = useApp();
  const [activity, setActivity] = useState<ActivityType>("outdoor_sports");
  const [assessing, setAssessing] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [latest, setLatest] = useState<Assessment | null>(null);
  const [history, setHistory] = useState<Assessment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assessError, setAssessError] = useState<string | null>(null);

  // Confirmation Modal state for plan creation
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [targetAssessmentId, setTargetAssessmentId] = useState<string | null>(null);

  const router = useRouter();

  const loadHistory = useCallback(async () => {
    if (!selectedCampus) return;
    setLoadingHistory(true);
    try {
      const { assessments } = await api.getAssessments(selectedCampus.campusId);
      setHistory(assessments);
      setLatest(prev => prev ?? assessments[0] ?? null);
    } catch (e) {
      setError(e instanceof AirwiseApiError ? e.message : "Failed to load assessment history");
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedCampus]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, refreshKey]);

  const runAssessment = async () => {
    if (!selectedCampus) return;
    setAssessing(true);
    setAssessError(null);
    try {
      const result = await api.createAssessment(selectedCampus.campusId, activity);
      setLatest(result);
      setHistory(prev => [result, ...prev]);
      refresh();
    } catch (e) {
      setAssessError(e instanceof AirwiseApiError ? e.message : "Assessment evaluation failed");
    } finally {
      setAssessing(false);
    }
  };

  const handleOpenPlanConfirm = (assessmentId: string) => {
    setTargetAssessmentId(assessmentId);
    setConfirmModalOpen(true);
  };

  const handleConfirmCreatePlan = async () => {
    if (!targetAssessmentId) return;
    setCreatingPlan(true);
    try {
      const plan = await api.createActionPlan(targetAssessmentId);
      setConfirmModalOpen(false);
      refresh();
      router.push("/response");
    } catch (e) {
      setAssessError(e instanceof AirwiseApiError ? e.message : "Could not create response plan");
      setCreatingPlan(false);
    }
  };

  if (!selectedCampus) return <div className="text-[#64748b] text-sm">Select a campus.</div>;

  return (
    <div className="space-y-6 max-w-6xl">
      <SectionHeader
        title="Campus Risk Assessment Workbench"
        description={`Run deterministic mathematical risk evaluations for planned activities at ${selectedCampus.name}`}
      />

      {/* Assessment Generator Workbench */}
      <Card className="border-[#1e2f4d] bg-[#0f1a2e]">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-[#94a3b8] uppercase tracking-wider font-semibold flex items-center gap-2">
            <ClipboardCheck size={14} className="text-[#14b8a6]" />
            1. Select Planned Activity Type
          </p>
          <Badge variant="teal">Deterministic Rule Engine</Badge>
        </div>

        <p className="text-xs text-[#94a3b8] mb-4 leading-relaxed">
          Select the campus activity. The engine fetches the rolling 24-hour atmospheric forecast from Open-Meteo CAMS,
          applies strict WHO AQG 2021 and India CPCB NAAQS thresholds, and produces an explainable, auditable decision.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          {ACTIVITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setActivity(opt.value)}
              className={clsx(
                "flex flex-col justify-between p-4 rounded-xl border text-left transition-all cursor-pointer",
                activity === opt.value
                  ? "border-[#14b8a6] bg-[#14b8a6]/10 text-[#f1f5f9] shadow-sm shadow-teal-950"
                  : "border-[#1e2f4d] bg-[#0b1322] text-[#94a3b8] hover:border-[#2d436b] hover:bg-[#15233d]"
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className={clsx(activity === opt.value ? "text-[#14b8a6]" : "text-[#64748b]")}>
                  {opt.icon}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#0f1a2e] border border-[#1e2f4d] text-[#94a3b8] font-mono">
                  {opt.role}
                </span>
              </div>
              <div>
                <p className="text-xs font-bold text-[#f1f5f9]">{opt.label}</p>
                <p className="text-[11px] text-[#94a3b8] mt-1 leading-snug">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#1e2f4d]/60">
          <div className="flex items-center gap-3">
            <Button onClick={runAssessment} loading={assessing} variant="teal" size="md">
              {assessing ? "Fetching data & evaluating..." : "Run Risk Assessment"}
            </Button>
            <span className="text-[11px] text-[#64748b]">Zero LLM hallucinations in the risk math.</span>
          </div>
          <span className="text-[10px] text-[#64748b] mono">Grid Cell: {selectedCampus.latitude.toFixed(3)}°N, {selectedCampus.longitude.toFixed(3)}°E</span>
        </div>

        {assessError && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
            <WarnBanner>{assessError}</WarnBanner>
          </motion.div>
        )}
      </Card>

      {/* Rule and Approval Reference Columns */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <p className="text-xs text-[#94a3b8] uppercase tracking-wider font-semibold mb-3 flex items-center gap-2">
            <Scale size={13} className="text-[#38bdf8]" />
            Regulatory Guidelines Applied
          </p>
          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded-lg bg-[#0b1322] border border-[#1e2f4d] flex justify-between items-center">
              <div>
                <p className="font-bold text-[#f1f5f9]">India CPCB NAAQS (2009)</p>
                <p className="text-[10px] text-[#64748b]">National Ambient Air Quality Standards (24h)</p>
              </div>
              <span className="text-[11px] font-mono font-bold text-[#f87171]">PM₂.₅ &gt; 60 µg/m³</span>
            </div>
            <div className="p-2.5 rounded-lg bg-[#0b1322] border border-[#1e2f4d] flex justify-between items-center">
              <div>
                <p className="font-bold text-[#f1f5f9]">WHO Air Quality Guidelines (2021)</p>
                <p className="text-[10px] text-[#64748b]">Global Health Screening Benchmark (24h)</p>
              </div>
              <span className="text-[11px] font-mono font-bold text-[#fbbf24]">PM₂.₅ &gt; 15 µg/m³</span>
            </div>
          </div>
        </Card>

        <Card>
          <p className="text-xs text-[#94a3b8] uppercase tracking-wider font-semibold mb-3 flex items-center gap-2">
            <ShieldCheck size={13} className="text-[#34d399]" />
            Human-in-the-Loop Governance
          </p>
          <div className="p-3 rounded-lg bg-[#0b1322] border border-[#1e2f4d] text-xs space-y-2">
            <p className="text-[#cbd5e1] leading-relaxed">
              AIRWISE provides deterministic decision support. Automated assessment generates a <strong>Draft Plan</strong>;
              action execution requires explicit administrator sign-off before coordinators carry out tasks.
            </p>
            <div className="flex items-center gap-2 pt-1 text-[10px] text-[#64748b] font-mono">
              <span>1. Draft Plan</span>→<span>2. Administrator Review</span>→<span>3. Signed-off Execution</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Latest assessment result */}
      <AnimatePresence mode="wait">
        {latest && (
          <motion.div
            key={latest.assessmentId}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="mb-2">
              <p className="text-xs text-[#94a3b8] uppercase tracking-wider font-semibold mb-2">
                Active Assessment Evaluation
              </p>
              <AssessmentCard
                assessment={latest}
                onCreatePlan={handleOpenPlanConfirm}
                creatingPlan={creatingPlan}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Assessment History for Campus */}
      <Card>
        <p className="text-xs text-[#94a3b8] uppercase tracking-wider font-semibold mb-3">
          Historical Assessments Recorded ({history.length})
        </p>

        {loadingHistory ? (
          <LoadingCard />
        ) : error ? (
          <WarnBanner>{error}</WarnBanner>
        ) : history.length === 0 ? (
          <p className="text-[#64748b] text-xs text-center py-6">No assessments recorded. Run your first one above.</p>
        ) : (
          <div className="space-y-2">
            {history.map(a => {
              const cfg = statusConfig[a.status];
              const isSelected = latest?.assessmentId === a.assessmentId;
              return (
                <button
                  key={a.assessmentId}
                  onClick={() => setLatest(a)}
                  className={clsx(
                    "w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer",
                    isSelected
                      ? "border-[#14b8a6] bg-[#14b8a6]/10 text-[#f1f5f9]"
                      : "border-[#1e2f4d] bg-[#0b1322] hover:border-[#2d436b] hover:bg-[#15233d]"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={clsx("text-sm font-bold shrink-0", cfg.color)}>{cfg.icon}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#f1f5f9] truncate">{a.activity.replace(/_/g, " ")}</p>
                      <p className="text-[10px] text-[#64748b] mono">{fmtDate(a.createdAt)} · {a.dataMode}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={clsx("text-xs font-semibold", cfg.color)}>{cfg.label}</span>
                    <ChevronRight size={14} className="text-[#64748b]" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Confirmation Modal for Creating Draft Plan */}
      <AnimatePresence>
        {confirmModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[#0f1a2e] border border-[#1e2f4d] rounded-2xl shadow-2xl p-6"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#1e2f4d] mb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-[#14b8a6]" />
                  <h3 className="text-sm font-bold text-[#f1f5f9]">Create Draft Response Plan?</h3>
                </div>
                <button
                  onClick={() => setConfirmModalOpen(false)}
                  className="text-[#64748b] hover:text-[#f1f5f9]"
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-xs text-[#94a3b8] leading-relaxed mb-4">
                This will initialize an operational action plan tied to assessment <strong className="text-[#f1f5f9] mono">{targetAssessmentId}</strong> with
                assigned mitigation tasks. The plan will start in <span className="text-[#fbbf24] font-semibold">Draft</span> status awaiting campus administrator approval.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1e2f4d]/60">
                <Button variant="ghost" size="sm" onClick={() => setConfirmModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="teal" size="sm" onClick={handleConfirmCreatePlan} loading={creatingPlan}>
                  Confirm & Generate Plan
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

