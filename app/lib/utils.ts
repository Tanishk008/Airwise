import { AssessmentStatus, PlanStatus, ActionStatus } from "@/lib/api";
import { format, formatDistanceToNow, parseISO } from "date-fns";

export function fmtDate(iso: string): string {
  try {
    return format(parseISO(iso), "dd MMM yyyy, HH:mm");
  } catch {
    return iso;
  }
}

export function fmtRelative(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

export function fmtDuration(ms: number): string {
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  const rem = min % 60;
  return rem ? `${hr}h ${rem}m` : `${hr}h`;
}

export function fmtOutcomeStatus(status: string): string {
  switch (status) {
    case "improved": return "Measured Impact: Air Quality Improved";
    case "unchanged": return "Measured Impact: No Significant Change";
    case "worsened": return "Measured Impact: Air Quality Worsened";
    case "unable_to_determine": return "Operational Outcome Only (Impact Unverified)";
    default: return status.replace(/_/g, " ");
  }
}

export const statusConfig: Record<AssessmentStatus, { label: string; color: string; bg: string; icon: string }> = {
  insufficient_data: {
    label: "Insufficient Data",
    color: "text-slate-400",
    bg: "bg-slate-800/60 border-slate-600",
    icon: "?",
  },
  monitor: {
    label: "Monitor",
    color: "text-emerald-400",
    bg: "bg-emerald-950/60 border-emerald-700",
    icon: "✓",
  },
  review_required: {
    label: "Review Required",
    color: "text-amber-400",
    bg: "bg-amber-950/60 border-amber-700",
    icon: "⚠",
  },
  action_recommended: {
    label: "Action Recommended",
    color: "text-red-400",
    bg: "bg-red-950/60 border-red-700",
    icon: "✕",
  },
};

export const planStatusConfig: Record<PlanStatus, { label: string; color: string }> = {
  draft: { label: "Draft", color: "text-slate-400" },
  approved: { label: "Approved", color: "text-blue-400" },
  dismissed: { label: "Dismissed", color: "text-slate-500" },
  completed: { label: "Completed", color: "text-emerald-400" },
};

export const actionStatusConfig: Record<ActionStatus, { label: string; color: string; dot: string }> = {
  pending: { label: "Pending", color: "text-slate-400", dot: "bg-slate-500" },
  in_progress: { label: "In Progress", color: "text-blue-400", dot: "bg-blue-500" },
  completed: { label: "Completed", color: "text-emerald-400", dot: "bg-emerald-500" },
};

export function pollutantLabel(key: string): string {
  const map: Record<string, string> = {
    pm2_5: "PM₂.₅",
    pm10: "PM₁₀",
    nitrogen_dioxide: "NO₂",
    ozone: "O₃",
    sulphur_dioxide: "SO₂",
    carbon_monoxide: "CO",
  };
  return map[key] ?? key.replace(/_/g, " ").toUpperCase();
}

export function getDataFreshness(isoTime: string): { label: string; fresh: boolean } {
  try {
    const ms = Date.now() - parseISO(isoTime).getTime();
    const hrs = ms / 3600000;
    if (hrs < 2) return { label: "Fresh", fresh: true };
    if (hrs < 6) return { label: "Recent", fresh: true };
    if (hrs < 24) return { label: "Aging", fresh: false };
    return { label: "Stale", fresh: false };
  } catch {
    return { label: "Unknown", fresh: false };
  }
}

export function clsx(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
