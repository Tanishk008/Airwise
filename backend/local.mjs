/**
 * AIRWISE — standalone local dev server
 * ----------------------------------------
 * • Real Open-Meteo forecasts (no key needed)
 * • In-memory DynamoDB mock (data persists while server is running)
 * • Full risk engine (same logic as production)
 * • CORS pre-configured for http://localhost:3000
 *
 * Usage:
 *   node local.mjs
 *   # then open http://localhost:3000 (frontend must be running)
 */

import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = 3001;
const app = express();
app.use(express.json());

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.header("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ─── In-memory store ──────────────────────────────────────────────────────────
const db = { campuses: new Map(), assessments: new Map(), plans: new Map(), incidents: new Map() };

// ─── Risk engine (mirrors backend/src/engine.mjs) ─────────────────────────────
const GUIDELINES = {
  version: "WHO-AQG-2021 + India-CPCB-NAAQS-2009",
  pm2_5: { who: 15, naaqs: 60 },
  pm10: { who: 45, naaqs: 100 },
  unit: "µg/m³",
};
const ACTIVITIES = ["outdoor_sports", "assembly", "outdoor_work"];
const ACTIONS = {
  outdoor_sports: [
    ["REVIEW_OUTDOOR_ACTIVITY", "Review / move outdoor sports session indoors", "Sports coordinator"],
    ["SEND_ADVISORY", "Prepare campus advisory for students and staff", "Campus administrator"],
  ],
  assembly: [
    ["MOVE_ASSEMBLY", "Review holding the assembly indoors or shortening it", "Campus administrator"],
    ["CHECK_VENTILATION", "Check ventilation / air purification in indoor venues", "Facilities coordinator"],
  ],
  outdoor_work: [
    ["REVIEW_WORK_SCHEDULE", "Review outdoor work schedule and rotate / limit exposure", "Facilities coordinator"],
    ["CHECK_MASKS", "Check availability of respiratory protection for staff", "Facilities coordinator"],
  ],
};

function assess({ forecast, activity, nowMs = Date.now() }) {
  const reasons = [], evidence = {};
  for (const p of ["pm2_5", "pm10"]) {
    const pts = forecast.filter(
      f => f.pollutant === p && Number.isFinite(f.value) && f.value >= 0 &&
        Date.parse(f.time) >= nowMs - 3600e3 && Date.parse(f.time) < nowMs + 24 * 3600e3
    );
    if (pts.length < 18) {
      reasons.push({ code: "INSUFFICIENT_" + p.toUpperCase(), message: `Only ${pts.length}/24 valid hourly ${p} values available.` });
      continue;
    }
    const mean = +(pts.reduce((s, x) => s + x.value, 0) / pts.length).toFixed(1);
    const max = Math.max(...pts.map(x => x.value));
    evidence[p] = { mean24h: mean, max, hours: pts.length, unit: GUIDELINES.unit, dataMode: "forecast", provider: pts[0].provider, firstTime: pts[0].time, lastTime: pts.at(-1).time };
    const g = GUIDELINES[p];
    if (mean > g.naaqs) reasons.push({ code: p.toUpperCase() + "_ABOVE_NAAQS", message: `Forecast ${p} 24h mean ${mean} ${GUIDELINES.unit} exceeds India CPCB 24h standard (${g.naaqs}).` });
    else if (mean > g.who) reasons.push({ code: p.toUpperCase() + "_ABOVE_WHO", message: `Forecast ${p} 24h mean ${mean} ${GUIDELINES.unit} exceeds WHO 2021 24h guideline (${g.who}).` });
  }
  const has = Object.keys(evidence).length > 0;
  const level = c => reasons.some(r => r.code.endsWith(c));
  const status = !has ? "insufficient_data" : level("_ABOVE_NAAQS") ? "action_recommended" : level("_ABOVE_WHO") ? "review_required" : "monitor";
  if (status === "monitor") reasons.push({ code: "NO_TRIGGER", message: "No configured threshold exceeded. This is not a statement that the air is safe." });
  const recommendedActions = status === "monitor"
    ? [["CONTINUE_MONITORING", "Continue routine monitoring", "Campus administrator"]]
    : status === "insufficient_data" ? [] : ACTIONS[activity];
  return {
    status, reasons, evidence, guidelineVersion: GUIDELINES.version,
    recommendedActions: (recommendedActions || []).map(([code, label, owner]) => ({ code, label, owner, requiresApproval: true })),
  };
}

// ─── Campus seed data ─────────────────────────────────────────────────────────
const SEED_CAMPUSES = [
  { campusId: "campus_ghaziabad", name: "Ghaziabad (Muradnagar) Campus", city: "Ghaziabad", latitude: 28.7525, longitude: 77.4985 },
  { campusId: "campus_noida", name: "Noida Sector 62 Campus", city: "Noida", latitude: 28.6280, longitude: 77.3649 },
  { campusId: "campus_delhi", name: "Central Delhi Campus", city: "New Delhi", latitude: 28.6139, longitude: 77.2090 },
].map(c => ({ ...c, activityTypes: ACTIVITIES, coordinatesNote: "Approximate; forecast is for the grid cell.", createdAt: new Date().toISOString() }));

SEED_CAMPUSES.forEach(c => db.campuses.set(c.campusId, c));

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid = p => `${p}_${randomUUID().slice(0, 8)}`;
const now = () => new Date().toISOString();
const clean = (s, n = 300) => String(s ?? "").replace(/[<>]/g, "").trim().slice(0, n);
const byNew = arr => [...arr].sort((a, b) => (b.createdAt || b.reportedAt || "").localeCompare(a.createdAt || a.reportedAt || ""));
const err = (res, status, code, message, retryable = false) => res.status(status).json({ error: { code, message, retryable } });

function getCampus(campusId, res) {
  const c = db.campuses.get(campusId);
  if (!c) { err(res, 404, "CAMPUS_NOT_FOUND", "Unknown campusId."); return null; }
  return c;
}

// ─── Open-Meteo fetch ─────────────────────────────────────────────────────────
async function fetchForecast(campus) {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality` +
    `?latitude=${campus.latitude}&longitude=${campus.longitude}` +
    `&hourly=pm2_5,pm10,nitrogen_dioxide,ozone&current=pm2_5,pm10,us_aqi&timezone=UTC&forecast_days=3`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`);
  const j = await r.json();
  const forecast = [];
  for (const p of ["pm2_5", "pm10", "nitrogen_dioxide", "ozone"]) {
    (j.hourly?.[p] || []).forEach((v, i) => {
      if (v !== null && Number.isFinite(v)) {
        forecast.push({ time: j.hourly.time[i] + ":00Z", pollutant: p, value: v, unit: j.hourly_units?.[p] || "µg/m³", dataMode: "forecast", provider: "Open-Meteo Air Quality (CAMS model)" });
      }
    });
  }
  const modelledCurrent = j.current
    ? { time: j.current.time + ":00Z", pm2_5: j.current.pm2_5, pm10: j.current.pm10, units: j.current_units, dataMode: "forecast" }
    : null;
  return { forecast, modelledCurrent };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health
app.get("/api/v1/health", (_, res) => res.json({ ok: true, time: now(), version: "local-dev", store: "in-memory" }));

// Campuses
app.get("/api/v1/campuses", (_, res) => res.json({ campuses: [...db.campuses.values()] }));

// Air quality
app.get("/api/v1/air-quality", async (req, res) => {
  const campus = getCampus(req.query.campusId, res); if (!campus) return;
  try {
    const { forecast, modelledCurrent } = await fetchForecast(campus);
    res.json({
      campusId: campus.campusId, retrievedAt: now(),
      observations: [],
      forecast, modelledCurrent,
      warnings: ["No measured station observation shown — all values are MODELLED FORECASTS (CAMS model). Running in local dev mode."],
    });
  } catch (e) {
    console.error("Open-Meteo error:", e.message);
    err(res, 502, "UPSTREAM_DATA_UNAVAILABLE", "Air-quality data could not be retrieved from Open-Meteo.", true);
  }
});

// Create assessment
app.post("/api/v1/assessments", async (req, res) => {
  const { campusId, activity } = req.body;
  const campus = getCampus(campusId, res); if (!campus) return;
  if (!ACTIVITIES.includes(activity)) return err(res, 400, "INVALID_ACTIVITY", `activity must be one of ${ACTIVITIES.join(", ")}.`);
  let forecast = [];
  try { ({ forecast } = await fetchForecast(campus)); }
  catch (e) { return err(res, 502, "UPSTREAM_DATA_UNAVAILABLE", "Could not fetch air data.", true); }
  const r = assess({ forecast, activity });
  const item = {
    assessmentId: uid("asmt"), campusId, activity, createdAt: now(),
    dataMode: "forecast", sourceName: "Open-Meteo Air Quality (local dev)",
    sourceTimestamp: now(), disclaimer: "Decision support only.", ...r,
  };
  db.assessments.set(item.assessmentId, item);
  res.status(201).json(item);
});

// Get assessments
app.get("/api/v1/assessments", (req, res) => {
  const cid = req.query.campusId;
  const items = [...db.assessments.values()].filter(a => !cid || a.campusId === cid);
  res.json({ assessments: byNew(items) });
});

// Create action plan
app.post("/api/v1/action-plans", (req, res) => {
  const { assessmentId } = req.body;
  const a = db.assessments.get(clean(assessmentId, 40));
  if (!a) return err(res, 404, "ASSESSMENT_NOT_FOUND", "Unknown assessmentId.");
  if (!a.recommendedActions?.length) return err(res, 400, "NO_ACTIONS", "Assessment has no actions to plan.");
  const t = now();
  const plan = {
    planId: uid("plan"), assessmentId: a.assessmentId, campusId: a.campusId,
    status: "draft", createdAt: t, updatedAt: t, approvedBy: null,
    actions: a.recommendedActions.map((x, i) => ({ actionId: `act_${i + 1}`, label: x.label, owner: x.owner, status: "pending", completedAt: null })),
    audit: [{ at: t, by: "system", event: `Draft created from ${a.assessmentId} (${a.status})` }],
  };
  db.plans.set(plan.planId, plan);
  res.status(201).json(plan);
});

// Get action plans
app.get("/api/v1/action-plans", (req, res) => {
  const cid = req.query.campusId;
  const items = [...db.plans.values()].filter(p => !cid || p.campusId === cid);
  res.json({ plans: byNew(items) });
});

// Update action plan (approve / dismiss / update task)
app.patch("/api/v1/action-plans/:planId", (req, res) => {
  const p = db.plans.get(req.params.planId);
  if (!p) return err(res, 404, "PLAN_NOT_FOUND", "Unknown planId.");
  const { operation, actor, actionId, status } = req.body;
  const by = clean(actor, 40) || "demo-user", t = now();
  if (operation === "approve_plan") {
    if (p.status !== "draft") return err(res, 400, "INVALID_TRANSITION", "Only draft plans can be approved.");
    Object.assign(p, { status: "approved", approvedBy: by, approvedAt: t });
    p.audit.push({ at: t, by, event: "Plan approved" });
  } else if (operation === "dismiss_plan") {
    if (p.status !== "draft") return err(res, 400, "INVALID_TRANSITION", "Only draft plans can be dismissed.");
    p.status = "dismissed";
    const reason = clean(req.body.reason, 200);
    p.audit.push({ at: t, by, event: reason ? `Plan dismissed: ${reason}` : "Plan dismissed" });
  } else if (operation === "update_action") {
    if (p.status !== "approved") return err(res, 400, "INVALID_TRANSITION", "Plan must be approved before tasks change.");
    const a = p.actions.find(x => x.actionId === actionId);
    if (!a) return err(res, 404, "ACTION_NOT_FOUND", "Unknown actionId.");
    if (!["pending", "in_progress", "completed"].includes(status)) return err(res, 400, "INVALID_STATUS", "Invalid status.");
    p.audit.push({ at: t, by, event: `"${a.label}": ${a.status} → ${status}` });
    a.status = status;
    a.completedAt = status === "completed" ? t : null;
    if (p.actions.every(x => x.status === "completed")) p.status = "completed";
  } else {
    return err(res, 400, "INVALID_OPERATION", "Unsupported operation.");
  }
  p.updatedAt = t;
  res.json(p);
});

// Create incident
app.post("/api/v1/incidents", (req, res) => {
  const { campusId, incidentType, description } = req.body;
  const campus = getCampus(campusId, res); if (!campus) return;
  if (!["smoke", "dust", "other"].includes(incidentType)) return err(res, 400, "INVALID_TYPE", "incidentType must be smoke, dust or other.");
  const item = { incidentId: uid("inc"), campusId, reportedAt: now(), incidentType, description: clean(description, 500), status: "reported" };
  db.incidents.set(item.incidentId, item);
  res.status(201).json(item);
});

// Get incidents
app.get("/api/v1/incidents", (req, res) => {
  const cid = req.query.campusId;
  const items = [...db.incidents.values()].filter(i => !cid || i.campusId === cid);
  res.json({ incidents: byNew(items) });
});

// ─── 404 catch-all ────────────────────────────────────────────────────────────
app.use((req, res) => err(res, 404, "NOT_FOUND", `Route ${req.method} ${req.path} not found.`));

// ─── Start ────────────────────────────────────────────────────────────────────
createServer(app).listen(PORT, () => {
  console.log(`
┌─────────────────────────────────────────────┐
│   🌫️  AIRWISE  —  Local Dev Server          │
│   API: http://localhost:${PORT}/api/v1           │
│   Store: in-memory (resets on restart)      │
│   Air data: live Open-Meteo forecasts       │
└─────────────────────────────────────────────┘

  Test:  curl http://localhost:${PORT}/api/v1/health
  UI:    open http://localhost:3000

`);
});
