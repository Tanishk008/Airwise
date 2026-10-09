"use client";

import { useApp } from "@/lib/context";
import { MapPin, RefreshCw, AlertTriangle, Bell, CheckCircle2, ChevronRight, X } from "lucide-react";
import { clsx, fmtRelative } from "@/lib/utils";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

export default function TopBar() {
  const {
    campuses,
    selectedCampus,
    setCampus,
    loading,
    error,
    refresh,
    backendOnline,
    lastRefreshedAt,
    alerts,
  } = useApp();

  const [spinning, setSpinning] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [timeAgo, setTimeAgo] = useState<string>("just now");
  const router = useRouter();

  useEffect(() => {
    const update = () => {
      if (!lastRefreshedAt) return setTimeAgo("just now");
      const diffSec = Math.floor((Date.now() - lastRefreshedAt.getTime()) / 1000);
      if (diffSec < 15) setTimeAgo("just now");
      else if (diffSec < 60) setTimeAgo(`${diffSec}s ago`);
      else setTimeAgo(`${Math.floor(diffSec / 60)}m ago`);
    };
    update();
    const interval = setInterval(update, 10000);
    return () => clearInterval(interval);
  }, [lastRefreshedAt]);

  const handleRefresh = () => {
    setSpinning(true);
    refresh();
    setTimeout(() => setSpinning(false), 900);
  };

  const handleAlertClick = (link: string, campusId: string) => {
    setCampus(campusId);
    setAlertsOpen(false);
    router.push(link);
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 md:px-6 py-2.5 bg-[#0b1322]/90 backdrop-blur-md border-b border-[#1e2f4d]">
      {/* Mobile spacer for hamburger */}
      <div className="w-8 lg:hidden" />

      {/* Campus selector */}
      <div className="flex items-center gap-2 max-w-sm flex-1">
        <MapPin size={16} className="text-[#14b8a6] shrink-0" />
        {loading ? (
          <div className="shimmer h-8 w-44 rounded-lg" />
        ) : error ? (
          <div className="flex items-center gap-2 text-[#f87171] text-xs">
            <AlertTriangle size={13} />
            Backend offline
          </div>
        ) : (
          <div className="relative w-full max-w-[280px]">
            <select
              value={selectedCampus?.campusId ?? ""}
              onChange={e => setCampus(e.target.value)}
              className="w-full bg-[#0f1a2e] border border-[#1e2f4d] text-[#f1f5f9] text-xs font-semibold rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#14b8a6] hover:border-[#2d436b] transition-colors cursor-pointer"
              aria-label="Select campus location"
            >
              {campuses.map(c => (
                <option key={c.campusId} value={c.campusId}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right Telemetry Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Campus city badge */}
        {selectedCampus && (
          <div className="hidden md:flex items-center gap-2 text-[11px] text-[#94a3b8]">
            <span className="px-2 py-0.5 rounded bg-[#0f1a2e] border border-[#1e2f4d] font-mono">
              {selectedCampus.latitude.toFixed(2)}°N, {selectedCampus.longitude.toFixed(2)}°E
            </span>
          </div>
        )}

        {/* Refresh feedback */}
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-[#64748b]">
          <span>Updated {timeAgo}</span>
        </div>

        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          disabled={!backendOnline}
          className={clsx(
            "p-1.5 rounded-lg border transition-all duration-200",
            backendOnline
              ? "bg-[#0f1a2e] border-[#1e2f4d] hover:border-[#14b8a6] text-[#94a3b8] hover:text-[#f1f5f9]"
              : "border-[#1e2f4d] text-[#64748b] opacity-40 cursor-not-allowed"
          )}
          aria-label="Refresh data"
          title="Refresh live environmental telemetry"
        >
          <RefreshCw size={14} className={spinning ? "animate-spin text-[#14b8a6]" : ""} />
        </button>

        {/* Alerts Inbox Bell */}
        <div className="relative">
          <button
            onClick={() => setAlertsOpen(!alertsOpen)}
            className={clsx(
              "relative p-1.5 rounded-lg border transition-all duration-200",
              alerts.length > 0
                ? "bg-[#0f1a2e] border-[#1e2f4d] hover:border-[#fbbf24] text-[#fbbf24]"
                : "bg-[#0f1a2e] border-[#1e2f4d] hover:border-[#2d436b] text-[#94a3b8]"
            )}
            aria-label="Alerts inbox"
            title="System alerts & pending approvals"
          >
            <Bell size={14} />
            {alerts.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#ef4444] text-[9px] font-bold text-white shadow">
                {alerts.length}
              </span>
            )}
          </button>

          {/* Alerts Dropdown Modal */}
          <AnimatePresence>
            {alertsOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs"
                  onClick={() => setAlertsOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 z-50 w-80 md:w-96 rounded-xl bg-[#0f1a2e] border border-[#1e2f4d] shadow-2xl p-4"
                >
                  <div className="flex items-center justify-between pb-3 border-b border-[#1e2f4d] mb-3">
                    <div className="flex items-center gap-2">
                      <Bell size={14} className="text-[#14b8a6]" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#f1f5f9]">
                        Operational Alerts ({alerts.length})
                      </h3>
                    </div>
                    <button
                      onClick={() => setAlertsOpen(false)}
                      className="text-[#64748b] hover:text-[#f1f5f9] p-1 rounded"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {alerts.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[#64748b]">
                      <CheckCircle2 size={24} className="mx-auto mb-2 text-[#34d399]" />
                      <p className="text-[#94a3b8] font-medium">All campuses normal</p>
                      <p className="text-[11px] mt-0.5">No active threshold alerts or pending plans</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {alerts.map(a => (
                        <div
                          key={a.id}
                          onClick={() => handleAlertClick(a.link, a.campusId)}
                          className={clsx(
                            "p-3 rounded-lg border text-left cursor-pointer transition-colors group",
                            a.type === "action_recommended"
                              ? "border-[#ef4444]/40 bg-[#ef4444]/5 hover:bg-[#ef4444]/10"
                              : a.type === "draft_plan"
                              ? "border-[#fbbf24]/40 bg-[#fbbf24]/5 hover:bg-[#fbbf24]/10"
                              : "border-[#1e2f4d] bg-[#0b1322] hover:bg-[#15233d]"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-[#f1f5f9]">{a.title}</p>
                            <ChevronRight size={12} className="text-[#64748b] group-hover:text-[#14b8a6] shrink-0 mt-0.5" />
                          </div>
                          <p className="text-[11px] text-[#94a3b8] mt-1 leading-snug">{a.message}</p>
                          <p className="text-[10px] text-[#64748b] mt-2 mono">{fmtRelative(a.timestamp)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

