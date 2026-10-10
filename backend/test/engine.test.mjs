import assert from "node:assert/strict";
import { assess, ACTIVITIES, GUIDELINES } from "../src/engine.mjs";

const now = Date.parse("2026-10-09T10:00:00Z");
const mk = (p, v, n = 24) => Array.from({ length: n }, (_, i) => ({
  time: new Date(now + i * 3600e3).toISOString(),
  pollutant: p,
  value: v,
  provider: "Open-Meteo Air Quality (CAMS model)"
}));

// 1. Insufficient data: empty forecast
assert.equal(assess({ forecast: [], activity: "assembly", nowMs: now }).status, "insufficient_data");
assert.equal(assess({ forecast: [], activity: "assembly", nowMs: now }).recommendedActions.length, 0);

// 2. Insufficient data: PM2.5 has < 18 points (e.g. 17 points) while PM10 is safe
assert.equal(assess({ forecast: [...mk("pm2_5", 10, 17), ...mk("pm10", 20, 24)], activity: "assembly", nowMs: now }).status, "insufficient_data");

// 3. Insufficient data: PM10 has < 18 points while PM2.5 is safe
assert.equal(assess({ forecast: [...mk("pm2_5", 10, 24), ...mk("pm10", 20, 10)], activity: "outdoor_sports", nowMs: now }).status, "insufficient_data");

// 4. Overriding danger: PM2.5 has < 18 points but PM10 exceeds NAAQS (100) -> action_recommended
assert.equal(assess({ forecast: [...mk("pm2_5", 10, 5), ...mk("pm10", 120, 24)], activity: "assembly", nowMs: now }).status, "action_recommended");

// 5. Monitor status: both PM2.5 and PM10 within WHO guidelines
const monitorRes = assess({ forecast: [...mk("pm2_5", 10), ...mk("pm10", 20)], activity: "assembly", nowMs: now });
assert.equal(monitorRes.status, "monitor");
assert.equal(monitorRes.recommendedActions[0].code, "CONTINUE_MONITORING");

// 6. Boundary WHO: PM2.5 exactly 15.0 (safe) vs 15.1 (review_required)
assert.equal(assess({ forecast: [...mk("pm2_5", 15.0), ...mk("pm10", 20)], activity: "assembly", nowMs: now }).status, "monitor");
assert.equal(assess({ forecast: [...mk("pm2_5", 15.1), ...mk("pm10", 20)], activity: "assembly", nowMs: now }).status, "review_required");

// 7. Boundary NAAQS: PM2.5 exactly 60.0 (review_required) vs 60.1 (action_recommended)
assert.equal(assess({ forecast: [...mk("pm2_5", 60.0), ...mk("pm10", 20)], activity: "outdoor_sports", nowMs: now }).status, "review_required");
assert.equal(assess({ forecast: [...mk("pm2_5", 60.1), ...mk("pm10", 20)], activity: "outdoor_sports", nowMs: now }).status, "action_recommended");

// 8. Boundary WHO: PM10 exactly 45.0 (safe) vs 45.1 (review_required)
assert.equal(assess({ forecast: [...mk("pm2_5", 10), ...mk("pm10", 45.0)], activity: "assembly", nowMs: now }).status, "monitor");
assert.equal(assess({ forecast: [...mk("pm2_5", 10), ...mk("pm10", 45.1)], activity: "assembly", nowMs: now }).status, "review_required");

// 9. Boundary NAAQS: PM10 exactly 100.0 (review_required) vs 100.1 (action_recommended)
assert.equal(assess({ forecast: [...mk("pm2_5", 10), ...mk("pm10", 100.0)], activity: "assembly", nowMs: now }).status, "review_required");
assert.equal(assess({ forecast: [...mk("pm2_5", 10), ...mk("pm10", 100.1)], activity: "assembly", nowMs: now }).status, "action_recommended");

// 10. Filter out invalid/negative/NaN values
const dirtyForecast = [
  ...mk("pm2_5", 10, 20),
  { time: new Date(now).toISOString(), pollutant: "pm2_5", value: -50, provider: "t" },
  { time: new Date(now + 3600e3).toISOString(), pollutant: "pm2_5", value: NaN, provider: "t" },
  ...mk("pm10", 20, 24)
];
const dirtyRes = assess({ forecast: dirtyForecast, activity: "outdoor_work", nowMs: now });
assert.equal(dirtyRes.status, "monitor");
assert.equal(dirtyRes.evidence.pm2_5.hours, 20);

// 11. Role-specific action mappings for all 3 activities
for (const act of ACTIVITIES) {
  const res = assess({ forecast: [...mk("pm2_5", 90), ...mk("pm10", 20)], activity: act, nowMs: now });
  assert.equal(res.status, "action_recommended");
  assert.ok(res.recommendedActions.length >= 2);
  assert.ok(res.recommendedActions.every(a => a.requiresApproval === true));
}

console.log("All comprehensive engine unit tests passed successfully!");

