"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useApp } from "@/lib/context";
import { api, Assessment, ActionPlan, Incident, IncidentType, AirwiseApiError } from "@/lib/api";
import { Card, ErrorCard, LoadingCard, SectionHeader, Button, Badge, WarnBanner, Disclaimer } from "@/components/ui/Card";
import AssessmentCard from "@/components/assessment/AssessmentCard";
import { fmtDate, statusConfig, fmtDuration, clsx } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { AlertOctagon, TrendingUp, Download, Search, Filter, Eye, X, CheckCircle2 } from "lucide-react";

const INCIDENT_ICONS: Record<IncidentType, string> = {
  smoke: "🔥",
  dust: "💨",
  other: "⚠️",
};

export default function HistoryPage() {
  const { selectedCampus, refreshKey, refresh } = useApp();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [plans, setPlans] = useState<ActionPlan[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search and Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Assessment Inspection Modal
  const [inspectAssessment, setInspectAssessment] = useState<Assessment | null>(null);

  // Incident form
  const [incType, setIncType] = useState<IncidentType>("smoke");
  const [incDesc, setIncDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [incError, setIncError] = useState<string | null>(null);
  const [incSuccess, setIncSuccess] = useState(false);

  const load = useCallback(async () => {
    if (!selectedCampus) return;
    setLoading(true);
    setError(null);
    try {
      const [aData, pData, iData] = await Promise.all([
        api.getAssessments(selectedCampus.campusId),
        api.getActionPlans(selectedCampus.campusId),
        api.getIncidents(selectedCampus.campusId),
      ]);
      setAssessments(aData.assessments);
      setPlans(pData.plans);
      setIncidents(iData.incidents);
    } catch (e) {
      setError(e instanceof AirwiseApiError ? e.message : "Failed to load historical archives");
    } finally {
      setLoading(false);
    }
  }, [selectedCampus]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const submitIncident = async () => {
    if (!selectedCampus || !incDesc.trim()) return;
    setSubmitting(true);
    setIncError(null);
    try {
      await api.createIncident(selectedCampus.campusId, incType, incDesc.trim());
      setIncDesc("");
      setIncSuccess(true);
      setTimeout(() => setIncSuccess(false), 3500);
      await load();
      refresh();
    } catch (e) {
      setIncError(e instanceof AirwiseApiError ? e.message : "Incident submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Export structured compliance JSON
  const handleExportJSON = () => {
    if (!selectedCampus) return;
    const exportData = {
      campus: selectedCampus,
      exportedAt: new Date().toISOString(),
      governanceGuideline: "WHO-AQG-2021 + India-CPCB-NAAQS-2009",
      assessments,
      actionPlans: plans,
      incidents,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `airwise-compliance-${selectedCampus.campusId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!selectedCampus) return <div className="text-[#64748b] text-sm">Select a campus.</div>;

  // Filtered assessments
  const filteredAssessments = assessments.filter(a => {
    if (activityFilter !== "all" && a.activity !== activityFilter) return false;
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        a.assessmentId.toLowerCase().includes(q) ||
        a.activity.toLowerCase().includes(q) ||
        a.status.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Metrics
  const allActions = plans.flatMap(p => p.actions);
  const completedActions = allActions.filter(a => a.status === "completed");
  const approvedPlans = plans.filter(p => p.approvedAt);
  const avgResponseMs = approvedPlans.length
    ? approvedPlans.reduce((s, p) => s + (new Date(p.approvedAt!).getTime() - new Date(p.createdAt).getTime()), 0) / approvedPlans.length
    : null;

  // Status distribution for chart
  const statusDist = [
    { key: "action_recommended", label: "Action Recom.", color: "#f87171" },
    { key: "review_required", label: "Review Req.", color: "#fbbf24" },
    { key: "monitor", label: "Monitor", color: "#34d399" },
    { key: "insufficient_data", label: "Insufficient", color: "#64748b" },
  ].map(s => ({
    status: s.label,
    count: assessments.filter(a => a.status === s.key).length,
    color: s.color,
  }));

  return (
    <div className="space-y-6 max-w-6xl">
      <SectionHeader
        title="Reports, Operational Metrics & Incident Archive"
        description={`Audit trail and historical evaluations for ${selectedCampus.name}`}
        action={
          <Button
            size="sm"
            variant="secondary"
            onClick={handleExportJSON}
            icon={<Download size={13} />}
          >
            Export Compliance Audit (JSON)
          </Button>
        }
      />

      {loading && <LoadingCard lines={5} />}
      {error && <ErrorCard message={error} onRetry={load} />}

      {!loading && !error && (
        <>
          {/* Metrics row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <Card className="border-[#1e2f4d] bg-[#0f1a2e]">
              <p className="text-[11px] text-[#94a3b8] uppercase tracking-wider font-semibold mb-1">Total Assessments</p>
              <p className="text-2xl md:text-3xl font-bold mono text-[#f1f5f9]">{assessments.length}</p>
            </Card>
            <Card className="border-[#1e2f4d] bg-[#0f1a2e]">
              <p className="text-[11px] text-[#94a3b8] uppercase tracking-wider font-semibold mb-1">Actions Executed</p>
              <p className="text-2xl md:text-3xl font-bold mono text-[#34d399]">
                {completedActions.length}<span className="text-[#64748b] text-sm">/{allActions.length}</span>
              </p>
            </Card>
            <Card className="border-[#1e2f4d] bg-[#0f1a2e]">
              <p className="text-[11px] text-[#94a3b8] uppercase tracking-wider font-semibold mb-1">Avg. Sign-Off Latency</p>
              <p className="text-2xl md:text-3xl font-bold mono text-[#38bdf8]">
                {avgResponseMs !== null ? fmtDuration(avgResponseMs) : "—"}
              </p>
            </Card>
            <Card className="border-[#1e2f4d] bg-[#0f1a2e]">
              <p className="text-[11px] text-[#94a3b8] uppercase tracking-wider font-semibold mb-1">Community Reports</p>
              <p className="text-2xl md:text-3xl font-bold mono text-[#fbbf24]">{incidents.length}</p>
            </Card>
          </div>

          {/* Assessment status distribution chart */}
          {assessments.length > 0 && (
            <Card className="border-[#1e2f4d] bg-[#0f1a2e]">
              <p className="text-xs text-[#94a3b8] uppercase tracking-wider font-semibold mb-3 flex items-center gap-2">
                <TrendingUp size={13} className="text-[#14b8a6]" />
                Assessment Status Frequency Distribution
              </p>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={statusDist} margin={{ top: 0, right: 10, left: -25, bottom: 0 }}>
                  <XAxis dataKey="status" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#0b1322", border: "1px solid #1e2f4d", borderRadius: 10, fontSize: 11 }}
                    itemStyle={{ color: "#f1f5f9" }}
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {statusDist.map((entry, i) => (
                      <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Assessment history table */}
          <Card className="border-[#1e2f4d] bg-[#0f1a2e]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <p className="text-xs text-[#94a3b8] uppercase tracking-wider font-semibold">
                Historical Assessment Register ({filteredAssessments.length})
              </p>

              <div className="flex flex-wrap items-center gap-2">
                {/* Search input */}
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-2.5 text-[#64748b]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by ID or activity..."
                    className="bg-[#0b1322] border border-[#1e2f4d] text-xs text-[#f1f5f9] rounded-lg pl-7 pr-3 py-1.5 focus:outline-none focus:border-[#14b8a6] w-48"
                  />
                </div>

                {/* Activity filter */}
                <select
                  value={activityFilter}
                  onChange={e => setActivityFilter(e.target.value)}
                  className="bg-[#0b1322] border border-[#1e2f4d] text-xs text-[#f1f5f9] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#14b8a6]"
                >
                  <option value="all">All Activities</option>
                  <option value="outdoor_sports">Outdoor Sports</option>
                  <option value="assembly">Assembly</option>
                  <option value="outdoor_work">Outdoor Work</option>
                </select>

                {/* Status filter */}
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="bg-[#0b1322] border border-[#1e2f4d] text-xs text-[#f1f5f9] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#14b8a6]"
                >
                  <option value="all">All Statuses</option>
                  <option value="action_recommended">Action Recommended</option>
                  <option value="review_required">Review Required</option>
                  <option value="monitor">Monitor</option>
                  <option value="insufficient_data">Insufficient Data</option>
                </select>
              </div>
            </div>

            {filteredAssessments.length === 0 ? (
              <p className="text-[#64748b] text-xs text-center py-6">No historical records match your filter criteria.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1e2f4d] text-[#64748b]">
                      <th className="text-left py-2.5 px-3 font-semibold">Assessment ID</th>
                      <th className="text-left py-2.5 px-3 font-semibold">Timestamp</th>
                      <th className="text-left py-2.5 px-3 font-semibold">Planned Activity</th>
                      <th className="text-left py-2.5 px-3 font-semibold">Result Status</th>
                      <th className="text-left py-2.5 px-3 font-semibold">Data Mode</th>
                      <th className="text-right py-2.5 px-3 font-semibold">Inspection</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssessments.map(a => {
                      const cfg = statusConfig[a.status];
                      return (
                        <tr key={a.assessmentId} className="border-b border-[#1e2f4d]/50 hover:bg-[#15233d]/40 transition-colors">
                          <td className="py-2 px-3 text-[#cbd5e1] font-mono font-bold">{a.assessmentId}</td>
                          <td className="py-2 px-3 text-[#94a3b8] mono">{fmtDate(a.createdAt)}</td>
                          <td className="py-2 px-3 text-[#f1f5f9] font-medium">{a.activity.replace(/_/g, " ")}</td>
                          <td className="py-2 px-3">
                            <span className={clsx("text-xs font-semibold", cfg.color)}>{cfg.label}</span>
                          </td>
                          <td className="py-2 px-3">
                            <Badge variant={a.dataMode === "observed" ? "green" : "teal"}>
                              {a.dataMode}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={() => setInspectAssessment(a)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#0b1322] border border-[#1e2f4d] hover:border-[#14b8a6] text-[10px] font-semibold text-[#f1f5f9] transition-colors cursor-pointer"
                            >
                              <Eye size={11} className="text-[#14b8a6]" />
                              <span>View Evidence</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Incident reporting form */}
          <Card className="border-[#1e2f4d] bg-[#0f1a2e]">
            <p className="text-xs text-[#94a3b8] uppercase tracking-wider font-semibold mb-2 flex items-center gap-2">
              <AlertOctagon size={14} className="text-[#fbbf24]" />
              Report Local Smoke, Dust or Fire Incident
            </p>
            <p className="text-[11px] text-[#fbbf24] mb-4">
              ⚠ Unverified community observation report — logged for administrative awareness. No personal data collected.
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5 mb-3">
              <select
                value={incType}
                onChange={e => setIncType(e.target.value as IncidentType)}
                className="bg-[#0b1322] border border-[#1e2f4d] text-[#f1f5f9] text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-[#14b8a6]"
              >
                <option value="smoke">🔥 Smoke / Biomass Burning</option>
                <option value="dust">💨 Construction Dust / Road Haze</option>
                <option value="other">⚠️ Other Visible Anomaly</option>
              </select>
              <input
                type="text"
                value={incDesc}
                onChange={e => setIncDesc(e.target.value)}
                placeholder="Observed location or details (e.g. North gate field construction dust)"
                maxLength={300}
                className="flex-1 bg-[#0b1322] border border-[#1e2f4d] text-[#f1f5f9] text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-[#14b8a6] placeholder-[#64748b]"
              />
              <Button onClick={submitIncident} loading={submitting} disabled={!incDesc.trim()} variant="teal" size="md">
                Log Incident
              </Button>
            </div>
            {incError && <WarnBanner>{incError}</WarnBanner>}
            {incSuccess && <p className="text-[#34d399] text-xs font-semibold">✓ Community observation logged successfully to DynamoDB.</p>}
          </Card>

          {/* Incidents register */}
          {incidents.length > 0 && (
            <Card className="border-[#1e2f4d] bg-[#0f1a2e]">
              <p className="text-xs text-[#94a3b8] uppercase tracking-wider font-semibold mb-3">
                Community Observations Archive ({incidents.length})
              </p>
              <div className="space-y-2">
                {incidents.map(inc => (
                  <motion.div
                    key={inc.incidentId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-start gap-3 p-3 rounded-xl bg-[#0b1322] border border-[#1e2f4d]"
                  >
                    <span className="text-base shrink-0 mt-0.5">{INCIDENT_ICONS[inc.incidentType]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] text-[#64748b] mono">{fmtDate(inc.reportedAt)}</span>
                        <Badge variant="amber">{inc.incidentType}</Badge>
                        <Badge variant="default">unverified report</Badge>
                      </div>
                      <p className="text-xs text-[#cbd5e1]">{inc.description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Assessment Inspection Modal */}
      <AnimatePresence>
        {inspectAssessment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl bg-[#0f1a2e] border border-[#1e2f4d] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between p-4 border-b border-[#1e2f4d] bg-[#0b1322]">
                <div className="flex items-center gap-2">
                  <Eye size={16} className="text-[#14b8a6]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#f1f5f9]">
                    Assessment Evidence Record ({inspectAssessment.assessmentId})
                  </h3>
                </div>
                <button
                  onClick={() => setInspectAssessment(null)}
                  className="text-[#64748b] hover:text-[#f1f5f9] p-1"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-4 overflow-y-auto">
                <AssessmentCard assessment={inspectAssessment} compact={false} />
              </div>

              <div className="p-3 border-t border-[#1e2f4d] bg-[#0b1322] flex justify-end">
                <Button size="sm" variant="secondary" onClick={() => setInspectAssessment(null)}>
                  Close
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Disclaimer />
    </div>
  );
}

