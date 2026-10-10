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
import { randomUUID, createHash } from "node:crypto";

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

// ─── Risk engine (imported from backend/src/engine.mjs) ───────────────────────
import { assess, ACTIVITIES, ACTIONS, GUIDELINES } from "./src/engine.mjs";
// ─── Trust Engine: Data Quality ───────────────────────────────────────────────
import { assessDataQuality } from "./src/data-quality.mjs";
// ─── Action Intelligence ──────────────────────────────────────────────────────
import { generateRecommendations, getWhatIfOptions } from "./src/action-intelligence.mjs";

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

function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function getCampus(campusId, res) {
  const c = db.campuses.get(campusId);
  if (!c) { err(res, 404, "CAMPUS_NOT_FOUND", "Unknown campusId."); return null; }
  return c;
}

// ─── Open-Meteo fetch ─────────────────────────────────────────────────────────
async function fetchForecast(campus) {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality` +
    `?latitude=${campus.latitude}&longitude=${campus.longitude}` +
    `&hourly=pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide&current=pm2_5,pm10,us_aqi&timezone=UTC&forecast_days=3`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`);
  const j = await r.json();
  const forecast = [];
  for (const p of ["pm2_5", "pm10", "nitrogen_dioxide", "ozone", "sulphur_dioxide", "carbon_monoxide"]) {
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
    const retrievedAt = now();
    const { forecast, modelledCurrent } = await fetchForecast(campus);
    const baseWarnings = ["No measured station observation shown — all values are MODELLED FORECASTS (CAMS model). Running in local dev mode."];
    const dataQuality = assessDataQuality({
      forecast, observations: [], retrievedAt,
      sourceName: "Open-Meteo Air Quality (CAMS model) · Local Dev",
      existingWarnings: baseWarnings,
    });
    res.json({
      campusId: campus.campusId, retrievedAt,
      observations: [],
      forecast, modelledCurrent,
      warnings: dataQuality.warnings,
      dataQuality,
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
  let forecast = [], retrievedAt = now();
  try { ({ forecast } = await fetchForecast(campus)); }
  catch (e) { return err(res, 502, "UPSTREAM_DATA_UNAVAILABLE", "Could not fetch air data.", true); }
  retrievedAt = now();
  const r = assess({ forecast, activity });
  const dataQuality = assessDataQuality({ forecast, observations: [], retrievedAt, sourceName: "Open-Meteo Air Quality (local dev)" });
  const recommendations = generateRecommendations({ assessment: { ...r, assessmentId: "pending", activity }, dataQuality });
  const item = {
    assessmentId: uid("asmt"), campusId, activity, createdAt: now(),
    dataMode: "forecast", sourceName: "Open-Meteo Air Quality (local dev)",
    sourceTimestamp: retrievedAt, disclaimer: "Decision support only; not medical advice or an official alert.",
    dataQuality, recommendations,
    ...r,
  };
  // Fix recommendation sourceAssessmentId now that we have the ID
  item.recommendations = item.recommendations.map(rec => ({ ...rec, sourceAssessmentId: item.assessmentId }));
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
  const { assessmentId, customAlternativeId } = req.body;
  const a = db.assessments.get(clean(assessmentId, 40));
  if (!a) return err(res, 404, "ASSESSMENT_NOT_FOUND", "Unknown assessmentId.");
  
  let actions = [];
  if (customAlternativeId) {
    const recs = a.recommendations || [];
    let mappedScenarioId = null;
    if (customAlternativeId === "move_indoors") mappedScenarioId = "move_activity_indoors";
    else if (customAlternativeId === "reschedule" || customAlternativeId === "reassess") mappedScenarioId = "reschedule_to_lower_risk_window";
    else if (customAlternativeId === "proceed" || customAlternativeId === "reduce") mappedScenarioId = "continue_with_monitoring";
    
    const customRec = recs.find(r => r.id === mappedScenarioId) || recs[0];
    if (customRec && customRec.suggestedSteps) {
      actions = customRec.suggestedSteps.map((step, i) => ({ actionId: `act_${i + 1}`, label: step, owner: customRec.assignedRole, status: "pending", completedAt: null }));
    } else {
      actions = [{ actionId: "act_1", label: `Implement alternative: ${customAlternativeId.replace(/_/g, " ")}`, owner: "Campus Administrator", status: "pending", completedAt: null }];
    }
  } else {
    if (!a.recommendedActions?.length) return err(res, 400, "NO_ACTIONS", "Assessment has no actions to plan.");
    actions = a.recommendedActions.map((x, i) => ({ actionId: `act_${i + 1}`, label: x.label, owner: x.owner, status: "pending", completedAt: null }));
  }

  const t = now();
  
  const receiptPayload = {
    assessmentId: a.assessmentId,
    campusId: a.campusId,
    activity: a.activity,
    assessmentTimestamp: a.createdAt,
    evidence: a.evidence,
    dataQuality: a.dataQuality,
    selectedAlternative: customAlternativeId || 'Top Recommendation',
    actions: actions.map(x => x.label)
  };
  const hash = createHash("sha256").update(stableStringify(receiptPayload)).digest("hex");
  const decisionReceipt = {
    ...receiptPayload,
    generatedAt: t,
    hash
  };

  const plan = {
    planId: uid("plan"), assessmentId: a.assessmentId, campusId: a.campusId,
    status: "draft", createdAt: t, updatedAt: t, approvedBy: null,
    actions,
    decisionReceipt,
    audit: [{ at: t, by: "system", event: `Draft created from ${a.assessmentId} (${customAlternativeId ? `Alternative: ${customAlternativeId}` : 'Top Recommendation'})` }],
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

// Update action plan (approve / dismiss / update task / record_outcome)
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
    p.dismissedBy = by;
    p.dismissedAt = t;
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
  } else if (operation === "record_outcome") {
    if (!['completed', 'approved', 'dismissed'].includes(p.status)) {
      return err(res, 400, "INVALID_TRANSITION", "Outcome can only be recorded for completed, approved, or dismissed plans.");
    }
    const validOutcomes = ["improved", "unchanged", "worsened", "unable_to_determine"];
    const outcomeStatus = clean(req.body.outcomeStatus, 40);
    if (!validOutcomes.includes(outcomeStatus)) {
      return err(res, 400, "INVALID_OUTCOME", `outcomeStatus must be one of: ${validOutcomes.join(", ")}.`);
    }
    p.outcomeStatus = outcomeStatus;
    p.outcomeNotes = clean(req.body.outcomeNotes || "", 500);
    p.outcomeRecordedAt = t;
    p.outcomeRecordedBy = by;
    p.outcomeEvidenceSource = clean(req.body.outcomeEvidenceSource || "", 200);
    p.audit.push({ at: t, by, event: `Outcome recorded: ${outcomeStatus}${p.outcomeNotes ? " — " + p.outcomeNotes.slice(0, 80) : ""}` });
  } else {
    return err(res, 400, "INVALID_OPERATION", "Unsupported operation.");
  }
  p.updatedAt = t;
  res.json(p);
});

// Verify Decision Receipt integrity
app.post("/api/v1/verify-receipt", (req, res) => {
  const { receipt } = req.body;
  if (!receipt || !receipt.hash) return err(res, 400, "INVALID_RECEIPT", "Receipt or hash missing.");
  
  const { hash, generatedAt, ...payload } = receipt;
  const computedHash = createHash("sha256").update(stableStringify(payload)).digest("hex");
  
  if (computedHash === hash) {
    res.json({ valid: true, message: "Receipt cryptographically verified and untampered." });
  } else {
    res.json({ valid: false, message: "Receipt tampering detected. Hash mismatch." });
  }
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

// Get recommendations for an assessment
app.get("/api/v1/recommendations", (req, res) => {
  const { assessmentId } = req.query;
  if (!assessmentId) return err(res, 400, "MISSING_PARAM", "assessmentId is required.");
  const assessment = db.assessments.get(clean(assessmentId, 40));
  if (!assessment) return err(res, 404, "ASSESSMENT_NOT_FOUND", "Unknown assessmentId.");
  const recommendations = assessment.recommendations || [];
  const whatIfOptions = getWhatIfOptions(assessment, assessment.dataQuality);
  res.json({ assessmentId, recommendations, whatIfOptions });
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
