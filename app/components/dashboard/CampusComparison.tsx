"use client";

import { useState, useEffect } from "react";
import { Campus, AirQualityResponse, Assessment, api } from "@/lib/api";
import { Card, Badge, Button } from "@/components/ui/Card";
import { statusConfig, clsx } from "@/lib/utils";
import { Layers, MapPin, X, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useApp } from "@/lib/context";

interface CampusTelemetry {
  campus: Campus;
  air: AirQualityResponse | null;
  latest: Assessment | null;
  loading: boolean;
}

export function CampusComparisonModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { campuses, setCampus } = useApp();
  const [data, setData] = useState<CampusTelemetry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !campuses.length) return;
    setLoading(true);

    const loadAll = async () => {
      const results = await Promise.all(
        campuses.map(async c => {
          try {
            const [air, asmt] = await Promise.all([
              api.airQuality(c.campusId),
              api.getAssessments(c.campusId),
            ]);
            return {
              campus: c,
              air,
              latest: asmt.assessments[0] ?? null,
              loading: false,
            };
          } catch {
            return {
              campus: c,
              air: null,
              latest: null,
              loading: false,
            };
          }
        })
      );
      setData(results);
      setLoading(false);
    };

    loadAll();
  }, [isOpen, campuses]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-4xl bg-[#0b1322] border border-[#1e2f4d] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 md:p-6 border-b border-[#1e2f4d] bg-[#0f1a2e]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#14b8a6]/20 border border-[#14b8a6]/40 flex items-center justify-center text-[#2dd4bf]">
                <Layers size={16} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#f1f5f9]">Delhi-NCR Regional Campus Comparison</h3>
                <p className="text-xs text-[#94a3b8]">Live atmospheric model telemetry across monitored sites</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-[#15233d] transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 md:p-6 overflow-y-auto space-y-4">
            {loading ? (
              <div className="grid md:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="shimmer h-48 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-4">
                {data.map(({ campus, air, latest }) => {
                  const pm25 = air?.modelledCurrent?.pm2_5 ?? null;
                  const pm10 = air?.modelledCurrent?.pm10 ?? null;
                  const cfg = latest ? statusConfig[latest.status] : null;

                  return (
                    <Card
                      key={campus.campusId}
                      className={clsx(
                        "flex flex-col justify-between transition-all",
                        latest?.status === "action_recommended"
                          ? "border-[#ef4444]/50 bg-[#ef4444]/5"
                          : latest?.status === "review_required"
                          ? "border-[#fbbf24]/50 bg-[#fbbf24]/5"
                          : "border-[#1e2f4d]"
                      )}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5">
                            <MapPin size={14} className="text-[#14b8a6] shrink-0" />
                            <h4 className="text-sm font-bold text-[#f1f5f9]">{campus.name}</h4>
                          </div>
                          <Badge variant="default">{campus.city}</Badge>
                        </div>
                        <p className="text-[10px] text-[#64748b] font-mono mb-4">
                          {campus.latitude.toFixed(3)}°N, {campus.longitude.toFixed(3)}°E
                        </p>

                        <div className="grid grid-cols-2 gap-2 mb-4">
                          <div className="p-2 rounded-lg bg-[#0b1322] border border-[#1e2f4d]">
                            <p className="text-[10px] text-[#94a3b8] uppercase">PM₂.₅ (now)</p>
                            <p className={clsx("text-xl font-bold mono mt-0.5", pm25 && pm25 > 60 ? "text-[#f87171]" : pm25 && pm25 > 15 ? "text-[#fbbf24]" : "text-[#34d399]")}>
                              {pm25 !== null ? pm25.toFixed(1) : "—"}
                            </p>
                            <p className="text-[9px] text-[#64748b]">µg/m³ · CAMS</p>
                          </div>
                          <div className="p-2 rounded-lg bg-[#0b1322] border border-[#1e2f4d]">
                            <p className="text-[10px] text-[#94a3b8] uppercase">PM₁₀ (now)</p>
                            <p className={clsx("text-xl font-bold mono mt-0.5", pm10 && pm10 > 100 ? "text-[#f87171]" : pm10 && pm10 > 45 ? "text-[#fbbf24]" : "text-[#34d399]")}>
                              {pm10 !== null ? pm10.toFixed(1) : "—"}
                            </p>
                            <p className="text-[9px] text-[#64748b]">µg/m³ · CAMS</p>
                          </div>
                        </div>

                        {cfg ? (
                          <div className={clsx("p-2.5 rounded-lg border text-xs mb-3", cfg.bg)}>
                            <p className={clsx("font-bold text-xs", cfg.color)}>{cfg.label}</p>
                            <p className="text-[10px] text-[#94a3b8] mt-0.5">
                              Activity: {latest?.activity.replace(/_/g, " ")}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-[#64748b] italic mb-3">No recent assessment</p>
                        )}
                      </div>

                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full justify-between mt-2"
                        onClick={() => {
                          setCampus(campus.campusId);
                          onClose();
                        }}
                      >
                        <span>Switch Console to this Campus</span>
                        <ArrowRight size={13} />
                      </Button>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[#1e2f4d] bg-[#0f1a2e] flex items-center justify-between text-xs text-[#64748b]">
            <span>Model forecasts retrieved in parallel from Open-Meteo ECMWF CAMS API.</span>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
