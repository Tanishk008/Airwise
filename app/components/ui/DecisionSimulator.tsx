import { Assessment, ActionRecommendation, WhatIfOption } from "@/lib/api";
import { clsx } from "@/lib/utils";
import { Info, ShieldCheck, AlertTriangle, Building, CalendarClock, Activity } from "lucide-react";
import { Button, Badge } from "./Card";

export function DecisionSimulator({
  assessment,
  recommendations,
  whatIfOptions,
  onApply
}: {
  assessment: Assessment;
  recommendations: ActionRecommendation[];
  whatIfOptions: WhatIfOption[];
  onApply: (rec: ActionRecommendation | null, customAlternativeId?: string) => void;
}) {
  if (!recommendations?.length && !whatIfOptions?.length) return null;

  // The 3 core pathways
  const PATHWAYS = [
    {
      id: "proceed",
      icon: <Activity size={18} />,
      title: "Proceed (with precautions)",
      matchRecs: ["continue_with_monitoring", "reduce_duration_or_intensity", "check_respiratory_protection", "restrict_outdoor_work", "notify_administrator"]
    },
    {
      id: "move_indoors",
      icon: <Building size={18} />,
      title: "Move Indoors",
      matchRecs: ["move_activity_indoors"]
    },
    {
      id: "reschedule",
      icon: <CalendarClock size={18} />,
      title: "Reschedule",
      matchRecs: ["reschedule_to_lower_risk_window", "increase_monitoring", "reassess"]
    }
  ];

  const getMatchedOption = (pathwayId: string) => {
    if (pathwayId === "proceed") {
      return whatIfOptions.find(o => o.id === "proceed" || o.id === "reduce");
    }
    if (pathwayId === "reschedule") {
      return whatIfOptions.find(o => o.id === "reschedule" || o.id === "reassess");
    }
    return whatIfOptions.find(o => o.id === pathwayId);
  };

  const topRec = recommendations[0];

  return (
    <div className="rounded-xl border border-[#1e2f4d] bg-[#0b1322] overflow-hidden mt-6">
      <div className="p-4 border-b border-[#1e2f4d] bg-[#070c14]">
        <h3 className="text-sm font-bold text-[#f1f5f9] flex items-center gap-2">
          Campus Decision Simulator
          <Badge variant="blue">Operational Alternatives</Badge>
        </h3>
        <p className="text-xs text-[#94a3b8] mt-1.5 leading-relaxed max-w-3xl">
          Compare defensible action pathways based on the current deterministic assessment for <strong className="text-[#f1f5f9]">{assessment.activity.replace(/_/g, " ")}</strong>. 
          Select an alternative to generate an auditable response plan.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-[#1e2f4d]">
        {PATHWAYS.map(pathway => {
          const matchedOpt = getMatchedOption(pathway.id);
          const isRecommended = topRec && pathway.matchRecs.includes(topRec.id);
          const isSuitable = !!matchedOpt;

          return (
            <div key={pathway.id} className={clsx("p-4 flex flex-col", isRecommended ? "bg-[#14b8a6]/5" : "")}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={clsx("p-2 rounded-lg border", isRecommended ? "bg-[#14b8a6]/10 border-[#14b8a6]/30 text-[#14b8a6]" : "bg-[#1e2f4d]/50 border-[#1e2f4d] text-[#94a3b8]")}>
                    {pathway.icon}
                  </div>
                  <h4 className={clsx("font-bold text-sm", isRecommended ? "text-[#f1f5f9]" : "text-[#cbd5e1]")}>
                    {pathway.title}
                  </h4>
                </div>
                {isRecommended && (
                  <span className="text-[9px] uppercase bg-[#14b8a6]/20 text-[#2dd4bf] px-1.5 py-0.5 rounded font-bold tracking-wider border border-[#14b8a6]/30">
                    Recommended
                  </span>
                )}
              </div>

              {!isSuitable ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                  <AlertTriangle size={20} className="text-[#64748b] mb-2" />
                  <p className="text-xs text-[#94a3b8] font-semibold">Not Recommended</p>
                  <p className="text-[10px] text-[#64748b] mt-1 px-4">This alternative is unsuitable given the current environmental evidence.</p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col">
                  <p className="text-xs text-[#cbd5e1] mb-4 leading-relaxed">
                    {matchedOpt.description}
                  </p>
                  
                  <div className="space-y-3 flex-1 mb-4">
                    <div className="bg-[#0f1a2e] rounded border border-[#1e2f4d] p-2.5">
                      <p className="text-[10px] uppercase text-[#64748b] font-bold tracking-wider mb-1 flex items-center gap-1">
                        <ShieldCheck size={11} className="text-[#34d399]" /> Operational Effect
                      </p>
                      <p className="text-[11px] text-[#cbd5e1]">{matchedOpt.operationalEffect}</p>
                    </div>

                    {matchedOpt.constraints.length > 0 && (
                      <div className="bg-[#0f1a2e] rounded border border-[#1e2f4d] p-2.5">
                        <p className="text-[10px] uppercase text-[#64748b] font-bold tracking-wider mb-1 flex items-center gap-1">
                          <Info size={11} className="text-[#38bdf8]" /> Constraints
                        </p>
                        <ul className="space-y-1">
                          {matchedOpt.constraints.map((c, j) => (
                            <li key={j} className="text-[11px] text-[#94a3b8] flex items-start gap-1">
                              <span className="text-[#64748b] shrink-0">•</span> {c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {matchedOpt.dataQualityNote && (
                      <div className="bg-[#fbbf24]/10 rounded border border-[#fbbf24]/20 p-2.5 text-[11px] text-[#fbbf24] flex gap-1.5">
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                        <p>{matchedOpt.dataQualityNote}</p>
                      </div>
                    )}
                  </div>

                  <Button 
                    variant={isRecommended ? "teal" : "secondary"} 
                    size="sm" 
                    onClick={() => {
                      if (isRecommended) onApply(topRec, matchedOpt.id);
                      else onApply(null, matchedOpt.id);
                    }}
                    className="w-full justify-center"
                  >
                    Select {pathway.title}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
