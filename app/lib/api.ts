// AIRWISE — typed API client
// All external air-data calls happen on the backend; this module only calls our own API.

const rawApiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
export const API_BASE = rawApiUrl.endsWith("/api/v1")
  ? rawApiUrl
  : rawApiUrl
  ? `${rawApiUrl}/api/v1`
  : "/api/v1";

export type DataMode = "observed" | "forecast" | "demo";
export type AssessmentStatus = "insufficient_data" | "review_required" | "action_recommended" | "monitor";
export type PlanStatus = "draft" | "approved" | "dismissed" | "completed";
export type ActionStatus = "pending" | "in_progress" | "completed";
export type IncidentType = "smoke" | "dust" | "other";
export type ActivityType = "outdoor_sports" | "assembly" | "outdoor_work";

export interface Campus {
  campusId: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  activityTypes: ActivityType[];
  coordinatesNote?: string;
  createdAt?: string;
}

export interface ForecastPoint {
  time: string;
  pollutant: string;
  value: number;
  unit: string;
  dataMode: DataMode;
  provider: string;
}

export interface ModelledCurrent {
  time: string;
  pm2_5: number | null;
  pm10: number | null;
  units?: Record<string, string>;
  dataMode: DataMode;
}

export interface AirQualityResponse {
  campusId: string;
  retrievedAt: string;
  observations: ForecastPoint[];
  forecast: ForecastPoint[];
  modelledCurrent: ModelledCurrent | null;
  warnings: string[];
}

export interface AssessmentReason {
  code: string;
  message: string;
}

export interface RecommendedAction {
  code: string;
  label: string;
  owner: string;
  requiresApproval: boolean;
}

export interface EvidenceEntry {
  mean24h: number;
  max: number;
  hours: number;
  unit: string;
  dataMode: DataMode;
  provider: string;
  firstTime: string;
  lastTime: string;
}

export interface Assessment {
  assessmentId: string;
  campusId: string;
  activity: ActivityType;
  createdAt: string;
  dataMode: DataMode;
  sourceName: string;
  sourceTimestamp: string;
  status: AssessmentStatus;
  reasons: AssessmentReason[];
  evidence: Record<string, EvidenceEntry>;
  guidelineVersion: string;
  recommendedActions: RecommendedAction[];
  approvedBy?: string | null;
  disclaimer?: string;
}

export interface ActionItem {
  actionId: string;
  label: string;
  owner: string;
  status: ActionStatus;
  completedAt?: string | null;
  dueAt?: string | null;
}

export interface AuditEntry {
  at: string;
  by: string;
  event: string;
}

export interface ActionPlan {
  planId: string;
  assessmentId: string;
  campusId: string;
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
  approvedBy: string | null;
  approvedAt?: string | null;
  actions: ActionItem[];
  audit: AuditEntry[];
}

export interface Incident {
  incidentId: string;
  campusId: string;
  reportedAt: string;
  incidentType: IncidentType;
  description: string;
  status: "reported" | "reviewed" | "closed";
  evidenceUrl?: string;
}

export interface ApiError {
  code: string;
  message: string;
  retryable: boolean;
}

class AirwiseApiError extends Error {
  constructor(
    public readonly apiError: ApiError,
    public readonly status: number
  ) {
    super(apiError.message);
    this.name = "AirwiseApiError";
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = API_BASE + path;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "content-type": "application/json" },
      ...init,
    });
  } catch {
    throw new AirwiseApiError(
      { code: "NETWORK_ERROR", message: "Cannot reach the AIRWISE backend. Check your connection.", retryable: true },
      0
    );
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json?.error ?? { code: "UNKNOWN", message: `HTTP ${res.status}`, retryable: false };
    throw new AirwiseApiError(err, res.status);
  }
  return json as T;
}

export const api = {
  health: () => apiFetch<{ ok: boolean; time: string }>("/health"),

  campuses: () => apiFetch<{ campuses: Campus[] }>("/campuses"),

  airQuality: (campusId: string) =>
    apiFetch<AirQualityResponse>(`/air-quality?campusId=${encodeURIComponent(campusId)}`),

  createAssessment: (campusId: string, activity: ActivityType) =>
    apiFetch<Assessment>("/assessments", {
      method: "POST",
      body: JSON.stringify({ campusId, activity }),
    }),

  getAssessments: (campusId: string) =>
    apiFetch<{ assessments: Assessment[] }>(`/assessments?campusId=${encodeURIComponent(campusId)}`),

  createActionPlan: (assessmentId: string) =>
    apiFetch<ActionPlan>("/action-plans", {
      method: "POST",
      body: JSON.stringify({ assessmentId }),
    }),

  getActionPlans: (campusId: string) =>
    apiFetch<{ plans: ActionPlan[] }>(`/action-plans?campusId=${encodeURIComponent(campusId)}`),

  approvePlan: (planId: string, actor = "Campus administrator") =>
    apiFetch<ActionPlan>(`/action-plans/${planId}`, {
      method: "PATCH",
      body: JSON.stringify({ operation: "approve_plan", actor }),
    }),

  dismissPlan: (planId: string, actor = "Campus administrator", reason?: string) =>
    apiFetch<ActionPlan>(`/action-plans/${planId}`, {
      method: "PATCH",
      body: JSON.stringify({ operation: "dismiss_plan", actor, reason }),
    }),

  updateAction: (planId: string, actionId: string, status: ActionStatus) =>
    apiFetch<ActionPlan>(`/action-plans/${planId}`, {
      method: "PATCH",
      body: JSON.stringify({ operation: "update_action", actionId, status }),
    }),

  createIncident: (campusId: string, incidentType: IncidentType, description: string) =>
    apiFetch<Incident>("/incidents", {
      method: "POST",
      body: JSON.stringify({ campusId, incidentType, description }),
    }),

  getIncidents: (campusId: string) =>
    apiFetch<{ incidents: Incident[] }>(`/incidents?campusId=${encodeURIComponent(campusId)}`),
};

export { AirwiseApiError };
