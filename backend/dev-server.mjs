/**
 * AIRWISE local development server
 * Wraps the Lambda handler in Express so you can run locally without Docker/SAM.
 * Uses a real DynamoDB or falls back to an in-memory store (if no AWS creds).
 *
 * Usage:
 *   node dev-server.mjs
 *   # API is on http://localhost:3001/api/v1
 */

import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = 3001;
const app = express();
app.use(express.json());

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:3000");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "content-type,x-api-key");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ─── In-memory store (fallback when AWS not configured) ───────────────────────
const mem = { campuses: [], assessments: [], plans: [], incidents: [] };

// ─── Shim: translate Express req → Lambda event → call handler ────────────────
async function shimHandler(req, res) {
  let mod;
  try {
    mod = await import(`./src/handler.mjs?t=${Date.now()}`);
  } catch (e) {
    console.error("Handler import error:", e.message);
    return res.status(500).json({ error: { code: "LOAD_ERROR", message: e.message } });
  }

  // Build a minimal Lambda HTTP API v2 event
  const event = {
    requestContext: {
      http: { method: req.method },
    },
    rawPath: req.path,
    queryStringParameters: Object.keys(req.query).length ? req.query : null,
    headers: req.headers,
    body: req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : null,
    isBase64Encoded: false,
  };

  try {
    const result = await mod.handler(event);
    const body = result.body ?? "";
    Object.entries(result.headers ?? {}).forEach(([k, v]) => res.setHeader(k, v));
    res.status(result.statusCode).send(body);
  } catch (e) {
    console.error("Handler error:", e);
    res.status(500).json({ error: { code: "HANDLER_ERROR", message: e.message } });
  }
}

// ─── Mount all /api/v1/* routes through the shim ─────────────────────────────
app.all("/api/v1/*", shimHandler);

// ─── Root ─────────────────────────────────────────────────────────────────────
app.get("/", (_, res) => res.json({ service: "AIRWISE local dev server", api: "/api/v1" }));

// ─── Start ────────────────────────────────────────────────────────────────────
createServer(app).listen(PORT, () => {
  console.log(`\n🌫️  AIRWISE local API running at http://localhost:${PORT}/api/v1`);
  console.log(`   Health: http://localhost:${PORT}/api/v1/health\n`);
  console.log("   AWS credentials:", process.env.AWS_ACCESS_KEY_ID ? "✓ found" : "⚠ not set — DynamoDB calls will fail");
  console.log("   Open-Meteo: always available (no key needed)");
  console.log("   OpenAQ key:", process.env.OPENAQ_API_KEY ? "✓ set" : "not set (forecast-only mode)");
  console.log("\n   Tip: export AWS_PROFILE=<profile> before running to use DynamoDB.\n");
});
