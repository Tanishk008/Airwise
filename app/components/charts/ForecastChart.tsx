"use client";

import { useState, useMemo, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { ForecastPoint } from "@/lib/api";
import { format, parseISO } from "date-fns";
import { clsx } from "@/lib/utils";

interface PollutantChartProps {
  forecast: ForecastPoint[];
  pollutants?: string[];
  title?: string;
  initialHours?: 6 | 12 | 24;
  showControls?: boolean;
}

const COLORS: Record<string, string> = {
  pm2_5: "#f87171",
  pm10: "#38bdf8",
  nitrogen_dioxide: "#a78bfa",
  ozone: "#34d399",
  sulphur_dioxide: "#fb923c",
  carbon_monoxide: "#fbbf24",
};

const LABELS: Record<string, string> = {
  pm2_5: "PM₂.₅",
  pm10: "PM₁₀",
  nitrogen_dioxide: "NO₂",
  ozone: "O₃",
  sulphur_dioxide: "SO₂",
  carbon_monoxide: "CO",
};

const WHO_THRESHOLDS: Record<string, number> = {
  pm2_5: 15,
  pm10: 45,
};

const NAAQS_THRESHOLDS: Record<string, number> = {
  pm2_5: 60,
  pm10: 100,
};

type TooltipPayload = {
  dataKey: string;
  color?: string;
  value?: number | string;
};

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[#1e2f4d] bg-[#0b1322]/95 p-3 text-xs shadow-2xl backdrop-blur-md">
      <p className="text-[#94a3b8] mb-2 font-medium">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: p.color ?? "#38bdf8" }} />
            <span className="text-[#cbd5e1] font-semibold">{LABELS[p.dataKey] ?? p.dataKey}:</span>
          </div>
          <span className="font-bold mono" style={{ color: p.color }}>
            {typeof p.value === "number" ? p.value.toFixed(1) : p.value} µg/m³
          </span>
        </div>
      ))}
      <p className="text-[#64748b] mt-2 pt-1 border-t border-[#1e2f4d]/60 text-[10px]">
        Open-Meteo CAMS Modelled Forecast
      </p>
    </div>
  );
};

export function ForecastChart({
  forecast,
  pollutants: defaultPollutants = ["pm2_5", "pm10"],
  title,
  initialHours = 24,
  showControls = true,
}: PollutantChartProps) {
  const [hours, setHours] = useState<6 | 12 | 24>(initialHours);
  const [activePollutants, setActivePollutants] = useState<string[]>(defaultPollutants);

  useEffect(() => {
    setActivePollutants(defaultPollutants);
  }, [defaultPollutants]);

  // Available pollutants in dataset
  const availablePollutants = useMemo(() => {
    const set = new Set<string>();
    forecast.forEach(f => set.add(f.pollutant));
    return Array.from(set).filter(p => ["pm2_5", "pm10", "nitrogen_dioxide", "ozone"].includes(p));
  }, [forecast]);

  const togglePollutant = (p: string) => {
    setActivePollutants(prev => {
      if (prev.includes(p) && prev.length > 1) return prev.filter(x => x !== p);
      if (prev.includes(p)) return prev;
      return [...prev, p];
    });
  };

  const chartData = useMemo(() => {
    const now = Date.now();
    const cutoff = now + hours * 3600 * 1000;
    const timeMap = new Map<string, Record<string, number>>();

    forecast
      .filter(f => activePollutants.includes(f.pollutant))
      .filter(f => {
        const t = parseISO(f.time).getTime();
        return t >= now - 3600000 && t <= cutoff;
      })
      .forEach(f => {
        const key = f.time;
        if (!timeMap.has(key)) timeMap.set(key, {});
        timeMap.get(key)![f.pollutant] = f.value;
      });

    return Array.from(timeMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, vals]) => ({
        time,
        label: format(parseISO(time), "HH:mm"),
        ...vals,
      }));
  }, [forecast, activePollutants, hours]);

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center h-40 text-[#64748b] text-xs">
        No forecast data points available for the selected window.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        {title ? (
          <p className="text-[11px] text-[#94a3b8] uppercase tracking-wider font-semibold">{title}</p>
        ) : <div />}

        {showControls && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Pollutant Toggles */}
            <div className="flex items-center gap-1 bg-[#0b1322] p-0.5 rounded-lg border border-[#1e2f4d]">
              {availablePollutants.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePollutant(p)}
                  className={clsx(
                    "px-2 py-1 text-[10px] font-bold rounded-md transition-colors cursor-pointer",
                    activePollutants.includes(p)
                      ? "bg-[#14b8a6]/20 text-[#2dd4bf] border border-[#14b8a6]/40"
                      : "text-[#64748b] hover:text-[#94a3b8]"
                  )}
                >
                  {LABELS[p] ?? p}
                </button>
              ))}
            </div>

            {/* Time Window Buttons */}
            <div className="flex items-center gap-1 bg-[#0b1322] p-0.5 rounded-lg border border-[#1e2f4d]">
              {([6, 12, 24] as const).map(h => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHours(h)}
                  className={clsx(
                    "px-2 py-1 text-[10px] font-bold rounded-md transition-colors cursor-pointer",
                    hours === h
                      ? "bg-[#1e2f4d] text-[#f1f5f9]"
                      : "text-[#64748b] hover:text-[#94a3b8]"
                  )}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
          <defs>
            {activePollutants.map(p => (
              <linearGradient key={p} id={`grad-${p}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS[p] ?? "#38bdf8"} stopOpacity={0.35} />
                <stop offset="95%" stopColor={COLORS[p] ?? "#38bdf8"} stopOpacity={0.0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={6}
            formatter={(val) => (
              <span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>{LABELS[val] ?? val}</span>
            )}
          />

          {/* Reference Lines for Standards */}
          {activePollutants.includes("pm2_5") && (
            <>
              <ReferenceLine
                y={WHO_THRESHOLDS.pm2_5}
                stroke="#fbbf24"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                strokeOpacity={0.7}
                label={{ value: "WHO PM2.5 (15)", position: "right", fontSize: 9, fill: "#fbbf24" }}
              />
              <ReferenceLine
                y={NAAQS_THRESHOLDS.pm2_5}
                stroke="#f87171"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                strokeOpacity={0.7}
                label={{ value: "CPCB PM2.5 (60)", position: "right", fontSize: 9, fill: "#f87171" }}
              />
            </>
          )}

          {activePollutants.includes("pm10") && !activePollutants.includes("pm2_5") && (
            <ReferenceLine
              y={NAAQS_THRESHOLDS.pm10}
              stroke="#f87171"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              strokeOpacity={0.7}
              label={{ value: "CPCB PM10 (100)", position: "right", fontSize: 9, fill: "#f87171" }}
            />
          )}

          {activePollutants.map(p => (
            <Area
              key={p}
              type="monotone"
              dataKey={p}
              stroke={COLORS[p] ?? "#38bdf8"}
              strokeWidth={2}
              fill={`url(#grad-${p})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: COLORS[p] ?? "#38bdf8" }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex items-center justify-between text-[10px] text-[#64748b] pt-1 px-1">
        <span>Dashed lines: Amber = WHO AQG (15 µg/m³), Red = India CPCB NAAQS (60 µg/m³)</span>
        <span className="font-mono">ECMWF CAMS · µg/m³</span>
      </div>
    </div>
  );
}

export function PM25TrendChart({ forecast }: { forecast: ForecastPoint[] }) {
  return <ForecastChart forecast={forecast} pollutants={["pm2_5"]} title="PM₂.₅ Hourly Forecast (µg/m³)" />;
}

export function MultiPollutantChart({ forecast }: { forecast: ForecastPoint[] }) {
  return (
    <ForecastChart
      forecast={forecast}
      pollutants={["pm2_5", "pm10", "nitrogen_dioxide", "ozone"]}
      title="Multi-Pollutant Trajectory (µg/m³)"
    />
  );
}

