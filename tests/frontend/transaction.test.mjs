import test from "node:test";
import assert from "node:assert/strict";
import { assertSuccessfulTransaction, classifyTransaction, createWriteCoordinator, FINISHED_WITH_RETURN } from "../../frontend/src/transaction.js";
import { assertApplicationReadback, assessmentExpectedState } from "../../frontend/src/contract.js";
import { parseUtcEpoch } from "../../frontend/src/time.js";

const HASH = `0x${"a".repeat(64)}`;
const ACCOUNT = `0x${"1".repeat(40)}`;
const CONTRACT = `0x${"2".repeat(40)}`;
const success = { statusName: "FINALIZED", resultName: "MAJORITY_AGREE", txExecutionResultName: FINISHED_WITH_RETURN };

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test("transaction success requires GenLayer finality, consensus and semantic return", () => {
  assert.equal(classifyTransaction(success).successful, true);
  assert.equal(classifyTransaction({ ...success, statusName: "ACCEPTED" }).successful, false);
  assert.equal(classifyTransaction({ ...success, resultName: undefined }).successful, false);
  assert.equal(classifyTransaction({ ...success, resultName: "UNDETERMINED" }).successful, false);
  assert.throws(() => assertSuccessfulTransaction({ ...success, txExecutionResultName: "FINISHED_WITH_ERROR" }), /execution failed/);
  assert.throws(() => assertSuccessfulTransaction({ ...success, resultName: undefined }), /Consensus failed/);
});

test("current leader receipt shape maps to FINISHED_WITH_RETURN", () => {
  const result = classifyTransaction({ statusName: "FINALIZED", resultName: "MAJORITY_AGREE", consensus_data: { leader_receipt: [{ mode: "leader", execution_result: "SUCCESS", result: { status: "return" } }] } });
  assert.equal(result.execution, FINISHED_WITH_RETURN);
  assert.equal(result.successful, true);
});

test("current Studio transaction shape maps result_name and leader success", () => {
  const result = classifyTransaction({
    status: 7,
    statusName: "FINALIZED",
    result: 6,
    result_name: "MAJORITY_AGREE",
    consensus_data: { leader_receipt: [{ mode: "leader", execution_result: "SUCCESS", result: { status: "return" } }] },
  });
  assert.equal(result.consensus, "MAJORITY_AGREE");
  assert.equal(result.execution, FINISHED_WITH_RETURN);
  assert.equal(result.successful, true);
});

test("assessment readback requires outcome, criteria arrays and evidence fields", () => {
  const expected = { state: "ASSESSED", outcomes: ["ELIGIBLE", "UNRESOLVED"], requireAssessmentFields: true };
  assert.doesNotThrow(() => assertApplicationReadback({ state: "ASSESSED", outcome: "ELIGIBLE", matched_criteria: [], failed_criteria: [], evidence_digest: "digest", source_observed_at: 1, last_reason: "", retry_count: 0 }, expected));
  assert.throws(() => assertApplicationReadback({ state: "ASSESSED" }, expected), /outcome|criteria|assessment/i);
});

test("assessment expectations distinguish positive assess from unresolved retry", () => {
  const positive = assessmentExpectedState(false, "positive");
  assert.equal(positive.outcome, "ELIGIBLE");
  assert.deepEqual(positive.matchedCriteria, ["REGION", "ORG_TYPE", "DEADLINE"]);
  assert.equal(positive.retryCount, 0);

  const unresolved = assessmentExpectedState(false, "unresolved", { grant_url: "https://httpbin.org/json" });
  assert.equal(unresolved.outcome, "UNRESOLVED");
  assert.deepEqual(unresolved.matchedCriteria, []);
  assert.equal(unresolved.evidenceDigest, "");
  assert.equal(unresolved.sourceObservedAt, 0);
  assert.equal(unresolved.lastReason, "SOURCE_INVALID_OR_UNBOUND");

  const retry = assessmentExpectedState(true, "unresolved", { state: "ASSESSED", outcome: "UNRESOLVED" });
  assert.equal(retry.outcome, "UNRESOLVED");
  assert.deepEqual(retry.matchedCriteria, []);
  assert.equal(retry.evidenceDigest, "");
  assert.equal(retry.sourceObservedAt, 0);
  assert.equal(retry.lastReason, "SOURCE_INVALID_OR_UNBOUND");
  assert.equal(retry.minimumRetryCount, 1);
  assert.throws(() => assessmentExpectedState(true, "positive", { state: "ASSESSED", outcome: "ELIGIBLE" }), /not retryable/i);
});

test("UTC form timestamps preserve exact seconds for transaction arguments", () => {
  assert.equal(parseUtcEpoch("2026-12-31T23:58:20"), 1798761500);
  assert.equal(parseUtcEpoch("2026-12-31T23:33:20"), 1798760000);
  assert.equal(parseUtcEpoch("2027-01-01T00:06:40"), 1798762000);
  assert.equal(parseUtcEpoch("invalid"), undefined);
});

test("coordinator submits once and clears journal only after readback", async () => {
  const journal = storage();
  let submits = 0;
  const coordinator = createWriteCoordinator({
    storage: journal,
    storageKey: "pending",
    waitForFinalized: async () => success,
    readback: async () => ({ state: "DRAFT" }),
    assertReadback: (result) => assert.equal(result.state, "DRAFT"),
  });
  const result = await coordinator.execute({
    operation: "create_application",
    contract: CONTRACT,
    account: ACCOUNT,
    expected: { applicationId: "one", state: "DRAFT" },
    submit: async () => { submits += 1; return HASH; },
  });
  assert.equal(result.state, "DRAFT");
  assert.equal(submits, 1);
  assert.equal(journal.getItem("pending"), null);
});

test("coordinator fails closed when storage is unavailable before submission", async () => {
  let submits = 0;
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
  const coordinator = createWriteCoordinator({ storage: broken, storageKey: "pending", waitForFinalized: async () => success, readback: async () => ({}), assertReadback: () => {} });
  await assert.rejects(() => coordinator.execute({ operation: "write", contract: CONTRACT, account: ACCOUNT, expected: {}, submit: async () => { submits += 1; return HASH; } }), /No write was submitted/);
  assert.equal(submits, 0);
});

test("coordinator exposes a degraded current-session hash without resubmitting", async () => {
  const base = storage();
  const journal = {
    ...base,
    setItem: (key, value) => key === "pending" ? (() => { throw new Error("quota"); })() : base.setItem(key, value),
  };
  const events = [];
  let submits = 0;
  const coordinator = createWriteCoordinator({
    storage: journal,
    storageKey: "pending",
    waitForFinalized: async () => { throw new Error("temporary RPC failure"); },
    readback: async () => ({}),
    assertReadback: () => {},
  });
  await assert.rejects(() => coordinator.execute({
    operation: "write",
    contract: CONTRACT,
    account: ACCOUNT,
    expected: {},
    submit: async () => { submits += 1; return HASH; },
    progress: (event) => events.push(event),
  }), /temporary RPC failure/);
  assert.equal(submits, 1);
  assert.equal(events[0].persistenceDegraded, true);
  assert.equal(journal.getItem("pending"), null);
  assert.equal(coordinator.load().hash, HASH);
});
