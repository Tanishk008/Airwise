import assert from "node:assert";

const API = "http://localhost:3001/api/v1";
const CAMPUS = "campus_ghaziabad";

async function req(path, method = "GET", body = null) {
  const init = { method, headers: {} };
  if (body) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(API + path, init);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function runSmokeTest() {
  console.log("Starting full E2E workflow smoke test...");

  // 1. Health check
  let { status } = await req("/health");
  assert.equal(status, 200, "Health check failed");
  console.log("✓ API is up");

  // 2. Assessment Generation
  let { status: s1, data: d1 } = await req("/assessments", "POST", {
    campusId: CAMPUS,
    activity: "outdoor_sports"
  });
  if (s1 !== 201) throw new Error("Assessment creation failed: " + JSON.stringify(d1));
  const assessment = d1;
  assert(assessment.assessmentId, "Missing assessmentId");
  assert(assessment.evidence, "Missing evidence");
  console.log(`✓ Assessment generated (${assessment.status})`);

  // 3. Decision Simulator / Recommendations
  let { status: s2, data: d2 } = await req(`/recommendations?assessmentId=${assessment.assessmentId}`);
  assert.equal(s2, 200, "Recommendations fetch failed");
  assert(d2.recommendations.length > 0, "No recommendations found");
  assert(d2.whatIfOptions.length > 0, "No what-if options found");
  console.log("✓ Decision simulator alternatives generated");

  // Select alternative (e.g. Move Indoors)
  const moveIndoors = d2.whatIfOptions.find(o => o.id === "move_indoors" || o.id === "shift_indoors");
  if (!moveIndoors) {
    console.log("AVAILABLE OPTIONS:", JSON.stringify(d2.whatIfOptions, null, 2));
    throw new Error("Move Indoors option not available");
  }
  const selectedAlt = moveIndoors.id;

  // 4. Create Plan with selected alternative
  let { status: s3, data: d3 } = await req("/action-plans", "POST", {
    assessmentId: assessment.assessmentId,
    customAlternativeId: selectedAlt
  });
  if (s3 !== 201) throw new Error("Plan creation failed: " + JSON.stringify(d3));
  const plan = d3;
  assert.equal(plan.status, "draft");
  if (!plan.decisionReceipt) {
    console.log("RETURNED PLAN:", JSON.stringify(plan, null, 2));
    throw new Error("Decision Receipt missing");
  }
  console.log(`✓ Plan created (ID: ${plan.planId})`);

  // 5. Verify Decision Receipt
  let { status: s4, data: d4 } = await req("/verify-receipt", "POST", {
    receipt: plan.decisionReceipt
  });
  assert.equal(s4, 200, "Receipt verification failed");
  assert.equal(d4.valid, true, "Receipt hash invalid");
  console.log("✓ Decision Receipt cryptographically verified");

  // 6. Approval Flow
  let { status: s5, data: d5 } = await req(`/action-plans/${plan.planId}`, "PATCH", {
    operation: "approve_plan",
    actor: "Smoke Test Approver"
  });
  assert.equal(s5, 200, "Approval failed");
  assert.equal(d5.status, "approved");
  console.log("✓ Plan approved");

  // 7. Task Execution
  const actionId = d5.actions[0].actionId;
  let { status: s6, data: d6 } = await req(`/action-plans/${plan.planId}`, "PATCH", {
    operation: "update_action",
    actionId,
    status: "completed",
    actor: "Smoke Tester"
  });
  assert.equal(s6, 200, "Task update failed");
  console.log("✓ Task completed");

  // Complete remaining tasks
  for (const act of d6.actions) {
    if (act.status !== "completed") {
      await req(`/action-plans/${plan.planId}`, "PATCH", {
        operation: "update_action",
        actionId: act.actionId,
        status: "completed",
        actor: "Smoke Tester"
      });
    }
  }

  // Check if plan is completed
  let { data: d7 } = await req(`/action-plans?campusId=${CAMPUS}`);
  const completedPlan = d7.plans.find(p => p.planId === plan.planId);
  assert.equal(completedPlan.status, "completed", "Plan didn't auto-complete");
  console.log("✓ Tasks finished, plan auto-completed");

  // 8. Record Outcome
  let { status: s8, data: d8 } = await req(`/action-plans/${plan.planId}`, "PATCH", {
    operation: "record_outcome",
    outcomeStatus: "unable_to_determine", // Operational outcome only
    outcomeNotes: "Smoke test notes",
    actor: "Smoke Tester"
  });
  assert.equal(s8, 200, "Outcome recording failed");
  assert.equal(d8.outcomeStatus, "unable_to_determine");
  console.log("✓ Operational outcome recorded");

  // 9. Negative testing - invalid verification
  const badReceipt = { ...plan.decisionReceipt, evidence: { ...plan.decisionReceipt.evidence, pm2_5: 999 } };
  let { status: s9, data: d9 } = await req("/verify-receipt", "POST", { receipt: badReceipt });
  assert.equal(d9.valid, false, "Tampered receipt should fail verification");
  console.log("✓ Negative test: Tampering detection works");

  console.log("✅ SMOKE TEST PASSED COMPLETELY.");
}

runSmokeTest().catch(e => {
  console.error("SMOKE TEST FAILED:", e.message);
  process.exit(1);
});
