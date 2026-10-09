"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileCheck2,
  RadioTower,
  ShieldCheck,
  Layers,
} from "lucide-react";
import { AirQualityResponse, Assessment, ActionPlan, Campus } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui/Card";
import { clsx, fmtRelative, statusConfig } from "@/lib/utils";
import { CampusComparisonModal } from "./CampusComparison";

const stages = [
  { key: "measure", label: "Measure", icon: RadioTower, desc: "Open-Meteo & OpenAQ" },
  { key: "assess", label: "Assess", icon: ClipboardCheck, desc: "WHO & CPCB Rules" },
  { key: "decide", label: "Decide", icon: ShieldCheck, desc: "Evidence & Reasons" },
  { key: "act", label: "Act", icon: Activity, desc: "Approved Response" },
  { key: "verify", label: "Verify", icon: FileCheck2, desc: "Audit Trail" },
] as const;

export default function CommandCenter({
  campus,
  air,
  latest,
  plans,
}: {
  campus: Campus;
  air: AirQualityResponse | null;
  latest: Assessment | null;
  plans: ActionPlan[];
}) {
  const router = useRouter();
  const [comparisonOpen, setComparisonOpen] = useState(false);

  const activePlan = plans.find(p => p.status === "approved") ?? plans.find(p => p.status === "draft") ?? plans[0];
  const totalActions = plans.flatMap(p => p.actions);
  const completedActions = totalActions.filter(a => a.status === "completed").length;
  const latestCfg = latest ? statusConfig[latest.status] : null;

  const workflowState = {
    measure: Boolean(air?.forecast.length || air?.observations.length),
    assess: Boolean(latest),
    decide: Boolean(activePlan && activePlan.status !== "dismissed"),
    act: totalActions.some(a => a.status === "in_progress" || a.status === "completed"),
    verify: totalActions.length > 0 && completedActions === totalActions.length,
  };

  const confidence = useMemo(() => {
    const evidenceHours = latest ? Object.values(latest.evidence).reduce((sum, e) => sum + e.hours, 0) : 0;
    const warnings = air?.warnings.length ?? 0;
    if (!latest || evidenceHours === 0) return { label: "Needs assessment", score: 35, tone: "text-[#94a3b8]", bar: "bg-[#64748b]" };
    if (warnings > 1 || latest.status === "insufficient_data") return { label: "Limited coverage", score: 55, tone: "text-[#fbbf24]", bar: "bg-[#fbbf24]" };
    if (latest.dataMode === "observed") return { label: "Strong (Observed)", score: 92, tone: "text-[#34d399]", bar: "bg-[#34d399]" };
    return { label: "Decision-Ready (Forecast)", score: 80, tone: "text-[#2dd4bf]", bar: "bg-[#14b8a6]" };
  }, [air?.warnings.length, latest]);

  const nextAction = !latest
    ? { label: "Run First Assessment", href: "/assessment" }
    : activePlan?.status === "draft"
      ? { label: "Approve Response Plan", href: "/response" }
      : activePlan?.status === "approved"
        ? { label: "Track Active Tasks", href: "/response" }
        : { label: "Inspect Historical Audit", href: "/history" };

  return (
    <>
      <Card className="overflow-hidden p-0 border-[#1e2f4d] shadow-xl">
        <div className="grid lg:grid-cols-[1.45fr_0.9fr]">
          <div className="p-5 md:p-6 border-b lg:border-b-0 lg:border-r border-[#1e2f4d] bg-[#0f1a2e]">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] text-[#14b8a6] uppercase tracking-widest font-bold px-2 py-0.5 rounded bg-[#14b8a6]/10 border border-[#14b8a6]/30">
                    Closed-Loop Operations
                  </span>
                  <span className="text-xs text-[#64748b]">{campus.city}</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-[#f1f5f9]">
                  {campus.name}
                </h2>
                <p className="text-xs text-[#94a3b8] mt-1.5 max-w-xl leading-relaxed">
                  Deterministic environmental intelligence from atmospheric data to verified coordinator response.
                </p>
              </div>
              {latestCfg && (
                <div className={clsx("rounded-xl border px-3.5 py-2 shrink-0 shadow-sm", latestCfg.bg)}>
                  <p className={clsx("text-xs font-bold", latestCfg.color)}>{latestCfg.label}</p>
                  <p className="text-[10px] text-[#94a3b8] mt-0.5">{fmtRelative(latest!.createdAt)}</p>
                </div>
              )}
            </div>

            {/* Workflow steps */}
            <div className="grid grid-cols-5 gap-2 md:gap-3 py-2">
              {stages.map(({ key, label, icon: Icon }, index) => {
                const done = workflowState[key];
                return (
                  <div key={key} className="relative">
                    {index > 0 && (
                      <div className={clsx(
                        "hidden md:block absolute right-[calc(50%+1.3rem)] top-4 h-0.5 w-[calc(100%-2.6rem)] transition-colors",
                        done ? "bg-[#14b8a6]" : "bg-[#1e2f4d]"
                      )} />
                    )}
                    <div className="flex flex-col items-center gap-1.5">
                      <div className={clsx(
                        "relative z-10 grid h-9 w-9 place-items-center rounded-lg border transition-all",
                        done
                          ? "border-[#14b8a6]/50 bg-[#14b8a6]/15 text-[#2dd4bf] shadow-sm shadow-teal-950"
                          : "border-[#1e2f4d] bg-[#0b1322] text-[#64748b]"
                      )}>
                        {done ? <CheckCircle2 size={16} /> : <Icon size={16} />}
                      </div>
                      <span className={clsx("text-[10px] font-bold uppercase tracking-wider", done ? "text-[#f1f5f9]" : "text-[#64748b]")}>
                        {label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Action Bar */}
            <div className="mt-6 pt-4 border-t border-[#1e2f4d]/60 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Button size="sm" variant="teal" onClick={() => router.push(nextAction.href)}>
                  {nextAction.label}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => router.push("/air")}>
                  Inspect Air Data
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setComparisonOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1e2f4d] hover:border-[#14b8a6] bg-[#0b1322] text-[11px] font-semibold text-[#94a3b8] hover:text-[#f1f5f9] transition-colors cursor-pointer"
                >
                  <Layers size={13} className="text-[#14b8a6]" />
                  <span>Compare Campuses</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Decision Intelligence Panel */}
          <div className="p-5 md:p-6 bg-[#0b1322] flex flex-col justify-between">
            <div>
              <p className="text-[10px] text-[#64748b] uppercase tracking-widest font-bold mb-3">
                Operational Telemetry
              </p>

              <div className="flex items-end justify-between gap-4 mb-2">
                <div>
                  <p className={clsx("text-2xl font-bold mono", confidence.tone)}>{confidence.score}%</p>
                  <p className="text-[11px] text-[#94a3b8] mt-0.5">{confidence.label}</p>
                </div>
                <Badge variant={latest?.dataMode === "observed" ? "green" : "teal"}>
                  {latest?.dataMode ?? "modelled forecast"}
                </Badge>
              </div>

              <div className="h-1.5 rounded-full bg-[#1e2f4d] overflow-hidden mb-5">
                <div
                  className={clsx("h-full rounded-full transition-all duration-500", confidence.bar)}
                  style={{ width: `${confidence.score}%` }}
                />
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-start gap-2.5 p-2 rounded-lg bg-[#0f1a2e]/60 border border-[#1e2f4d]/50">
                  <Database size={13} className="text-[#38bdf8] mt-0.5 shrink-0" />
                  <p className="text-[11px] text-[#94a3b8] leading-tight">
                    {air?.forecast.length
                      ? `${air.forecast.length} rolling hourly forecast points available.`
                      : "Connecting to Open-Meteo CAMS forecast..."}
                  </p>
                </div>
                <div className="flex items-start gap-2.5 p-2 rounded-lg bg-[#0f1a2e]/60 border border-[#1e2f4d]/50">
                  <ClipboardCheck size={13} className="text-[#fbbf24] mt-0.5 shrink-0" />
                  <p className="text-[11px] text-[#94a3b8] leading-tight">
                    {latest
                      ? `${Object.keys(latest.evidence).length} pollutant evidence sets verified against ${latest.guidelineVersion}.`
                      : "Run an assessment to evaluate outdoor activity risks."}
                  </p>
                </div>
                <div className="flex items-start gap-2.5 p-2 rounded-lg bg-[#0f1a2e]/60 border border-[#1e2f4d]/50">
                  <ShieldCheck size={13} className="text-[#34d399] mt-0.5 shrink-0" />
                  <p className="text-[11px] text-[#94a3b8] leading-tight">
                    {activePlan
                      ? `Plan ${activePlan.planId} is ${activePlan.status.replace(/_/g, " ")} with ${completedActions}/${totalActions.length} actions complete.`
                      : "No active action plan draft."}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-[#1e2f4d]/60 text-[10px] text-[#64748b] flex justify-between">
              <span>Guideline: WHO 2021 / CPCB 2009</span>
              <span>Deterministic</span>
            </div>
          </div>
        </div>
      </Card>

      <CampusComparisonModal
        isOpen={comparisonOpen}
        onClose={() => setComparisonOpen(false)}
      />
    </>
  );
}

