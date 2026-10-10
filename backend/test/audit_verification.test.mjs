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

async function verifyAll() {
  console.log("=== EXECUTING COMPREHENSIVE AIRWISE AUDIT VERIFICATION ===");

  // 1. Health check
  const health = await req("/health");
  assert.equal(health.status, 200);
  assert.equal(health.data.ok, true);
  console.log("✓ Health Check Passed");

  // 2. Campuses
  const campuses = await req("/campuses");
  assert.equal(campuses.status, 200);
  assert.equal(campuses.data.campuses.length, 3);
  const cIds = campuses.data.campuses.map(c => c.campusId);
  assert.ok(cIds.includes("campus_delhi"));
  assert.ok(cIds.includes("campus_noida"));
  assert.ok(cIds.includes("campus_ghaziabad"));
  console.log("✓ All 3 Seed Campuses Verified");

  // 3. 6 Pollutants live telemetry from Open-Meteo
  const air = await req("/air-quality?campusId=campus_delhi");
  assert.equal(air.status, 200);
  const foundPollutants = new Set(air.data.forecast.map(f => f.pollutant));
  const expectedPollutants = ["pm2_5", "pm10", "nitrogen_dioxide", "ozone", "sulphur_dioxide", "carbon_monoxide"];
  for (const exp of expectedPollutants) {
    assert.ok(foundPollutants.has(exp), `Expected pollutant ${exp} to be present in forecast`);
  }
  assert.ok(air.data.warnings.length > 0, "Air data must include explicit provenance warnings");
  console.log("✓ All 6 Pollutants Verified in Live Open-Meteo Telemetry");

  // 4. Activity Assessments for all 3 activities
  const activities = ["outdoor_sports", "assembly", "outdoor_work"];
  const assessments = [];
  for (const act of activities) {
    const asmt = await req("/assessments", {
      method: "POST",
      body: JSON.stringify({ campusId: "campus_delhi", activity: act }),
    });
    assert.equal(asmt.status, 201);
    assert.equal(asmt.data.activity, act);
    assert.ok(asmt.data.recommendedActions.length >= 1);
    assessments.push(asmt.data);
  }
  console.log("✓ Risk Evaluations for all 3 Campus Activities Verified");

  // 5. Action Plan Creation
  const plan = await req("/action-plans", {
    method: "POST",
    body: JSON.stringify({ assessmentId: assessments[0].assessmentId }),
  });
  assert.equal(plan.status, 201);
  assert.equal(plan.data.status, "draft");
  assert.ok(plan.data.actions.length >= 2);
  assert.equal(plan.data.audit[0].by, "system");
  console.log("✓ Draft Response Plan Created with Initial Audit Entry");

  // 6. Action Plan Named Approval
  const approver = "Dr. Radhika Sharma (Campus Director)";
  const approved = await req(`/action-plans/${plan.data.planId}`, {
    method: "PATCH",
    body: JSON.stringify({ operation: "approve_plan", actor: approver }),
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.data.status, "approved");
  assert.equal(approved.data.approvedBy, approver);
  assert.ok(approved.data.audit.some(e => e.by === approver && e.event === "Plan approved"));
  console.log("✓ Named Administrative Approval Verified");

  // 7. Sequential Task Transitions to Completed
  for (const actItem of approved.data.actions) {
    // Start task
    const startRes = await req(`/action-plans/${plan.data.planId}`, {
      method: "PATCH",
      body: JSON.stringify({ operation: "update_action", actionId: actItem.actionId, status: "in_progress", actor: actItem.owner }),
    });
    assert.equal(startRes.status, 200);

    // Complete task
    const doneRes = await req(`/action-plans/${plan.data.planId}`, {
      method: "PATCH",
      body: JSON.stringify({ operation: "update_action", actionId: actItem.actionId, status: "completed", actor: actItem.owner }),
    });
    assert.equal(doneRes.status, 200);
  }

  // Check auto-complete
  const planList = await req("/action-plans?campusId=campus_delhi");
  const completedPlan = planList.data.plans.find(p => p.planId === plan.data.planId);
  assert.equal(completedPlan.status, "completed");
  console.log("✓ Task Progression & Automatic Plan Completion Verified");

  // 8. Dismissal Workflow
  const plan2 = await req("/action-plans", {
    method: "POST",
    body: JSON.stringify({ assessmentId: assessments[1].assessmentId }),
  });
  assert.equal(plan2.status, 201);
  const dismissed = await req(`/action-plans/${plan2.data.planId}`, {
    method: "PATCH",
    body: JSON.stringify({
      operation: "dismiss_plan",
      actor: "Dr. Radhika Sharma",
      reason: "All classes relocated to indoor auditorium"
    }),
  });
  assert.equal(dismissed.status, 200);
  assert.equal(dismissed.data.status, "dismissed");
  assert.equal(dismissed.data.dismissedBy, "Dr. Radhika Sharma");
  assert.ok(dismissed.data.audit.some(e => e.event.includes("All classes relocated to indoor auditorium")));
  console.log("✓ Plan Dismissal & Recorded Audit Justification Verified");

  // 9. Community Incident Persistence
  const inc = await req("/incidents", {
    method: "POST",
    body: JSON.stringify({
      campusId: "campus_noida",
      incidentType: "dust",
      description: "Severe road dust near Sector 62 metro station entrance"
    }),
  });
  assert.equal(inc.status, 201);
  assert.equal(inc.data.campusId, "campus_noida");

  const noidaInc = await req("/incidents?campusId=campus_noida");
  assert.ok(noidaInc.data.incidents.some(i => i.incidentId === inc.data.incidentId));

  // Verify campus isolation
  const delhiInc = await req("/incidents?campusId=campus_delhi");
  assert.ok(!delhiInc.data.incidents.some(i => i.incidentId === inc.data.incidentId));
  console.log("✓ Incident Logging & Cross-Campus Isolation Verified");

  console.log("\n=== ALL AUDIT VERIFICATION CHECKS COMPLETED WITH 100% SUCCESS ===");
}

verifyAll().catch(err => {
  console.error("Audit verification failed:", err);
  process.exit(1);
});
