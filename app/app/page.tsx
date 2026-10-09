"use client";

import { useEffect, useState, useCallback } from "react";
import { useApp } from "@/lib/context";
import { api, AirQualityResponse, Assessment, ActionPlan, AirwiseApiError, ActionStatus } from "@/lib/api";
import { Card, StatCard, ErrorCard, LoadingCard, WarnBanner, Disclaimer, SectionHeader, Badge, Button } from "@/components/ui/Card";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { ThresholdTimeline } from "@/components/charts/ThresholdTimeline";
import AssessmentCard from "@/components/assessment/AssessmentCard";
import CommandCenter from "@/components/dashboard/CommandCenter";
import { fmtRelative, statusConfig, clsx } from "@/lib/utils";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, CheckCircle, TrendingUp, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

export default function OverviewPage() {
  const { selectedCampus, refreshKey, refresh } = useApp();
  const [air, setAir] = useState<AirQualityResponse | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [plans, setPlans] = useState<ActionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    if (!selectedCampus) return;
    setLoading(true);
    setError(null);
    try {
      const [airData, assessData, planData] = await Promise.all([
        api.airQuality(selectedCampus.campusId),
        api.getAssessments(selectedCampus.campusId),
        api.getActionPlans(selectedCampus.campusId),
      ]);
      setAir(airData);
      setAssessments(assessData.assessments);
      setPlans(planData.plans);
    } catch (e) {
      setError(e instanceof AirwiseApiError ? e.message : "Failed to load operational telemetry");
    } finally {
      setLoading(false);
    }
  }, [selectedCampus]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const handleQuickTaskUpdate = async (planId: string, actionId: string, status: ActionStatus) => {
    setUpdatingTaskId(actionId);
    try {
      await api.updateAction(planId, actionId, status);
      await load();
      refresh();
    } catch {
      // Ignore failure, state remains
    } finally {
      setUpdatingTaskId(null);
    }
  };

  if (!selectedCampus) return <div className="text-[#64748b] text-sm">Select a campus to begin.</div>;
  if (loading) return <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <LoadingCard key={i} />)}</div>;
  if (error) return <ErrorCard message={error} onRetry={load} />;

  const latest = assessments[0];
  const pendingActions = plans.flatMap(p => p.actions.map(a => ({ ...a, planId: p.planId, planStatus: p.status }))).filter(a => a.status !== "completed");
  const draftPlans = plans.filter(p => p.status === "draft");
  const current = air?.modelledCurrent;
  const pm25Now = current?.pm2_5 ?? null;
  const pm10Now = current?.pm10 ?? null;
  const latestConfig = latest ? statusConfig[latest.status] : null;

  return (
    <div className="space-y-6 max-w-7xl">
      <SectionHeader
        title="Operational Command Center"
        description={`Real-time atmospheric telemetry and decision tracking for ${selectedCampus.name}`}
      />

      <CommandCenter
        campus={selectedCampus}
        air={air}
        latest={latest ?? null}
        plans={plans}
      />

      {/* Alert banner for action_recommended */}
      {latest?.status === "action_recommended" && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 rounded-xl bg-[#ef4444]/15 border border-[#ef4444]/40 glow-red"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-[#f87171] shrink-0 mt-0.5" />
            <div>
              <p className="text-[#f87171] font-bold text-xs uppercase tracking-wider">
                Action Protocol Triggered — {latest.activity.replace(/_/g, " ")}
              </p>
              <p className="text-[#f1f5f9] text-xs mt-0.5">
                Deterministic engine recommends operational mitigation. Check evidence or initiate response.
              </p>
            </div>
          </div>
          <Button variant="danger" size="sm" onClick={() => router.push("/assessment")}>
            Inspect Rules & Evidence
          </Button>
        </motion.div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          label="PM₂.₅ (Modelled, Now)"
          value={pm25Now !== null ? pm25Now.toFixed(1) : "—"}
          unit="µg/m³"
          sub="Forecast model · ECMWF CAMS"
          color={pm25Now !== null ? (pm25Now > 60 ? "text-[#f87171]" : pm25Now > 15 ? "text-[#fbbf24]" : "text-[#34d399]") : "text-[#64748b]"}
        />
        <StatCard
          label="PM₁₀ (Modelled, Now)"
          value={pm10Now !== null ? pm10Now.toFixed(1) : "—"}
          unit="µg/m³"
          sub="Forecast model · ECMWF CAMS"
          color={pm10Now !== null ? (pm10Now > 100 ? "text-[#f87171]" : pm10Now > 45 ? "text-[#fbbf24]" : "text-[#34d399]") : "text-[#64748b]"}
        />
        <StatCard
          label="Assessment State"
          value={latestConfig?.label ?? "None"}
          sub={latest ? `Updated ${fmtRelative(latest.createdAt)}` : "Run an assessment"}
          color={latestConfig?.color ?? "text-[#64748b]"}
        />
        <StatCard
          label="Active Response Tasks"
          value={pendingActions.length}
          sub={`${draftPlans.length} plan(s) awaiting approval`}
          color={pendingActions.length > 0 ? "text-[#fbbf24]" : "text-[#34d399]"}
        />
      </div>

      {/* Threshold Crossing Timeline (P1 Differentiator) */}
      {air && air.forecast.length > 0 && (
        <ThresholdTimeline forecast={air.forecast} />
      )}

      {/* Main Forecast Chart */}
      {air && air.forecast.length > 0 && (
        <Card>
          <ForecastChart
            forecast={air.forecast}
            pollutants={["pm2_5", "pm10"]}
            title="Pollutant Trajectory (Next 24 Hours) · Modelled Forecast"
          />
        </Card>
      )}

      {/* Warnings */}
      {air && air.warnings.length > 0 && (
        <div className="space-y-2">
          {air.warnings.map((w, i) => <WarnBanner key={i}>{w}</WarnBanner>)}
        </div>
      )}

      {/* Lower Dual Panel: Latest Assessment & Action Items Manager */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Latest assessment */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-[#94a3b8] uppercase tracking-wider font-semibold flex items-center gap-2">
              <Activity size={14} className="text-[#14b8a6]" /> Latest Assessment
            </p>
            <Button variant="ghost" size="sm" onClick={() => router.push("/assessment")}>
              <span>New Assessment</span>
              <ArrowRight size={12} />
            </Button>
          </div>
          {latest ? (
            <AssessmentCard assessment={latest} compact />
          ) : (
            <div className="text-center py-10 border border-dashed border-[#1e2f4d] rounded-xl">
              <p className="text-[#94a3b8] text-xs">No assessments recorded for this campus.</p>
              <Button className="mt-3" variant="teal" size="sm" onClick={() => router.push("/assessment")}>
                Run First Assessment
              </Button>
            </div>
          )}
        </Card>

        {/* Pending action items */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-[#94a3b8] uppercase tracking-wider font-semibold flex items-center gap-2">
              <CheckCircle size={14} className="text-[#34d399]" /> Pending Response Tasks
            </p>
            <Button variant="ghost" size="sm" onClick={() => router.push("/response")}>
              <span>Response Centre</span>
              <ArrowRight size={12} />
            </Button>
          </div>

          {pendingActions.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-[#1e2f4d] rounded-xl">
              <CheckCircle size={22} className="text-[#34d399] mx-auto mb-2" />
              <p className="text-[#f1f5f9] text-xs font-semibold">All clear — no pending actions.</p>
              <p className="text-[#64748b] text-[11px] mt-0.5">All approved tasks have been completed.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingActions.slice(0, 5).map(a => (
                <div
                  key={`${a.planId}-${a.actionId}`}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#0b1322] border border-[#1e2f4d]"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className={clsx("w-2 h-2 rounded-full shrink-0", a.status === "in_progress" ? "bg-[#38bdf8]" : "bg-[#fbbf24]")} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#f1f5f9] truncate">{a.label}</p>
                      <p className="text-[10px] text-[#64748b]">{a.owner} · {a.planStatus}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={a.status === "in_progress" ? "blue" : "amber"}>
                      {a.status.replace(/_/g, " ")}
                    </Badge>
                    {a.planStatus === "approved" && (
                      <button
                        onClick={() => handleQuickTaskUpdate(a.planId, a.actionId, a.status === "pending" ? "in_progress" : "completed")}
                        disabled={updatingTaskId === a.actionId}
                        className="px-2 py-1 rounded bg-[#1e2f4d] hover:bg-[#2d436b] text-[10px] font-semibold text-[#f1f5f9] transition-colors cursor-pointer"
                      >
                        {updatingTaskId === a.actionId ? "..." : a.status === "pending" ? "Start" : "Done"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {pendingActions.length > 5 && (
                <p className="text-[11px] text-[#64748b] text-center pt-1">
                  +{pendingActions.length - 5} more pending actions
                </p>
              )}
            </div>
          )}
        </Card>
      </div>

      <Disclaimer />
    </div>
  );
}

