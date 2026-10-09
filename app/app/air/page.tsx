"use client";

import { useEffect, useState, useCallback } from "react";
import { useApp } from "@/lib/context";
import { api, AirQualityResponse, AirwiseApiError } from "@/lib/api";
import { Card, ErrorCard, LoadingCard, WarnBanner, Disclaimer, SectionHeader, DataProvenance, Badge } from "@/components/ui/Card";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { fmtDate, pollutantLabel, getDataFreshness, clsx } from "@/lib/utils";
import { motion } from "framer-motion";
import { Wind, Database, RefreshCw, AlertOctagon, Info, ShieldAlert } from "lucide-react";
import { format, parseISO } from "date-fns";

const POLLUTANTS = ["pm2_5", "pm10", "nitrogen_dioxide", "ozone"];
const POLL_COLORS: Record<string, string> = {
  pm2_5: "text-[#f87171]",
  pm10: "text-[#38bdf8]",
  nitrogen_dioxide: "text-[#a78bfa]",
  ozone: "text-[#34d399]",
};
const WHO_THRESHOLDS: Record<string, number> = { pm2_5: 15, pm10: 45 };
const NAAQS_THRESHOLDS: Record<string, number> = { pm2_5: 60, pm10: 100 };

function PollutantCard({ pollutant, currentValue, unit, dataMode, provider, time }: {
  pollutant: string;
  currentValue: number | null;
  unit: string;
  dataMode: string;
  provider: string;
  time: string;
}) {
  const who = WHO_THRESHOLDS[pollutant];
  const naaqs = NAAQS_THRESHOLDS[pollutant];
  const val = currentValue;
  const exceedsNAAQS = val !== null && naaqs && val > naaqs;
  const exceedsWHO = val !== null && who && val > who;
  const freshness = getDataFreshness(time);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={clsx(
        "rounded-xl p-4 border transition-all bg-[#0f1a2e]",
        exceedsNAAQS ? "border-[#ef4444]/60 glow-red" :
        exceedsWHO ? "border-[#fbbf24]/60 glow-amber" :
        "border-[#1e2f4d]"
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[11px] text-[#94a3b8] uppercase tracking-wider font-semibold">{pollutantLabel(pollutant)}</p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className={clsx("text-2xl md:text-3xl font-bold mono", POLL_COLORS[pollutant] ?? "text-[#f1f5f9]")}>
              {val !== null ? val.toFixed(1) : "—"}
            </span>
            <span className="text-[#64748b] text-xs font-mono">{unit}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={clsx(
            "text-[9px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider",
            freshness.fresh ? "text-[#34d399] bg-[#34d399]/10 border border-[#34d399]/30" : "text-[#fbbf24] bg-[#fbbf24]/10 border border-[#fbbf24]/30"
          )}>
            {freshness.label}
          </span>
        </div>
      </div>

      {/* Threshold comparison bars */}
      {val !== null && who && (
        <div className="space-y-2 mb-3 pt-1 border-t border-[#1e2f4d]/50">
          <div>
            <div className="flex justify-between text-[10px] text-[#94a3b8] mb-1">
              <span>WHO AQG 2021 (24h)</span>
              <span className="font-mono">{who} µg/m³</span>
            </div>
            <div className="h-1.5 rounded-full bg-[#1e2f4d]">
              <div
                className={clsx("h-full rounded-full transition-all duration-500", exceedsWHO ? "bg-[#fbbf24]" : "bg-[#34d399]")}
                style={{ width: `${Math.min(100, (val / (naaqs || who * 2)) * 100).toFixed(1)}%` }}
              />
            </div>
          </div>
          {naaqs && (
            <div>
              <div className="flex justify-between text-[10px] text-[#94a3b8] mb-1">
                <span>India CPCB NAAQS (24h)</span>
                <span className="font-mono">{naaqs} µg/m³</span>
              </div>
              <div className="h-1.5 rounded-full bg-[#1e2f4d]">
                <div
                  className={clsx("h-full rounded-full transition-all duration-500", exceedsNAAQS ? "bg-[#f87171]" : "bg-[#38bdf8]")}
                  style={{ width: `${Math.min(100, (val / (naaqs * 1.5)) * 100).toFixed(1)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <DataProvenance mode={dataMode} provider={provider} timestamp={fmtDate(time)} />

      {exceedsNAAQS ? (
        <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-[#f87171] font-semibold">
          <AlertOctagon size={11} />
          <span>Exceeds India CPCB 24h standard</span>
        </div>
      ) : exceedsWHO ? (
        <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-[#fbbf24] font-semibold">
          <AlertOctagon size={11} />
          <span>Exceeds WHO 2021 guideline</span>
        </div>
      ) : (
        <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-[#34d399]">
          <span>✓ Within guideline thresholds</span>
        </div>
      )}
    </motion.div>
  );
}

export default function AirPage() {
  const { selectedCampus, refreshKey } = useApp();
  const [air, setAir] = useState<AirQualityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPollutants, setSelectedPollutants] = useState<string[]>(["pm2_5", "pm10"]);

  const load = useCallback(async () => {
    if (!selectedCampus) return;
    setLoading(true);
    setError(null);
    try {
      setAir(await api.airQuality(selectedCampus.campusId));
    } catch (e) {
      setError(e instanceof AirwiseApiError ? e.message : "Failed to load atmospheric intelligence");
    } finally {
      setLoading(false);
    }
  }, [selectedCampus]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (!selectedCampus) return <div className="text-[#64748b] text-sm">Select a campus.</div>;

  const togglePollutant = (pollutant: string) => {
    setSelectedPollutants(prev => {
      if (prev.includes(pollutant) && prev.length > 1) return prev.filter(p => p !== pollutant);
      if (prev.includes(pollutant)) return prev;
      return [...prev, pollutant];
    });
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <SectionHeader
        title="Air Intelligence & Atmospheric Telemetry"
        description={`Continuous pollutant forecasts and station observations for ${selectedCampus.name}`}
      />

      {/* Data mode explanation cards */}
      <div className="grid md:grid-cols-2 gap-3">
        <Card className="border-[#1e2f4d] bg-[#0f1a2e]">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#38bdf8]/15 border border-[#38bdf8]/30 flex items-center justify-center shrink-0">
              <Database size={15} className="text-[#38bdf8]" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#f1f5f9] mb-1">Modelled Atmospheric Forecast</p>
              <p className="text-[11px] text-[#94a3b8] leading-relaxed">
                Open-Meteo Air Quality API powered by ECMWF CAMS (Copernicus Atmosphere Monitoring Service) global model.
                Hourly predictions calculated for the campus grid coordinates ({selectedCampus.latitude.toFixed(3)}°N, {selectedCampus.longitude.toFixed(3)}°E).
              </p>
            </div>
          </div>
        </Card>

        <Card className="border-[#1e2f4d] bg-[#0f1a2e]">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#34d399]/15 border border-[#34d399]/30 flex items-center justify-center shrink-0">
              <Wind size={15} className="text-[#34d399]" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#f1f5f9] mb-1">Ground Station Measurements</p>
              <p className="text-[11px] text-[#94a3b8] leading-relaxed">
                OpenAQ v3 station sensor network. When a verified station is linked to the campus,
                physical sensor observations appear alongside modelled forecasts with station metadata.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <LoadingCard key={i} />)}
        </div>
      )}

      {error && <ErrorCard message={error} onRetry={load} />}

      {air && (
        <>
          {/* Warnings */}
          {air.warnings.map((w, i) => <WarnBanner key={i}>{w}</WarnBanner>)}

          {/* Pollutant cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-[#94a3b8] uppercase tracking-wider font-semibold flex items-center gap-2">
                <RefreshCw size={12} className="text-[#14b8a6]" />
                Current Surface Concentrations · Retrieved {fmtDate(air.retrievedAt)}
              </p>
              <Badge variant="teal">CAMS Model</Badge>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {POLLUTANTS.map(p => {
                const now = parseISO(air.retrievedAt).getTime();
                const nearest = air.forecast
                  .filter(f => f.pollutant === p)
                  .sort((a, b) => Math.abs(parseISO(a.time).getTime() - now) - Math.abs(parseISO(b.time).getTime() - now))[0];
                return (
                  <PollutantCard
                    key={p}
                    pollutant={p}
                    currentValue={nearest?.value ?? null}
                    unit={nearest?.unit ?? "µg/m³"}
                    dataMode={nearest?.dataMode ?? "forecast"}
                    provider={nearest?.provider ?? "Open-Meteo"}
                    time={nearest?.time ?? air.retrievedAt}
                  />
                );
              })}
            </div>
          </div>

          {/* Interactive Chart */}
          <Card>
            <ForecastChart
              forecast={air.forecast}
              pollutants={selectedPollutants}
              title="Atmospheric Trajectory Forecast (Hourly)"
              showControls={true}
            />
          </Card>

          {/* Data Honesty Notice */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#0b1322] border border-[#1e2f4d] text-xs text-[#94a3b8]">
            <Info size={14} className="text-[#14b8a6] shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              <strong>Data Honesty Standard:</strong> Individual pollutant concentrations are reported separately with their original physical units (µg/m³).
              We do not average disparate chemical agents into an arbitrary composite index.
            </p>
          </div>

          {/* Detailed Hourly Projection Table */}
          <Card>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <p className="text-xs text-[#94a3b8] uppercase tracking-wider font-semibold">
                Hourly Projection Schedule (Next 12 Hours)
              </p>
              <div className="flex items-center gap-1.5">
                {POLLUTANTS.map(p => (
                  <button
                    key={p}
                    onClick={() => togglePollutant(p)}
                    className={clsx(
                      "px-2 py-0.5 text-[10px] font-bold rounded border transition-colors cursor-pointer",
                      selectedPollutants.includes(p)
                        ? "bg-[#14b8a6]/20 border-[#14b8a6]/50 text-[#2dd4bf]"
                        : "bg-[#0b1322] border-[#1e2f4d] text-[#64748b]"
                    )}
                  >
                    {pollutantLabel(p)}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1e2f4d] text-[#64748b]">
                    <th className="text-left py-2.5 px-3 font-semibold">Valid Timestamp</th>
                    {selectedPollutants.map(p => (
                      <th key={p} className={clsx("text-right py-2.5 px-3 font-semibold", POLL_COLORS[p] ?? "text-[#f1f5f9]")}>
                        {pollutantLabel(p)} (µg/m³)
                      </th>
                    ))}
                    <th className="text-left py-2.5 px-3 font-semibold">Status / Exceedance</th>
                    <th className="text-right py-2.5 px-3 font-semibold">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const now = parseISO(air.retrievedAt).getTime();
                    const next12 = air.forecast
                      .filter(f => f.pollutant === "pm2_5" && parseISO(f.time).getTime() >= now)
                      .slice(0, 12)
                      .map(f => f.time);

                    return next12.map((t, i) => {
                      const row: Record<string, number | null> = {};
                      selectedPollutants.forEach(p => {
                        row[p] = air.forecast.find(f => f.pollutant === p && f.time === t)?.value ?? null;
                      });

                      const pm25 = row["pm2_5"];
                      const exceedsNAAQS = pm25 !== null && pm25 > 60;
                      const exceedsWHO = pm25 !== null && pm25 > 15;

                      return (
                        <tr
                          key={t}
                          className={clsx(
                            "border-b border-[#1e2f4d]/50 hover:bg-[#15233d]/50 transition-colors",
                            i % 2 === 0 ? "bg-transparent" : "bg-[#0b1322]/40"
                          )}
                        >
                          <td className="py-2 px-3 text-[#cbd5e1] mono font-medium">
                            {format(parseISO(t), "dd MMM · HH:mm")}
                          </td>
                          {selectedPollutants.map(p => (
                            <td key={p} className={clsx("py-2 px-3 text-right mono font-bold", POLL_COLORS[p] ?? "text-[#f1f5f9]")}>
                              {row[p] !== null ? (row[p] as number).toFixed(1) : "—"}
                            </td>
                          ))}
                          <td className="py-2 px-3">
                            {exceedsNAAQS ? (
                              <Badge variant="red">&gt; CPCB (60)</Badge>
                            ) : exceedsWHO ? (
                              <Badge variant="amber">&gt; WHO (15)</Badge>
                            ) : (
                              <Badge variant="green">Safe (&le;15)</Badge>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right text-[11px] text-[#64748b]">
                            ECMWF CAMS
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Disclaimer />
    </div>
  );
}

