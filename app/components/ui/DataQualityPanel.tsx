import { DataQuality } from "@/lib/api";
import { fmtRelative, clsx } from "@/lib/utils";
import { ShieldAlert, ShieldCheck, ShieldQuestion, Info, Clock, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export function DataQualityPanel({ dataQuality, compact = false }: { dataQuality?: DataQuality, compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  if (!dataQuality) return null;

  const { qualityStatus, isStale, retrievedAt, sourceName, warnings, limitations, coveragePercent } = dataQuality;

  const statusCfg = {
    good: { icon: <ShieldCheck size={16} className="text-[#34d399]" />, color: "text-[#34d399]", bg: "bg-[#34d399]/10 border-[#34d399]/30", label: "Good Data Quality" },
    limited: { icon: <ShieldQuestion size={16} className="text-[#38bdf8]" />, color: "text-[#38bdf8]", bg: "bg-[#38bdf8]/10 border-[#38bdf8]/30", label: "Limited Quality (Forecast Only)" },
    stale: { icon: <Clock size={16} className="text-[#fbbf24]" />, color: "text-[#fbbf24]", bg: "bg-[#fbbf24]/10 border-[#fbbf24]/30", label: "Stale Data" },
    insufficient: { icon: <ShieldAlert size={16} className="text-[#f87171]" />, color: "text-[#f87171]", bg: "bg-[#f87171]/10 border-[#f87171]/30", label: "Insufficient Data Coverage" },
    unavailable: { icon: <ShieldAlert size={16} className="text-[#64748b]" />, color: "text-[#64748b]", bg: "bg-[#64748b]/10 border-[#64748b]/30", label: "Data Unavailable" },
  }[qualityStatus] || { icon: <ShieldQuestion size={16} className="text-[#64748b]" />, color: "text-[#64748b]", bg: "bg-[#64748b]/10 border-[#64748b]/30", label: qualityStatus };

  if (compact) {
    return (
      <div className={clsx("flex items-center justify-between p-2.5 rounded-lg border", statusCfg.bg)}>
        <div className="flex items-center gap-2">
          {statusCfg.icon}
          <div>
            <p className={clsx("text-xs font-bold", statusCfg.color)}>{statusCfg.label}</p>
            <p className="text-[10px] text-[#94a3b8]">Coverage: {coveragePercent}% · {isStale ? "Stale" : "Fresh"}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx("rounded-xl border bg-[#0b1322] overflow-hidden", statusCfg.bg.replace("bg-", "").replace("/10", "/5"))}>
      <div className="flex items-center justify-between p-3 border-b border-[#1e2f4d]/50">
        <div className="flex items-center gap-2.5">
          <div className="shrink-0">{statusCfg.icon}</div>
          <div>
            <p className={clsx("text-xs font-bold uppercase tracking-wider", statusCfg.color)}>{statusCfg.label}</p>
            <p className="text-[10px] text-[#94a3b8] mt-0.5">{sourceName} · {fmtRelative(retrievedAt)}</p>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] uppercase font-bold tracking-wider text-[#64748b] hover:text-[#f1f5f9] transition-colors bg-[#0f1a2e] px-2 py-1 rounded border border-[#1e2f4d] cursor-pointer"
        >
          {expanded ? "Hide Details" : "View Integrity Details"}
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3 space-y-3 border-t border-[#1e2f4d]/30 text-xs">
              <div className="flex justify-between items-center text-[#94a3b8] border-b border-[#1e2f4d]/30 pb-2">
                <span>Coverage Ratio (Next 24h)</span>
                <span className="font-mono font-bold text-[#f1f5f9]">{coveragePercent}% ({dataQuality.validHourCount}/{dataQuality.expectedHourCount} hrs)</span>
              </div>

              {warnings.length > 0 && (
                <div>
                  <p className="font-semibold text-[#fbbf24] mb-1.5 flex items-center gap-1.5">
                    <ShieldAlert size={12} /> Warnings
                  </p>
                  <ul className="space-y-1 pl-1">
                    {warnings.map((w, i) => (
                      <li key={i} className="text-[#cbd5e1] leading-relaxed flex items-start gap-1.5">
                        <span className="text-[#fbbf24] mt-0.5">•</span> {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {limitations.length > 0 && (
                <div>
                  <p className="font-semibold text-[#38bdf8] mb-1.5 flex items-center gap-1.5">
                    <Info size={12} /> Interpretation Limitations
                  </p>
                  <ul className="space-y-1 pl-1">
                    {limitations.map((l, i) => (
                      <li key={i} className="text-[#cbd5e1] leading-relaxed flex items-start gap-1.5">
                        <span className="text-[#38bdf8] mt-0.5">•</span> {l}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {warnings.length === 0 && limitations.length === 0 && (
                 <p className="text-[#34d399] flex items-center gap-1.5"><CheckCircle2 size={12}/> High confidence data integrity. No limitations flagged.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
