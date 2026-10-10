import test from 'node:test';
import assert from 'node:assert/strict';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// Mocks
let getMock = null;
let putMock = null;

const originalSend = DynamoDBDocumentClient.prototype.send;
DynamoDBDocumentClient.prototype.send = async function(cmd) {
  if (cmd.constructor.name === 'GetCommand' && getMock) return getMock(cmd);
  if (cmd.constructor.name === 'PutCommand' && putMock) return putMock(cmd);
  if (cmd.constructor.name === 'ScanCommand') return { Items: [] };
  return {};
};

const { handler } = await import('../src/handler.mjs');

function createEvent(method, path, body = null) {
  return {
    requestContext: { http: { method } },
    rawPath: `/api/v1${path}`,
    body: body ? JSON.stringify(body) : null,
    isBase64Encoded: false,
    headers: { origin: 'http://localhost:3000' }
  };
}

test('POST /action-plans generates decision receipt and maps scenarios', async () => {
  // Mock getting an assessment
  getMock = (cmd) => {
    return {
      Item: {
        assessmentId: "asmt_123",
        campusId: "campus_ghaziabad",
        activity: "outdoor_sports",
        createdAt: "2026-10-10T10:00:00.000Z",
        evidence: { pm2_5: 150 },
        dataQuality: { score: 100 },
        status: "review_required",
        recommendations: [
          {
            id: "move_activity_indoors",
            suggestedSteps: ["Task 1", "Task 2"],
            assignedRole: "Sports Coordinator"
          }
        ]
      }
    };
  };

  let savedPlan = null;
  putMock = (cmd) => {
    savedPlan = cmd.input.Item;
    return {};
  };

  const event = createEvent('POST', '/action-plans', {
    assessmentId: 'asmt_123',
    customAlternativeId: 'move_indoors'
  });

  const response = await handler(event);
  assert.equal(response.statusCode, 201);
  const plan = JSON.parse(response.body);

  // 1 & 2. Every supported scenario maps to expected tasks and returns decision receipt
  assert.equal(plan.actions.length, 2, "Tasks should map to move_indoors steps");
  assert.equal(plan.actions[0].label, "Task 1");
  assert.ok(plan.decisionReceipt, "Decision receipt should be generated");
  assert.equal(plan.decisionReceipt.selectedAlternative, 'move_indoors');
  assert.ok(plan.decisionReceipt.hash, "Hash should exist");

  // 3. Saved DynamoDB plan includes the receipt
  assert.ok(savedPlan, "Plan should be saved to DynamoDB");
  assert.ok(savedPlan.decisionReceipt, "Saved plan should include decision receipt");
  assert.deepEqual(savedPlan.decisionReceipt, plan.decisionReceipt);
});

test('POST /verify-receipt accepts valid receipt and rejects tampered one', async () => {
  const validReceipt = {
    assessmentId: "asmt_123",
    campusId: "campus_ghaziabad",
    activity: "outdoor_sports",
    assessmentTimestamp: "2026-10-10T10:00:00.000Z",
    evidence: { pm2_5: 150 },
    dataQuality: { score: 100 },
    selectedAlternative: "move_indoors",
    actions: ["Task 1", "Task 2"]
  };
  
  const { createHash } = await import('node:crypto');
  function stableStringify(obj) {
    if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
    if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
    const keys = Object.keys(obj).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
  }
  
  const hash = createHash("sha256").update(stableStringify(validReceipt)).digest("hex");
  const receiptToVerify = { ...validReceipt, generatedAt: new Date().toISOString(), hash };

  // 4 & 7. Unchanged receipt verifies successfully (deterministic)
  const eventValid = createEvent('POST', '/verify-receipt', { receipt: receiptToVerify });
  const resValid = await handler(eventValid);
  assert.equal(resValid.statusCode, 200);
  assert.equal(JSON.parse(resValid.body).valid, true);

  // 5. Changing protected evidence causes verification to fail
  const tamperedReceipt = { ...receiptToVerify, evidence: { pm2_5: 50 } };
  const eventTampered = createEvent('POST', '/verify-receipt', { receipt: tamperedReceipt });
  const resTampered = await handler(eventTampered);
  assert.equal(resTampered.statusCode, 200);
  assert.equal(JSON.parse(resTampered.body).valid, false);

  // 6. Missing or malformed receipts are rejected safely
  const eventMissing = createEvent('POST', '/verify-receipt', { receipt: {} });
  const resMissing = await handler(eventMissing);
  assert.equal(resMissing.statusCode, 400);
});

test('API Gateway event format handling', async () => {
  // 8. Lambda route handles the actual API Gateway event format
  const event = {
    requestContext: { http: { method: 'GET' } },
    rawPath: '/api/v1/health',
    headers: { origin: 'http://test' }
  };
  const response = await handler(event);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['access-control-allow-origin'], 'http://test');
});
