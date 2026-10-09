import assert from "node:assert/strict";

const API = "http://localhost:3001/api/v1";

async function req(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function runTests() {
  console.log("Starting full API integration test suite...");

  // 1. Health check
  const health = await req("/health");
  assert.equal(health.status, 200, "Health check must return 200");
  assert.equal(health.data.ok, true, "Health ok must be true");

  // 2. Campuses
  const campuses = await req("/campuses");
  assert.equal(campuses.status, 200, "Campuses must return 200");
  assert.ok(Array.isArray(campuses.data.campuses), "Campuses must be an array");
  assert.ok(campuses.data.campuses.length >= 3, "Must have at least 3 seeded campuses");

  // 3. Air Quality
  const air = await req("/air-quality?campusId=campus_delhi");
  assert.equal(air.status, 200, "Air quality must return 200 for valid campus");
  assert.equal(air.data.campusId, "campus_delhi");
  assert.ok(Array.isArray(air.data.forecast), "Forecast must be an array");
  assert.ok(air.data.forecast.length > 0, "Forecast must contain data points");

  // 4. Air Quality Error Case
  const invalidAir = await req("/air-quality?campusId=unknown_campus_xyz");
  assert.equal(invalidAir.status, 404, "Unknown campus must return 404");
  assert.equal(invalidAir.data.error?.code, "CAMPUS_NOT_FOUND");

  // 5. Assessment Validation Failure
  const invalidAssess = await req("/assessments", {
    method: "POST",
    body: JSON.stringify({ campusId: "campus_delhi", activity: "invalid_activity_type" }),
  });
  assert.equal(invalidAssess.status, 400, "Invalid activity must return 400");
  assert.equal(invalidAssess.data.error?.code, "INVALID_ACTIVITY");

  // 6. Valid Assessment Creation
  const assess = await req("/assessments", {
    method: "POST",
    body: JSON.stringify({ campusId: "campus_delhi", activity: "outdoor_sports" }),
  });
  assert.equal(assess.status, 201, "Assessment creation must return 201");
  assert.ok(assess.data.assessmentId, "Assessment must have an ID");
  assert.ok(["monitor", "review_required", "action_recommended", "insufficient_data"].includes(assess.data.status));
  assert.ok(Array.isArray(assess.data.reasons), "Reasons must be array");
  assert.ok(assess.data.guidelineVersion.includes("WHO"), "Guideline version must include WHO");

  // 7. Get Assessments
  const assessList = await req("/assessments?campusId=campus_delhi");
  assert.equal(assessList.status, 200);
  assert.ok(assessList.data.assessments.some(a => a.assessmentId === assess.data.assessmentId));

  // 8. Action Plan Validation
  const invalidPlan = await req("/action-plans", {
    method: "POST",
    body: JSON.stringify({ assessmentId: "asmt_nonexistent" }),
  });
  assert.equal(invalidPlan.status, 404);
  assert.equal(invalidPlan.data.error?.code, "ASSESSMENT_NOT_FOUND");

  // 9. Valid Action Plan Creation
  const plan = await req("/action-plans", {
    method: "POST",
    body: JSON.stringify({ assessmentId: assess.data.assessmentId }),
  });
  assert.equal(plan.status, 201);
  assert.equal(plan.data.status, "draft");
  assert.equal(plan.data.assessmentId, assess.data.assessmentId);
  assert.ok(plan.data.actions.length > 0);

  // 10. Invalid Plan Transition (trying to update action before plan is approved)
  const prematureAction = await req(`/action-plans/${plan.data.planId}`, {
    method: "PATCH",
    body: JSON.stringify({ operation: "update_action", actionId: "act_1", status: "completed" }),
  });
  assert.equal(prematureAction.status, 400, "Cannot update actions on draft plan");

  // 11. Plan Approval
  const approveRes = await req(`/action-plans/${plan.data.planId}`, {
    method: "PATCH",
    body: JSON.stringify({ operation: "approve_plan", actor: "Dr. QA Officer" }),
  });
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.data.status, "approved");
  assert.equal(approveRes.data.approvedBy, "Dr. QA Officer");
  assert.ok(approveRes.data.audit.some(e => e.by === "Dr. QA Officer" && e.event === "Plan approved"));

  // 12. Task Progression & Auto Completion
  for (const action of plan.data.actions) {
    const updateRes = await req(`/action-plans/${plan.data.planId}`, {
      method: "PATCH",
      body: JSON.stringify({ operation: "update_action", actionId: action.actionId, status: "completed", actor: "Coordinator" }),
    });
    assert.equal(updateRes.status, 200);
  }

  const finalPlan = await req(`/action-plans?campusId=campus_delhi`);
  const finished = finalPlan.data.plans.find(p => p.planId === plan.data.planId);
  assert.equal(finished.status, "completed", "Plan must automatically reach completed status when all actions done");

  // 13. Incident Submission Validation
  const badIncident = await req("/incidents", {
    method: "POST",
    body: JSON.stringify({ campusId: "campus_delhi", incidentType: "volcano", description: "test" }),
  });
  assert.equal(badIncident.status, 400);

  // 14. Valid Incident Submission
  const incident = await req("/incidents", {
    method: "POST",
    body: JSON.stringify({ campusId: "campus_delhi", incidentType: "smoke", description: "Controlled leaves burning near boundary" }),
  });
  assert.equal(incident.status, 201);
  assert.ok(incident.data.incidentId);

  // 15. Incident Retrieval & Campus Isolation
  const delhiIncidents = await req("/incidents?campusId=campus_delhi");
  assert.ok(delhiIncidents.data.incidents.some(i => i.incidentId === incident.data.incidentId));

  const ghaziabadIncidents = await req("/incidents?campusId=campus_ghaziabad");
  assert.ok(!ghaziabadIncidents.data.incidents.some(i => i.incidentId === incident.data.incidentId), "Cross-campus isolation must hold");

  console.log("All 15 integration test suites passed successfully!");
}

runTests().catch(err => {
  console.error("Integration test failure:", err);
  process.exit(1);
});
