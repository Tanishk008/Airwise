/**
 * AIRWISE — Explainable Action Intelligence Module
 * ─────────────────────────────────────────────────
 * Deterministic, rule-based recommendation engine.
 * No LLM. No invented thresholds. All rules are grounded in the assessment output.
 *
 * Inputs: assessment result (from engine.mjs) + dataQuality result (from data-quality.mjs)
 * Output: ranked array of ActionRecommendation objects
 */

import { GUIDELINES } from "./engine.mjs";

// ─── Scenario library ────────────────────────────────────────────────────────
// Each scenario: id, title, description, affectedActivities, reasonCodes,
//   suggestedSteps, assignedRole, priority (1=highest), requiresApproval,
//   eligibilityFn(assessment, dataQuality) → bool

const SCENARIOS = [
  {
    id: "move_activity_indoors",
    title: "Move Activity Indoors",
    description:
      "Relocate the planned outdoor activity to a suitable indoor venue to reduce participant exposure during the flagged period.",
    affectedActivities: ["outdoor_sports", "assembly"],
    reasonCodes: ["PM2_5_ABOVE_NAAQS", "PM10_ABOVE_NAAQS", "PM2_5_ABOVE_WHO", "PM10_ABOVE_WHO"],
    supportingPollutants: ["pm2_5", "pm10"],
    suggestedSteps: [
      "Confirm indoor venue availability with facilities coordinator.",
      "Notify activity coordinator and participants of the change.",
      "Document the decision and the supporting assessment ID in the response record.",
      "Post an advisory on campus communication channels.",
    ],
    assignedRole: "Campus Administrator",
    priority: 1,
    requiresApproval: true,
    eligibilityFn: (a) =>
      ["action_recommended", "review_required"].includes(a.status) &&
      ["outdoor_sports", "assembly"].includes(a.activity),
  },
  {
    id: "restrict_outdoor_work",
    title: "Restrict Nonessential Outdoor Work",
    description:
      "Postpone or reschedule nonessential outdoor maintenance and construction tasks during the flagged forecast window.",
    affectedActivities: ["outdoor_work"],
    reasonCodes: ["PM2_5_ABOVE_NAAQS", "PM10_ABOVE_NAAQS", "PM2_5_ABOVE_WHO", "PM10_ABOVE_WHO"],
    supportingPollutants: ["pm2_5", "pm10"],
    suggestedSteps: [
      "Review the outdoor work schedule with the facilities coordinator.",
      "Postpone nonessential tasks to a lower-risk forecast window.",
      "Ensure essential workers have access to respiratory protection.",
      "Record the restriction decision and its basis in the response log.",
    ],
    assignedRole: "Facilities Coordinator",
    priority: 1,
    requiresApproval: true,
    eligibilityFn: (a) =>
      ["action_recommended", "review_required"].includes(a.status) &&
      a.activity === "outdoor_work",
  },
  {
    id: "reschedule_to_lower_risk_window",
    title: "Reschedule to a Potentially More Suitable Forecast Window",
    description:
      "Check the 24-hour forecast for a period where modelled pollutant levels are lower and consider rescheduling the activity to that window. This is a forecast estimate, not a guarantee of safer conditions.",
    affectedActivities: ["outdoor_sports", "assembly", "outdoor_work"],
    reasonCodes: ["PM2_5_ABOVE_WHO", "PM10_ABOVE_WHO"],
    supportingPollutants: ["pm2_5", "pm10"],
    suggestedSteps: [
      "Review the hourly forecast chart on the Air Intelligence screen.",
      "Identify a forecast window where PM\u2082.\u2085 modelled values are below the WHO 24-hour guideline (15 \u00b5g/m\u00b3).",
      "Confirm the alternative window with the activity coordinator and campus administrator.",
      "Document the rescheduling decision and the forecast evidence.",
    ],
    assignedRole: "Campus Administrator",
    priority: 2,
    requiresApproval: true,
    eligibilityFn: (a) =>
      a.status === "review_required",
  },
  {
    id: "reduce_duration_or_intensity",
    title: "Reduce Activity Duration or Intensity",
    description:
      "Shorten the outdoor activity session or reduce physical intensity to limit cumulative exposure during a review-required period.",
    affectedActivities: ["outdoor_sports"],
    reasonCodes: ["PM2_5_ABOVE_WHO"],
    supportingPollutants: ["pm2_5"],
    suggestedSteps: [
      "Coordinate with the sports coordinator to shorten the session.",
      "Reduce high-intensity drills and replace with lower-exertion activities.",
      "Brief participants on the air quality situation before the session.",
      "Increase break frequency and encourage hydration.",
    ],
    assignedRole: "Sports Coordinator",
    priority: 2,
    requiresApproval: true,
    eligibilityFn: (a) =>
      a.status === "review_required" && a.activity === "outdoor_sports",
  },
  {
    id: "check_respiratory_protection",
    title: "Verify Respiratory Protection Availability",
    description:
      "Confirm that adequate respiratory protection (N95 or equivalent) is available for outdoor workers before the activity begins.",
    affectedActivities: ["outdoor_work"],
    reasonCodes: ["PM2_5_ABOVE_NAAQS", "PM2_5_ABOVE_WHO"],
    supportingPollutants: ["pm2_5"],
    suggestedSteps: [
      "Contact the facilities coordinator to confirm PPE stock.",
      "Distribute N95 or equivalent masks to all outdoor workers.",
      "Brief workers on correct mask usage and exposure limits.",
      "Log PPE distribution in the response record.",
    ],
    assignedRole: "Facilities Coordinator",
    priority: 2,
    requiresApproval: false,
    eligibilityFn: (a) =>
      ["action_recommended", "review_required"].includes(a.status) &&
      a.activity === "outdoor_work",
  },
  {
    id: "increase_monitoring",
    title: "Increase Monitoring and Schedule Reassessment",
    description:
      "Set a reminder to re-run the risk assessment before the activity starts. If data quality is limited, a fresh assessment may provide better coverage.",
    affectedActivities: ["outdoor_sports", "assembly", "outdoor_work"],
    reasonCodes: ["INSUFFICIENT_PM2_5", "INSUFFICIENT_PM10"],
    supportingPollutants: [],
    suggestedSteps: [
      "Schedule a reassessment closer to the activity start time.",
      "Monitor local community incident reports for visible smoke or dust.",
      "Notify the campus administrator if conditions change before reassessment.",
    ],
    assignedRole: "Campus Administrator",
    priority: 2,
    requiresApproval: false,
    eligibilityFn: (a) =>
      a.status === "insufficient_data",
  },
  {
    id: "notify_administrator",
    title: "Notify Campus Administrator",
    description:
      "Inform the campus administrator of the current air quality assessment status and any flagged conditions requiring attention.",
    affectedActivities: ["outdoor_sports", "assembly", "outdoor_work"],
    reasonCodes: ["PM2_5_ABOVE_NAAQS", "PM10_ABOVE_NAAQS", "PM2_5_ABOVE_WHO"],
    supportingPollutants: ["pm2_5", "pm10"],
    suggestedSteps: [
      "Share the assessment result ID and status with the campus administrator.",
      "Provide a brief summary of the flagged pollutant(s) and threshold exceedance.",
      "Await the administrator\u2019s decision before proceeding with the planned activity.",
    ],
    assignedRole: "Activity Coordinator",
    priority: 3,
    requiresApproval: false,
    eligibilityFn: (a) =>
      ["action_recommended", "review_required"].includes(a.status),
  },
  {
    id: "continue_with_monitoring",
    title: "Continue with Enhanced Monitoring",
    description:
      "No threshold exceedance detected. Proceed with the planned activity and maintain routine monitoring.",
    affectedActivities: ["outdoor_sports", "assembly", "outdoor_work"],
    reasonCodes: ["NO_TRIGGER"],
    supportingPollutants: [],
    suggestedSteps: [
      "Proceed with the planned activity.",
      "Remind participants to report any visible smoke, dust, or unusual odours.",
      "Re-run the assessment if conditions change noticeably.",
    ],
    assignedRole: "Campus Administrator",
    priority: 3,
    requiresApproval: false,
    eligibilityFn: (a) => a.status === "monitor",
  },
];

// ─── What-if scenario catalogue ───────────────────────────────────────────────
// Each option describes a decision pathway the user can compare
export const WHATIF_OPTIONS = [
  {
    id: "proceed",
    label: "Proceed as Planned",
    description: "Continue the activity on the original schedule and location.",
    operationalEffect:
      "Participants are exposed to forecast pollutant levels during the activity period. No operational change required.",
    constraints: ["Suitable only when assessment status is 'Monitor'."],
  },
  {
    id: "move_indoors",
    label: "Move Activity Indoors",
    description: "Relocate the activity to an indoor venue before it begins.",
    operationalEffect:
      "Reduces outdoor exposure for the activity duration. Indoor air quality depends on ventilation and HVAC conditions.",
    constraints: [
      "Requires an available indoor venue of appropriate size.",
      "May require logistical coordination and advance notice to participants.",
    ],
  },
  {
    id: "reschedule",
    label: "Reschedule to a Lower-Forecast Window",
    description:
      "Move the activity to a forecast hour where modelled PM\u2082.\u2085 levels are lower. This is a forecast estimate, not a confirmed safe period.",
    operationalEffect:
      "The activity takes place during a potentially more suitable forecast window. Actual conditions may differ from the model.",
    constraints: [
      "Forecast accuracy decreases beyond 24 hours.",
      "Requires agreement from participants and coordinators on the new time.",
    ],
  },
  {
    id: "reduce",
    label: "Reduce Duration or Intensity",
    description:
      "Shorten the session or lower physical intensity while keeping the original location and time.",
    operationalEffect:
      "Reduces the total duration of outdoor exposure. Suitable for review-required status when full relocation is not practical.",
    constraints: [
      "Participants must be informed of the modified session plan.",
      "Does not eliminate outdoor exposure — suitable for moderate concern levels only.",
    ],
  },
  {
    id: "reassess",
    label: "Reassess Before Activity Starts",
    description:
      "Defer the decision and run a fresh assessment closer to the activity start time.",
    operationalEffect:
      "Provides updated forecast data. Useful when current data coverage is insufficient or data is stale.",
    constraints: [
      "Requires sufficient lead time before the activity.",
      "A reassessment may return the same or different result depending on forecast updates.",
    ],
  },
];

/**
 * Generate ranked, rule-based action recommendations from an assessment result.
 *
 * @param {object} params
 * @param {object} params.assessment    Full assessment object from engine.mjs
 * @param {object} params.dataQuality   DataQuality object from data-quality.mjs
 * @returns {ActionRecommendation[]}
 */
export function generateRecommendations({ assessment, dataQuality }) {
  const reasonCodes = (assessment.reasons || []).map((r) => r.code);
  const now = new Date().toISOString();

  const eligible = SCENARIOS.filter((s) => {
    try {
      return s.eligibilityFn(assessment);
    } catch {
      return false;
    }
  });

  return eligible
    .sort((a, b) => a.priority - b.priority)
    .map((s, idx) => ({
      id: s.id,
      rank: idx + 1,
      title: s.title,
      description: s.description,
      priority: s.priority,
      affectedActivity: assessment.activity,
      reasonCodes: reasonCodes.filter((rc) => s.reasonCodes.includes(rc)),
      evidence: Object.entries(assessment.evidence || {}).map(([p, e]) => ({
        pollutant: p,
        mean24h: e.mean24h,
        unit: e.unit,
        dataMode: e.dataMode,
        provider: e.provider,
        guidelineComparison: buildGuidelineComparison(p, e.mean24h),
      })),
      supportingPollutants: s.supportingPollutants,
      suggestedSteps: s.suggestedSteps,
      assignedRole: s.assignedRole,
      requiresApproval: s.requiresApproval,
      constraints: [],
      dataQualityWarnings: (dataQuality?.warnings || []).slice(0, 3),
      eligibilityStatus: "eligible",
      sourceAssessmentId: assessment.assessmentId,
      createdAt: now,
    }));
}

function buildGuidelineComparison(pollutant, mean24h) {
  const g = GUIDELINES[pollutant];
  if (!g) return null;
  return {
    who: g.who,
    naaqs: g.naaqs,
    unit: GUIDELINES.unit,
    exceedsWHO: mean24h > g.who,
    exceedsNAAQS: mean24h > g.naaqs,
  };
}

/**
 * Return eligible what-if options for the current assessment status.
 *
 * @param {object} assessment
 * @param {object} dataQuality
 * @returns {WhatIfOption[]}
 */
export function getWhatIfOptions(assessment, dataQuality) {
  const status = assessment?.status;
  const eligible = WHATIF_OPTIONS.filter((opt) => {
    if (opt.id === "proceed") return status === "monitor";
    if (opt.id === "move_indoors") return ["action_recommended", "review_required"].includes(status);
    if (opt.id === "reschedule") return ["action_recommended", "review_required"].includes(status);
    if (opt.id === "reduce") return status === "review_required";
    if (opt.id === "reassess") return ["insufficient_data", "stale"].includes(status) || (dataQuality?.qualityStatus === "insufficient");
    return true;
  });

  return eligible.map((opt) => ({
    ...opt,
    dataQualityNote: dataQuality?.qualityStatus === "insufficient"
      ? "Data coverage is insufficient. Any rescheduling decision should be revisited after a fresh assessment."
      : dataQuality?.qualityStatus === "stale"
      ? "Data may be stale. Consider running a fresh assessment before finalising the decision."
      : null,
  }));
}
