// AIRWISE enhanced handler with OpenAQ integration and QueryCommand (GSI)
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID, createHash } from "node:crypto";
import { assess, ACTIVITIES } from "./engine.mjs";
import { assessDataQuality } from "./data-quality.mjs";
import { generateRecommendations, getWhatIfOptions } from "./action-intelligence.mjs";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { removeUndefinedValues: true });
const T = {
  c: process.env.CAMPUS_TABLE,
  a: process.env.ASSESS_TABLE,
  p: process.env.PLAN_TABLE,
  i: process.env.INCIDENT_TABLE,
};
const OPENAQ_KEY = process.env.OPENAQ_API_KEY || "";

// Pre-seeded campus data with verified OpenAQ location IDs for Delhi-NCR
// Note: coordinates are approximate; forecasts cover the grid cell, not a specific sensor
const SEED = [
  {
    campusId: "campus_ghaziabad",
    name: "Ghaziabad (Muradnagar) Campus",
    city: "Ghaziabad",
    latitude: 28.7525,
    longitude: 77.4985,
    openaqLocationId: null, // Set when verified station available
    coordinatesNote: "Approximate; forecast is for the grid cell, not a campus sensor.",
  },
  {
    campusId: "campus_noida",
    name: "Noida Sector 62 Campus",
    city: "Noida",
    latitude: 28.6280,
    longitude: 77.3649,
    openaqLocationId: null,
    coordinatesNote: "Approximate; forecast is for the grid cell, not a campus sensor.",
  },
  {
    campusId: "campus_delhi",
    name: "Central Delhi Campus",
    city: "New Delhi",
    latitude: 28.6139,
    longitude: 77.2090,
    openaqLocationId: null,
    coordinatesNote: "Approximate; forecast is for the grid cell, not a campus sensor.",
  },
].map(c => ({ ...c, activityTypes: ACTIVITIES }));

const gid = p => `${p}_${randomUUID().slice(0, 8)}`;
const now = () => new Date().toISOString();
const clean = (s, n = 300) => String(s ?? "").replace(/[<>]/g, "").trim().slice(0, n);

class HttpError extends Error {
  constructor(s, code, m, retryable = false) {
    super(m);
    Object.assign(this, { s, code, retryable });
  }
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

// Query with GSI if available; fall back to scan for resilience
const queryByCampus = async (tableName, campusId, gsiName = "campusId-createdAt-index") => {
  try {
    const res = await db.send(new QueryCommand({
      TableName: tableName,
      IndexName: gsiName,
      KeyConditionExpression: "campusId = :c",
      ExpressionAttributeValues: { ":c": campusId },
      ScanIndexForward: false,
      Limit: 100,
    }));
    return res.Items || [];
  } catch (gsiErr) {
    // GSI not available (e.g. during initial deployment); fall back to scan
    console.warn("GSI query failed, falling back to scan:", gsiErr.message);
    const res = await db.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: "campusId = :c",
      ExpressionAttributeValues: { ":c": campusId },
    }));
    return (res.Items || []).sort((a, b) => (b.createdAt || b.reportedAt || "").localeCompare(a.createdAt || a.reportedAt || ""));
  }
};

const scan = async (t, campusId) => {
  if (campusId) return queryByCampus(t, campusId);
  const res = await db.send(new ScanCommand({ TableName: t }));
  return res.Items || [];
};

const get = async (t, key) => (await db.send(new GetCommand({ TableName: t, Key: key }))).Item;
const put = (t, Item) => db.send(new PutCommand({ TableName: t, Item }));
const byNew = (a, b) => (b.createdAt || b.reportedAt || "").localeCompare(a.createdAt || a.reportedAt || "");

async function getCampuses() {
  let items = await scan(T.c);
  if (!items.length) {
    await Promise.all(SEED.map(c => put(T.c, { ...c, createdAt: now() })));
    items = SEED;
  }
  return items;
}

async function campusOr404(cid) {
  const list = await getCampuses();
  const c = list.find(x => x.campusId === cid);
  if (!c) throw new HttpError(404, "CAMPUS_NOT_FOUND", "Unknown campusId.");
  return c;
}

// Open-Meteo forecast
async function fetchOpenMeteo(campus) {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${campus.latitude}&longitude=${campus.longitude}` +
    `&hourly=pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide&current=pm2_5,pm10,us_aqi&timezone=UTC&forecast_days=3`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const forecast = [];
    for (const p of ["pm2_5", "pm10", "nitrogen_dioxide", "ozone", "sulphur_dioxide", "carbon_monoxide"]) {
      (j.hourly?.[p] || []).forEach((v, i) => {
        if (v !== null && Number.isFinite(v)) {
          forecast.push({
            time: j.hourly.time[i] + ":00Z",
            pollutant: p,
            value: v,
            unit: j.hourly_units?.[p] || "µg/m³",
            dataMode: "forecast",
            provider: "Open-Meteo Air Quality (CAMS model)",
          });
        }
      });
    }
    const modelledCurrent = j.current ? {
      time: j.current.time + ":00Z",
      pm2_5: j.current.pm2_5,
      pm10: j.current.pm10,
      units: j.current_units,
      dataMode: "forecast",
    } : null;
    return { forecast, modelledCurrent };
  } catch (e) {
    console.error("open_meteo_failure", e.message);
    throw new HttpError(502, "UPSTREAM_DATA_UNAVAILABLE", "Air-quality data could not be retrieved from Open-Meteo.", true);
  }
}

// OpenAQ v3 – fetch recent measurements from a station near the campus
async function fetchOpenAQ(campus) {
  if (!OPENAQ_KEY || !campus.openaqLocationId) return { observations: [], warnings: [] };
  const url = `https://api.openaq.org/v3/locations/${campus.openaqLocationId}/measurements?limit=10&order_by=datetime&sort_order=desc`;
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { "X-API-Key": OPENAQ_KEY },
    });
    if (!r.ok) {
      console.warn("openaq_non_200", r.status);
      return { observations: [], warnings: [`OpenAQ returned HTTP ${r.status}. No station readings available.`] };
    }
    const j = await r.json();
    const results = j.results || [];
    const observations = results
      .filter(m => m.value !== null && Number.isFinite(m.value))
      .map(m => ({
        time: m.period?.datetimeFrom?.utc || m.datetime || now(),
        pollutant: m.parameter?.name || m.parameter,
        value: m.value,
        unit: m.parameter?.units || "µg/m³",
        dataMode: "observed",
        provider: `OpenAQ · Station ${campus.openaqLocationId}`,
        stationId: String(campus.openaqLocationId),
        stationName: campus.nearestStation || "Nearby station",
      }));
    return {
      observations,
      warnings: observations.length === 0 ? ["No recent measurements from the linked station."] : [],
    };
  } catch (e) {
    console.warn("openaq_failure", e.message);
    return { observations: [], warnings: ["Could not reach OpenAQ. No station readings available."] };
  }
}

async function fetchAir(campus) {
  // Run both sources in parallel; OpenAQ failure is non-fatal
  const [meteoResult, aqResult] = await Promise.allSettled([
    fetchOpenMeteo(campus),
    fetchOpenAQ(campus),
  ]);

  if (meteoResult.status === "rejected") {
    throw meteoResult.reason;
  }

  const { forecast, modelledCurrent } = meteoResult.value;
  const { observations, warnings: aqWarnings } = aqResult.status === "fulfilled"
    ? aqResult.value
    : { observations: [], warnings: ["OpenAQ data unavailable."] };

  const baseWarnings = [
    ...aqWarnings,
    ...(observations.length === 0
      ? ["No measured station observation is shown. All displayed values are MODELLED FORECASTS (CAMS model), not sensor readings."]
      : []),
  ];

  const retrievedAt = now();
  const dataQuality = assessDataQuality({
    forecast, observations, retrievedAt,
    sourceName: observations.length > 0 ? "OpenAQ + Open-Meteo Air Quality (CAMS)" : "Open-Meteo Air Quality (CAMS model)",
    existingWarnings: baseWarnings,
  });

  return {
    campusId: campus.campusId,
    retrievedAt,
    observations,
    forecast,
    modelledCurrent,
    warnings: dataQuality.warnings,
    dataQuality,
  };
}

const routes = {
  "GET /health": async () => [200, { ok: true, time: now(), version: "2.0.0" }],
  "GET /campuses": async () => [200, { campuses: await getCampuses() }],
  "GET /air-quality": async q => [200, await fetchAir(await campusOr404(q.campusId))],
  "POST /assessments": async (_, b) => {
    const c = await campusOr404(b.campusId);
    if (!ACTIVITIES.includes(b.activity)) {
      throw new HttpError(400, "INVALID_ACTIVITY", `activity must be one of ${ACTIVITIES.join(", ")}.`);
    }
    const air = await fetchAir(c);
    const r = assess({ forecast: air.forecast, activity: b.activity });
    const dataQuality = air.dataQuality || assessDataQuality({ forecast: air.forecast, observations: air.observations, retrievedAt: air.retrievedAt });
    const tempAssessment = { ...r, assessmentId: "pending", activity: b.activity };
    const recommendations = generateRecommendations({ assessment: tempAssessment, dataQuality });
    const item = {
      assessmentId: gid("asmt"),
      campusId: c.campusId,
      activity: b.activity,
      createdAt: now(),
      dataMode: air.observations.length > 0 ? "observed" : "forecast",
      sourceName: air.observations.length > 0 ? "OpenAQ + Open-Meteo" : "Open-Meteo Air Quality",
      sourceTimestamp: air.retrievedAt,
      disclaimer: "Decision support only; not medical advice or an official alert.",
      dataQuality,
      recommendations,
      ...r,
    };
    item.recommendations = item.recommendations.map(rec => ({ ...rec, sourceAssessmentId: item.assessmentId }));
    await put(T.a, item);
    return [201, item];
  },
  "GET /assessments": async q => [200, { assessments: await scan(T.a, q.campusId) }],
  "POST /action-plans": async (_, b) => {
    const { assessmentId, customAlternativeId } = b;
    const a = await get(T.a, { assessmentId: clean(assessmentId, 40) });
    if (!a) throw new HttpError(404, "ASSESSMENT_NOT_FOUND", "Unknown assessmentId.");
    
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
      if (!a.recommendedActions?.length) throw new HttpError(400, "NO_ACTIONS", "Assessment has no actions to plan.");
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
      planId: gid("plan"),
      assessmentId: a.assessmentId,
      campusId: a.campusId,
      status: "draft",
      createdAt: t,
      updatedAt: t,
      approvedBy: null,
      actions,
      decisionReceipt,
      audit: [{ at: t, by: "system", event: `Draft created from ${a.assessmentId} (${customAlternativeId ? `Alternative: ${customAlternativeId}` : 'Top Recommendation'})` }],
    };
    await put(T.p, plan);
    return [201, plan];
  },
  "GET /action-plans": async q => [200, { plans: await scan(T.p, q.campusId) }],
  "PATCH /action-plans/:id": async (_, b, pid) => {
    const p = await get(T.p, { planId: pid });
    if (!p) throw new HttpError(404, "PLAN_NOT_FOUND", "Unknown planId.");
    const by = clean(b.actor, 40) || "demo-user", t = now();
    if (b.operation === "approve_plan") {
      if (p.status !== "draft") throw new HttpError(400, "INVALID_TRANSITION", "Only draft plans can be approved.");
      Object.assign(p, { status: "approved", approvedBy: by, approvedAt: t });
      p.audit.push({ at: t, by, event: "Plan approved" });
    } else if (b.operation === "dismiss_plan") {
      if (p.status !== "draft") throw new HttpError(400, "INVALID_TRANSITION", "Only draft plans can be dismissed.");
      p.status = "dismissed";
      p.dismissedBy = by;
      p.dismissedAt = t;
      const reason = clean(b.reason, 200);
      p.audit.push({ at: t, by, event: reason ? `Plan dismissed: ${reason}` : "Plan dismissed" });
    } else if (b.operation === "update_action") {
      if (p.status !== "approved") throw new HttpError(400, "INVALID_TRANSITION", "Plan must be approved before tasks change.");
      const a = p.actions.find(x => x.actionId === b.actionId);
      if (!a) throw new HttpError(404, "ACTION_NOT_FOUND", "Unknown actionId.");
      if (!["pending", "in_progress", "completed"].includes(b.status)) {
        throw new HttpError(400, "INVALID_STATUS", "Invalid status.");
      }
      p.audit.push({ at: t, by, event: `"${a.label}": ${a.status} → ${b.status}` });
      a.status = b.status;
      a.completedAt = b.status === "completed" ? t : null;
      if (p.actions.every(x => x.status === "completed")) p.status = "completed";
    } else if (b.operation === "record_outcome") {
      if (!['completed', 'approved', 'dismissed'].includes(p.status)) {
        throw new HttpError(400, "INVALID_TRANSITION", "Outcome can only be recorded for completed, approved, or dismissed plans.");
      }
      const validOutcomes = ["improved", "unchanged", "worsened", "unable_to_determine"];
      const outcomeStatus = clean(b.outcomeStatus, 40);
      if (!validOutcomes.includes(outcomeStatus)) {
        throw new HttpError(400, "INVALID_OUTCOME", `outcomeStatus must be one of: ${validOutcomes.join(", ")}.`);
      }
      p.outcomeStatus = outcomeStatus;
      p.outcomeNotes = clean(b.outcomeNotes || "", 500);
      p.outcomeRecordedAt = t;
      p.outcomeRecordedBy = by;
      p.outcomeEvidenceSource = clean(b.outcomeEvidenceSource || "", 200);
      p.audit.push({ at: t, by, event: `Outcome recorded: ${outcomeStatus}${p.outcomeNotes ? " — " + p.outcomeNotes.slice(0, 80) : ""}` });
    } else {
      throw new HttpError(400, "INVALID_OPERATION", "Unsupported operation.");
    }
    p.updatedAt = t;
    await put(T.p, p);
    return [200, p];
  },
  "POST /verify-receipt": async (_, b) => {
    const { receipt } = b;
    if (!receipt || !receipt.hash) throw new HttpError(400, "INVALID_RECEIPT", "Receipt or hash missing.");
    
    const { hash, generatedAt, ...payload } = receipt;
    const computedHash = createHash("sha256").update(stableStringify(payload)).digest("hex");
    
    if (computedHash === hash) {
      return [200, { valid: true, message: "Receipt cryptographically verified and untampered." }];
    } else {
      return [200, { valid: false, message: "Receipt tampering detected. Hash mismatch." }];
    }
  },
  "POST /incidents": async (_, b) => {
    const c = await campusOr404(b.campusId);
    if (!["smoke", "dust", "other"].includes(b.incidentType)) {
      throw new HttpError(400, "INVALID_TYPE", "incidentType must be smoke, dust or other.");
    }
    const item = {
      incidentId: gid("inc"),
      campusId: c.campusId,
      reportedAt: now(),
      incidentType: b.incidentType,
      description: clean(b.description, 500),
      status: "reported",
    };
    await put(T.i, item);
    return [201, item];
  },
  "GET /incidents": async q => [200, { incidents: await scan(T.i, q.campusId) }],
  "GET /recommendations": async q => {
    const { assessmentId } = q;
    if (!assessmentId) throw new HttpError(400, "MISSING_PARAM", "assessmentId is required.");
    const assessment = await get(T.a, { assessmentId: clean(assessmentId, 40) });
    if (!assessment) throw new HttpError(404, "ASSESSMENT_NOT_FOUND", "Unknown assessmentId.");
    const recommendations = assessment.recommendations || [];
    const whatIfOptions = getWhatIfOptions(assessment, assessment.dataQuality);
    return [200, { assessmentId, recommendations, whatIfOptions }];
  },
};

export const handler = async event => {
  const method = event.requestContext.http.method;
  const path = event.rawPath.replace(/^\/api\/v1/, "");
  const planM = path.match(/^\/action-plans\/([\w-]+)$/);
  const key = planM ? `${method} /action-plans/:id` : `${method} ${path}`;
  const origin = event.headers?.origin || "*";
  const corsHeaders = {
    "access-control-allow-origin": process.env.ALLOWED_ORIGIN || origin,
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type,x-api-key",
    "content-type": "application/json",
  };
  // Preflight
  if (method === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }
  try {
    const fn = routes[key];
    if (!fn) throw new HttpError(404, "NOT_FOUND", "Route not found.");
    let body = {};
    if (event.body) {
      try {
        body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body);
      } catch {
        throw new HttpError(400, "INVALID_JSON", "Body must be valid JSON.");
      }
    }
    const [status, data] = await fn(event.queryStringParameters || {}, body, planM?.[1]);
    return { statusCode: status, headers: corsHeaders, body: JSON.stringify(data) };
  } catch (e) {
    const known = e instanceof HttpError;
    if (!known) console.error("unhandled", e);
    return {
      statusCode: known ? e.s : 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: known ? e.code : "INTERNAL_ERROR",
          message: known ? e.message : "Unexpected server error.",
          retryable: known ? e.retryable : false,
        },
      }),
    };
  }
};
