// Deterministic risk engine. No LLM involved. Thresholds are 24-hour guideline values (µg/m³).
export const GUIDELINES = {
  version: "WHO-AQG-2021 + India-CPCB-NAAQS-2009",
  pm2_5: { who: 15, naaqs: 60 },
  pm10: { who: 45, naaqs: 100 },
  unit: "µg/m³", basis: "mean of next 24 hourly forecast values",
};
export const ACTIVITIES = ["outdoor_sports", "assembly", "outdoor_work"];
export const ACTIONS = {
  outdoor_sports: [["REVIEW_OUTDOOR_ACTIVITY", "Review / move outdoor sports session indoors", "Sports coordinator"], ["SEND_ADVISORY", "Prepare campus advisory for students and staff", "Campus administrator"]],
  assembly: [["MOVE_ASSEMBLY", "Review holding the assembly indoors or shortening it", "Campus administrator"], ["CHECK_VENTILATION", "Check ventilation / air purification in indoor venues", "Facilities coordinator"]],
  outdoor_work: [["REVIEW_WORK_SCHEDULE", "Review outdoor work schedule and rotate / limit exposure", "Facilities coordinator"], ["CHECK_MASKS", "Check availability of respiratory protection for staff", "Facilities coordinator"]],
};
export function assess({ forecast, activity, nowMs = Date.now() }) {
  const reasons = [], evidence = {};
  for (const p of ["pm2_5", "pm10"]) {
    const pts = (forecast || []).filter(f => f.pollutant === p && Number.isFinite(f.value) && f.value >= 0 &&
      Date.parse(f.time) >= nowMs - 3600e3 && Date.parse(f.time) < nowMs + 24 * 3600e3);
    if (pts.length < 18) {
      reasons.push({ code: "INSUFFICIENT_" + p.toUpperCase(), message: `Only ${pts.length}/24 valid hourly ${p} values available.` });
      continue;
    }
    const mean = +(pts.reduce((s, x) => s + x.value, 0) / pts.length).toFixed(1);
    const max = Math.max(...pts.map(x => x.value));
    evidence[p] = { mean24h: mean, max, hours: pts.length, unit: GUIDELINES.unit, dataMode: "forecast", provider: pts[0]?.provider || "Open-Meteo Air Quality (CAMS model)", firstTime: pts[0]?.time, lastTime: pts.at(-1)?.time };
    const g = GUIDELINES[p];
    if (mean > g.naaqs) reasons.push({ code: p.toUpperCase() + "_ABOVE_NAAQS", message: `Forecast ${p} 24h mean ${mean} ${GUIDELINES.unit} exceeds India CPCB 24h standard (${g.naaqs}).` });
    else if (mean > g.who) reasons.push({ code: p.toUpperCase() + "_ABOVE_WHO", message: `Forecast ${p} 24h mean ${mean} ${GUIDELINES.unit} exceeds WHO 2021 24h guideline (${g.who}).` });
  }
  const has = Object.keys(evidence).length > 0;
  const hasInsufficient = reasons.some(r => r.code.startsWith("INSUFFICIENT_"));
  const level = c => reasons.some(r => r.code.endsWith(c));
  const status = level("_ABOVE_NAAQS")
    ? "action_recommended"
    : level("_ABOVE_WHO")
    ? "review_required"
    : (!has || hasInsufficient)
    ? "insufficient_data"
    : "monitor";
  if (status === "monitor") reasons.push({ code: "NO_TRIGGER", message: "No configured threshold exceeded. This is not a statement that the air is safe." });
  const recommendedActions = status === "monitor"
    ? [["CONTINUE_MONITORING", "Continue routine monitoring", "Campus administrator"]]
    : status === "insufficient_data"
    ? []
    : (ACTIONS[activity] || []);
  return {
    status, reasons, evidence, guidelineVersion: GUIDELINES.version,
    recommendedActions: recommendedActions.map(([code, label, owner]) => ({ code, label, owner, requiresApproval: true }))
  };
}
