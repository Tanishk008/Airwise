"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { api, Campus, AirwiseApiError, Assessment, ActionPlan } from "@/lib/api";

export interface AppAlert {
  id: string;
  type: "action_recommended" | "review_required" | "draft_plan";
  title: string;
  message: string;
  campusId: string;
  campusName: string;
  timestamp: string;
  link: string;
}

interface AppContextType {
  campuses: Campus[];
  selectedCampus: Campus | null;
  setCampus: (id: string) => void;
  loading: boolean;
  error: string | null;
  refreshKey: number;
  refresh: () => void;
  backendOnline: boolean;
  lastRefreshedAt: Date | null;
  alerts: AppAlert[];
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [selectedCampusId, setSelectedCampusId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [backendOnline, setBackendOnline] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [alerts, setAlerts] = useState<AppAlert[]>([]);

  const loadCampuses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await api.health();
      setBackendOnline(true);
      const { campuses: list } = await api.campuses();
      setCampuses(list);
      if (list.length && !selectedCampusId) {
        setSelectedCampusId(list[0].campusId);
      }
      setLastRefreshedAt(new Date());
    } catch (e) {
      const msg = e instanceof AirwiseApiError ? e.message : "Backend unreachable. Check NEXT_PUBLIC_API_URL.";
      setError(msg);
      setBackendOnline(false);
    } finally {
      setLoading(false);
    }
  }, [selectedCampusId]);

  // Load campus alerts
  const loadAlerts = useCallback(async (currentCampuses: Campus[]) => {
    if (!currentCampuses.length) return;
    try {
      const allAlerts: AppAlert[] = [];
      await Promise.all(
        currentCampuses.map(async c => {
          try {
            const [assessData, planData] = await Promise.all([
              api.getAssessments(c.campusId),
              api.getActionPlans(c.campusId),
            ]);
            const latest = assessData.assessments[0];
            if (latest?.status === "action_recommended") {
              allAlerts.push({
                id: `alert-asmt-${latest.assessmentId}`,
                type: "action_recommended",
                title: `Action Recommended: ${c.name}`,
                message: `Threshold breach during ${latest.activity.replace(/_/g, " ")}. Administrator review required.`,
                campusId: c.campusId,
                campusName: c.name,
                timestamp: latest.createdAt,
                link: "/assessment",
              });
            } else if (latest?.status === "review_required") {
              allAlerts.push({
                id: `alert-asmt-${latest.assessmentId}`,
                type: "review_required",
                title: `Advisory Review: ${c.name}`,
                message: `WHO guideline exceeded for ${latest.activity.replace(/_/g, " ")}.`,
                campusId: c.campusId,
                campusName: c.name,
                timestamp: latest.createdAt,
                link: "/assessment",
              });
            }
            const drafts = planData.plans.filter(p => p.status === "draft");
            drafts.forEach(p => {
              allAlerts.push({
                id: `alert-plan-${p.planId}`,
                type: "draft_plan",
                title: `Draft Plan Pending: ${c.name}`,
                message: `Response plan ${p.planId} requires administrator approval.`,
                campusId: c.campusId,
                campusName: c.name,
                timestamp: p.createdAt,
                link: "/response",
              });
            });
          } catch {
            // Ignore individual campus failure
          }
        })
      );
      setAlerts(allAlerts.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
    } catch {
      // Ignore background alerts failure
    }
  }, []);

  useEffect(() => {
    loadCampuses();
  }, [loadCampuses, refreshKey]);

  useEffect(() => {
    if (campuses.length > 0) {
      loadAlerts(campuses);
    }
  }, [campuses, refreshKey, loadAlerts]);

  const selectedCampus = campuses.find(c => c.campusId === selectedCampusId) ?? null;

  return (
    <AppContext.Provider value={{
      campuses,
      selectedCampus,
      setCampus: setSelectedCampusId,
      loading,
      error,
      refreshKey,
      refresh: () => {
        setRefreshKey(k => k + 1);
        setLastRefreshedAt(new Date());
      },
      backendOnline,
      lastRefreshedAt,
      alerts,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

