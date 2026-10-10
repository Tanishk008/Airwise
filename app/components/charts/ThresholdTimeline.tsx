"use client";

import { useMemo, useState } from "react";
import { ForecastPoint } from "@/lib/api";
import { parseISO, format } from "date-fns";
import { clsx } from "@/lib/utils";
import { AlertTriangle, Clock, ShieldCheck } from "lucide-react";

interface ThresholdTimelineProps {
  forecast: ForecastPoint[];
}

export function ThresholdTimeline({ forecast }: ThresholdTimelineProps) {
  const [now] = useState(() => Date.now());

  const analysis = useMemo(() => {
    const pm25Points = forecast
      .filter(f => f.pollutant === "pm2_5" && parseISO(f.time).getTime() >= now - 3600000)
      .slice(0, 24);

    if (!pm25Points.length) return null;

    const timeline = pm25Points.map(pt => {
      const val = pt.value;
      const isNAAQS = val > 60;
      const isWHO = val > 15;
      return {
        time: pt.time,
        label: format(parseISO(pt.time), "HH"),
        fullLabel: format(parseISO(pt.time), "HH:mm"),
        value: val,
        status: isNAAQS ? "danger" : isWHO ? "warning" : "ok",
      };
    });

    let maxVal = 0;
    let maxHour = "";
    let naaqsBreachCount = 0;
    let whoBreachCount = 0;

    for (const pt of timeline) {
      if (pt.value > maxVal) {
        maxVal = pt.value;
        maxHour = pt.fullLabel;
      }
      if (pt.value > 60) naaqsBreachCount++;
      else if (pt.value > 15) whoBreachCount++;
    }

    // Best outdoor window (lowest 3 consecutive hours)
    let bestWindowStart = timeline[0]?.fullLabel ?? "N/A";
    let minWindowSum = Infinity;
    if (timeline.length >= 3) {
      for (let i = 0; i <= timeline.length - 3; i++) {
        const sum = timeline[i].value + timeline[i + 1].value + timeline[i + 2].value;
        if (sum < minWindowSum) {
          minWindowSum = sum;
          bestWindowStart = timeline[i].fullLabel;
        }
      }
    }

    return {
      timeline,
      maxVal,
      maxHour,
      naaqsBreachCount,
      whoBreachCount,
      bestWindowStart,
    };
  }, [forecast, now]);

  if (!analysis) return null;

  return (
    <div className="rounded-xl border border-[#1e2f4d] bg-[#0b1322] p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-[#14b8a6]" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#f1f5f9]">
            24-Hour Threshold Crossing Timeline (PM₂.₅)
          </h4>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-[#94a3b8]">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#34d399]" /> Safe (&le;15)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#fbbf24]" /> &gt;WHO (15)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#f87171]" /> &gt;NAAQS (60)
          </span>
        </div>
      </div>

      {/* Hourly color grid */}
      <div className="grid grid-cols-12 sm:grid-cols-24 gap-1 pt-1">
        {analysis.timeline.map((item, i) => (
          <div
            key={i}
            className="flex flex-col items-center group relative cursor-pointer"
          >
            <div
              className={clsx(
                "w-full h-8 rounded-sm transition-all group-hover:scale-105 flex items-center justify-center text-[9px] font-bold mono",
                item.status === "danger"
                  ? "bg-[#ef4444]/25 border border-[#ef4444]/60 text-[#f87171]"
                  : item.status === "warning"
                  ? "bg-[#fbbf24]/20 border border-[#fbbf24]/50 text-[#fbbf24]"
                  : "bg-[#10b981]/20 border border-[#10b981]/50 text-[#34d399]"
              )}
            >
              {item.label}
            </div>

            {/* Hover Tooltip */}
            <div className="hidden group-hover:block absolute bottom-full mb-1 z-30 w-28 p-1.5 rounded-md bg-[#0f1a2e] border border-[#1e2f4d] shadow-xl text-[10px] text-center pointer-events-none">
              <p className="text-[#94a3b8] font-medium">{item.fullLabel}</p>
              <p className="font-bold mono text-[#f1f5f9]">{item.value.toFixed(1)} µg/m³</p>
              <p className={clsx("text-[9px] mt-0.5", item.status === "danger" ? "text-[#f87171]" : item.status === "warning" ? "text-[#fbbf24]" : "text-[#34d399]")}>
                {item.status === "danger" ? "Exceeds NAAQS" : item.status === "warning" ? "Exceeds WHO" : "Within WHO"}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Insights Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-[#1e2f4d]/60 text-xs">
        <div className="flex items-center gap-2 p-2 rounded-lg bg-[#0f1a2e]/60 border border-[#1e2f4d]/40">
          <AlertTriangle size={14} className="text-[#f87171] shrink-0" />
          <span className="text-[#94a3b8] text-[11px]">
            Peak pollution: <strong className="text-[#f1f5f9] font-mono">{analysis.maxVal.toFixed(1)} µg/m³</strong> at {analysis.maxHour}
          </span>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-lg bg-[#0f1a2e]/60 border border-[#1e2f4d]/40">
          <ShieldCheck size={14} className="text-[#14b8a6] shrink-0" />
          <span className="text-[#94a3b8] text-[11px]">
            Optimal window: start around <strong className="text-[#2dd4bf]">{analysis.bestWindowStart}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-lg bg-[#0f1a2e]/60 border border-[#1e2f4d]/40">
          <Clock size={14} className="text-[#fbbf24] shrink-0" />
          <span className="text-[#94a3b8] text-[11px]">
            <strong className="text-[#fbbf24]">{analysis.naaqsBreachCount}h</strong> above CPCB limit (60 µg/m³)
          </span>
        </div>
      </div>
    </div>
  );
}
