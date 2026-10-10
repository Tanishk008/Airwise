import { test } from "node:test";
import assert from "node:assert";
import { createHash } from "node:crypto";

function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

test("Decision Receipt Cryptographic Integrity", (t) => {
  const payload = {
    assessmentId: "asmt_123",
    campusId: "campus_delhi",
    activity: "assembly",
    assessmentTimestamp: "2026-10-10T10:00:00Z",
    evidence: {
      "pm2_5": { mean24h: 150, unit: "μg/m³", provider: "Open-Meteo" }
    },
    dataQuality: { warnings: [] },
    selectedAlternative: "Move Indoors",
    actions: ["Activate HEPA filters"]
  };

  const hash = createHash("sha256").update(stableStringify(payload)).digest("hex");
  const receipt = { ...payload, generatedAt: "2026-10-10T10:01:00Z", hash };

  const verify = (r) => {
    const { hash, generatedAt, ...p } = r;
    const computed = createHash("sha256").update(stableStringify(p)).digest("hex");
    return computed === hash;
  };

  // 1. Valid receipt
  assert.strictEqual(verify(receipt), true, "Valid receipt should verify");

  // 2. Tampered evidence
  const tampered1 = JSON.parse(JSON.stringify(receipt));
  tampered1.evidence["pm2_5"].mean24h = 50; 
  assert.strictEqual(verify(tampered1), false, "Tampered evidence should fail verification");

  // 3. Tampered alternative
  const tampered2 = JSON.parse(JSON.stringify(receipt));
  tampered2.selectedAlternative = "Proceed";
  assert.strictEqual(verify(tampered2), false, "Tampered alternative should fail verification");

  // 4. Reordered keys (should pass)
  const reordered = {
    generatedAt: receipt.generatedAt,
    hash: receipt.hash,
    activity: payload.activity,
    campusId: payload.campusId,
    assessmentId: payload.assessmentId,
    assessmentTimestamp: payload.assessmentTimestamp,
    actions: payload.actions,
    selectedAlternative: payload.selectedAlternative,
    dataQuality: payload.dataQuality,
    evidence: payload.evidence
  };
  assert.strictEqual(verify(reordered), true, "Reordered keys should verify successfully");
});
