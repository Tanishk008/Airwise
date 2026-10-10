import { ActionRecommendation, WhatIfOption } from "@/lib/api";
import { clsx } from "@/lib/utils";
import { Lightbulb, Info, AlertTriangle, ArrowRight, ShieldCheck, CalendarClock } from "lucide-react";
import { useState } from "react";
import { Button } from "./Card";

export function WhatIfPlanner({
  recommendations,
  whatIfOptions,
  onApply
}: {
  recommendations: ActionRecommendation[];
  whatIfOptions: WhatIfOption[];
  onApply: (rec: ActionRecommendation) => void;
}) {
  const [activeTab, setActiveTab] = useState<"recommendations" | "whatif">("recommendations");

  if (!recommendations?.length && !whatIfOptions?.length) return null;

  const topRec = recommendations[0];

  return (
    <div className="rounded-xl border border-[#1e2f4d] bg-[#0b1322] overflow-hidden mt-6">
      <div className="flex items-center gap-1.5 p-1 border-b border-[#1e2f4d]/50 bg-[#070c14]">
        <button
          onClick={() => setActiveTab("recommendations")}
          className={clsx(
            "flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
            activeTab === "recommendations" ? "bg-[#1e2f4d] text-[#f1f5f9]" : "text-[#94a3b8] hover:text-[#cbd5e1] hover:bg-[#0f1a2e]"
          )}
        >
          <Lightbulb size={14} className={activeTab === "recommendations" ? "text-[#fbbf24]" : ""} />
          Primary Action Intelligence
        </button>
        <button
          onClick={() => setActiveTab("whatif")}
          className={clsx(
            "flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
            activeTab === "whatif" ? "bg-[#1e2f4d] text-[#f1f5f9]" : "text-[#94a3b8] hover:text-[#cbd5e1] hover:bg-[#0f1a2e]"
          )}
        >
          <CalendarClock size={14} className={activeTab === "whatif" ? "text-[#38bdf8]" : ""} />
          What-If Scenario Options
        </button>
      </div>

      <div className="p-4">
        {activeTab === "recommendations" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 shrink-0 bg-[#fbbf24]/10 p-2 rounded-full border border-[#fbbf24]/30">
                <Lightbulb size={18} className="text-[#fbbf24]" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#f1f5f9] flex items-center gap-2">
                  {topRec?.title}
                  <span className="text-[10px] uppercase bg-[#14b8a6]/20 text-[#2dd4bf] px-1.5 py-0.5 rounded font-bold tracking-wider border border-[#14b8a6]/30">
                    Top Recommendation
                  </span>
                </h4>
                <p className="text-xs text-[#94a3b8] mt-1 leading-relaxed">
                  {topRec?.description}
                </p>
                <div className="mt-3 bg-[#0f1a2e] rounded-lg border border-[#1e2f4d] p-3">
                  <p className="text-[11px] uppercase text-[#64748b] font-bold tracking-wider mb-2">Suggested Next Steps</p>
                  <ul className="space-y-1.5">
                    {topRec?.suggestedSteps.map((step, i) => (
                      <li key={i} className="text-xs text-[#cbd5e1] flex items-start gap-2">
                        <ArrowRight size={12} className="text-[#38bdf8] shrink-0 mt-0.5" />
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button variant="teal" size="sm" onClick={() => onApply(topRec)}>
                    Generate Plan Based on This Action
                  </Button>
                </div>
              </div>
            </div>

            {recommendations.length > 1 && (
              <div className="mt-4 pt-4 border-t border-[#1e2f4d]/50">
                <p className="text-[11px] uppercase text-[#64748b] font-bold tracking-wider mb-3">Alternative Action Plans</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {recommendations.slice(1).map(rec => (
                    <div key={rec.id} className="p-3 rounded-lg border border-[#1e2f4d] bg-[#070c14] hover:border-[#38bdf8]/50 transition-colors">
                      <p className="text-xs font-bold text-[#f1f5f9]">{rec.title}</p>
                      <p className="text-[11px] text-[#94a3b8] mt-1 line-clamp-2">{rec.description}</p>
                      <button onClick={() => onApply(rec)} className="text-[10px] font-bold text-[#38bdf8] uppercase tracking-wider mt-2 hover:underline cursor-pointer">
                        Select This Pathway →
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "whatif" && (
          <div className="space-y-3">
            <p className="text-xs text-[#94a3b8] mb-4">
              Explore alternative decision pathways and their operational impacts based on the current data assessment.
            </p>
            {whatIfOptions.map((opt, i) => (
              <div key={opt.id} className="p-3 rounded-xl border border-[#1e2f4d] bg-[#0f1a2e] flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <p className="text-sm font-bold text-[#f1f5f9] flex items-center gap-2">
                    <span className="text-[#64748b] font-mono text-xs">{i + 1}.</span> {opt.label}
                  </p>
                  <p className="text-xs text-[#cbd5e1] mt-1.5 leading-relaxed">{opt.description}</p>
                  <div className="mt-2.5 flex items-start gap-2 bg-[#0b1322] p-2 rounded-lg border border-[#1e2f4d]">
                    <ShieldCheck size={12} className="text-[#34d399] shrink-0 mt-0.5" />
                    <p className="text-[11px] text-[#94a3b8]"><strong>Effect:</strong> {opt.operationalEffect}</p>
                  </div>
                </div>
                <div className="sm:w-1/3 flex flex-col justify-center border-t sm:border-t-0 sm:border-l border-[#1e2f4d]/50 pt-3 sm:pt-0 sm:pl-4">
                  <p className="text-[10px] uppercase font-bold text-[#64748b] tracking-wider mb-1.5 flex items-center gap-1">
                    <Info size={10} /> Constraints
                  </p>
                  <ul className="space-y-1">
                    {opt.constraints.map((c, j) => (
                      <li key={j} className="text-[11px] text-[#94a3b8] leading-tight flex items-start gap-1">
                        <span className="text-[#64748b]">•</span> {c}
                      </li>
                    ))}
                  </ul>
                  {opt.dataQualityNote && (
                    <div className="mt-2 text-[10px] text-[#fbbf24] flex items-start gap-1 p-1.5 bg-[#fbbf24]/10 rounded border border-[#fbbf24]/20">
                      <AlertTriangle size={10} className="shrink-0 mt-0.5" />
                      <p>{opt.dataQualityNote}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
