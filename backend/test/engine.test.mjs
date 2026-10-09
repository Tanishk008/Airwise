import assert from "node:assert/strict";
import { assess } from "../src/engine.mjs";
const now = Date.parse("2026-10-09T10:00:00Z");
const mk = (p, v, n = 24) => Array.from({ length: n }, (_, i) => ({ time: new Date(now + i * 3600e3).toISOString(), pollutant: p, value: v, provider: "t" }));
assert.equal(assess({ forecast: [], activity: "assembly", nowMs: now }).status, "insufficient_data");
assert.equal(assess({ forecast: [...mk("pm2_5", 10), ...mk("pm10", 20)], activity: "assembly", nowMs: now }).status, "monitor");
assert.equal(assess({ forecast: [...mk("pm2_5", 30), ...mk("pm10", 20)], activity: "assembly", nowMs: now }).status, "review_required");
assert.equal(assess({ forecast: [...mk("pm2_5", 90), ...mk("pm10", 20)], activity: "outdoor_sports", nowMs: now }).status, "action_recommended");
console.log("engine tests passed");
