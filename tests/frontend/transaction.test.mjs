import test from "node:test";
import assert from "node:assert/strict";
import { assertSuccessfulTransaction, classifyTransaction, createWriteCoordinator, FINISHED_WITH_RETURN, TransientTransportError, waitForFinalized } from "../../frontend/src/transaction.js";
import { assertApplicationReadback, assessmentExpectedState, pendingStorageKey } from "../../frontend/src/contract.js";
import { parseUtcEpoch } from "../../frontend/src/time.js";
import transportFaultHandler from "../../frontend/api/e2e-transport-fault.js";

const HASH = `0x${"a".repeat(64)}`;
const ACCOUNT = `0x${"1".repeat(40)}`;
const CONTRACT = `0x${"2".repeat(40)}`;
const success = { statusName: "FINALIZED", resultName: "MAJORITY_AGREE", txExecutionResultName: FINISHED_WITH_RETURN };

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key), keys: () => [...values.keys()] };
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

test("pending journals are isolated per application while retaining the legacy key", () => {
  assert.notEqual(pendingStorageKey("e2e-positive-20260902-05"), pendingStorageKey("e2e-unresolved-20260902-04"));
  assert.match(pendingStorageKey("e2e-positive-20260902-05"), /pending-write\.v1\.e2e-positive-20260902-05/);
});

test("legacy pending journal migrates and resumes through its application-scoped coordinator", async () => {
  const journal = storage();
  const legacyKey = "legacy";
  const scopedKey = "scoped.application";
  journal.setItem(legacyKey, JSON.stringify({ version: 1, operation: "write", hash: HASH, contract: CONTRACT, account: ACCOUNT, expected: { applicationId: "application" } }));
  const coordinator = createWriteCoordinator({
    storage: journal,
    storageKey: scopedKey,
    legacyStorageKey: legacyKey,
    waitForFinalized: async () => success,
    readback: async () => ({ state: "DRAFT" }),
    assertReadback: (result) => assert.equal(result.state, "DRAFT"),
  });
  const result = await coordinator.resume();
  assert.equal(result.state, "DRAFT");
  assert.equal(journal.getItem(legacyKey), null);
  assert.equal(journal.getItem(scopedKey), null);
});

test("multiple pending applications remain independently recoverable", async () => {
  const journal = storage();
  const secondHash = `0x${"b".repeat(64)}`;
  const pending = (hash, applicationId) => JSON.stringify({ version: 1, operation: "write", hash, contract: CONTRACT, account: ACCOUNT, expected: { applicationId } });
  journal.setItem("scoped.one", pending(HASH, "one"));
  journal.setItem("scoped.two", pending(secondHash, "two"));
  const recovered = [];
  for (const [key, applicationId] of [["scoped.one", "one"], ["scoped.two", "two"]]) {
    const coordinator = createWriteCoordinator({
      storage: journal,
      storageKey: key,
      waitForFinalized: async () => success,
      readback: async (record) => { recovered.push(record.expected.applicationId); return { state: "DRAFT" }; },
      assertReadback: () => {},
    });
    await coordinator.resume();
    assert.equal(journal.getItem(key), null);
    assert.equal(applicationId, recovered.at(-1));
  }
  assert.deepEqual(recovered, ["one", "two"]);
});

test("a legacy pending application blocks only a write for that same application", async () => {
  const journal = storage();
  journal.setItem("legacy", JSON.stringify({ version: 1, operation: "write", hash: HASH, contract: CONTRACT, account: ACCOUNT, expected: { applicationId: "old" } }));
  const coordinator = createWriteCoordinator({
    storage: journal,
    storageKey: "scoped.new",
    legacyStorageKey: "legacy",
    waitForFinalized: async () => success,
    readback: async () => ({ state: "DRAFT" }),
    assertReadback: () => {},
  });
  await assert.rejects(() => coordinator.execute({ operation: "write", contract: CONTRACT, account: ACCOUNT, expected: { applicationId: "old" }, submit: async () => HASH }), /pending reconciliation/i);
  await assert.doesNotReject(() => coordinator.execute({ operation: "write", contract: CONTRACT, account: ACCOUNT, expected: { applicationId: "new" }, submit: async () => `0x${"c".repeat(64)}` }));
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

test("finality polling retries one transient 503 with bounded delay and the same hash", async () => {
  const calls = [];
  const delays = [];
  const retries = [];
  const client = {
    getTransaction: async ({ hash }) => {
      calls.push(hash);
      if (calls.length === 1) throw new TransientTransportError("RPC server returned HTTP 503.", { status: 503, retryAfterMs: 1000 });
      return success;
    },
  };
  const result = await waitForFinalized(client, HASH, {
    maxPolls: 1,
    maxTransportRetries: 1,
    sleep: async (ms) => delays.push(ms),
    onTransportError: (event) => retries.push(event),
  });
  assert.equal(result, success);
  assert.deepEqual(calls, [HASH, HASH]);
  assert.deepEqual(delays, [1000]);
  assert.equal(retries[0].attempt, 1);
});

test("finality polling caps Retry-After and recognizes fetch failures only by transport message", async () => {
  const delays = [];
  let calls = 0;
  await waitForFinalized({ getTransaction: async () => {
    calls += 1;
    if (calls === 1) throw new TransientTransportError("server busy", { status: 503, retryAfterMs: 60000 });
    return success;
  } }, HASH, { maxPolls: 1, transportRetryMaxMs: 5000, sleep: async (ms) => delays.push(ms) });
  assert.deepEqual(delays, [5000]);
  await assert.rejects(() => waitForFinalized({ getTransaction: async () => { throw new TypeError("programming mistake"); } }, HASH), /programming mistake/);
});

test("finality polling does not retry unknown errors or exceed the transport bound", async () => {
  let unknownCalls = 0;
  await assert.rejects(() => waitForFinalized({ getTransaction: async () => { unknownCalls += 1; throw new Error("bad input"); } }, HASH, { maxTransportRetries: 2 }), /bad input/);
  assert.equal(unknownCalls, 1);

  let transientCalls = 0;
  await assert.rejects(() => waitForFinalized({ getTransaction: async () => {
    transientCalls += 1;
    throw new TransientTransportError("HTTP 503", { status: 503 });
  } }, HASH, { maxTransportRetries: 1, sleep: async () => {}, random: () => 0 }), /HTTP 503/);
  assert.equal(transientCalls, 2);
});

test("controlled E2E transport endpoint returns one retryable no-store 503 response", () => {
  const headers = new Map();
  const response = {
    setHeader: (name, value) => headers.set(name, value),
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  transportFaultHandler({ query: { e2e_transport_fault: "once" } }, response);
  assert.equal(response.statusCode, 503);
  assert.equal(headers.get("Cache-Control"), "no-store");
  assert.equal(headers.get("Retry-After"), "1");
  assert.deepEqual(response.body, { error: "Controlled E2E transport failure" });
});

test("controlled E2E transport endpoint is unavailable without the server-side query gate", () => {
  const response = {
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  transportFaultHandler({ query: {} }, response);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "Not found" });
});

test("finality polling cancels during transport backoff without another status request", async () => {
  const controller = new AbortController();
  let calls = 0;
  const waiting = waitForFinalized({ getTransaction: async () => {
    calls += 1;
    throw new TransientTransportError("HTTP 503", { status: 503, retryAfterMs: 5000 });
  } }, HASH, { signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  await assert.rejects(waiting, { name: "AbortError" });
  assert.equal(calls, 1);
});
