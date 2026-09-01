import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { createWriteCoordinator, parseContractJson, waitForFinalized } from "./transaction.js";

const env = import.meta.env ?? {};
export const CONTRACT_ADDRESS = String(env.VITE_CONTRACT_ADDRESS ?? "").trim();
export const CHAIN = studionet;
export const CHAIN_ID = Number(studionet.id);
export const EXPLORER_URL = "https://explorer-studio.genlayer.com";

export function isConfigured() {
  return /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS);
}

export function requireConfigured() {
  if (!isConfigured()) {
    throw new Error("Set VITE_CONTRACT_ADDRESS before using contract actions.");
  }
  return CONTRACT_ADDRESS;
}

export function createReadClient() {
  return createClient({ chain: CHAIN });
}

export function createWriteClient(session) {
  requireConfigured();
  if (!session?.provider || !session.account) throw new Error("Connect a supported wallet first.");
  return createClient({ chain: CHAIN, account: session.account, provider: session.provider });
}

export async function readApplication(client, applicationId) {
  const raw = await client.readContract({
    address: requireConfigured(),
    functionName: "get_application",
    args: [applicationId],
  });
  return parseContractJson(raw);
}

export async function readResult(client, applicationId) {
  const raw = await client.readContract({
    address: requireConfigured(),
    functionName: "get_result",
    args: [applicationId],
  });
  return parseContractJson(raw);
}

export function expectedState(state, applicationId, postconditions = {}) {
  return { applicationId, state, ...postconditions };
}

const POSITIVE_EVIDENCE_DIGEST = "3116222a82a1b97ab7f9a9d440faa50fc27de2196c0938bf760fce346a918961";

export function assessmentExpectedState(retry, applicationId, current) {
  if (retry) {
    if (current?.state !== "ASSESSED" || current?.outcome !== "UNRESOLVED") {
      throw new Error("Application is not retryable: it must be ASSESSED with UNRESOLVED outcome.");
    }
    return expectedState("ASSESSED", applicationId, {
      outcome: "UNRESOLVED",
      matchedCriteria: [],
      failedCriteria: [],
      evidenceDigest: "",
      sourceObservedAt: 0,
      requireAssessmentFields: true,
      minimumRetryCount: 1,
    });
  }
  return expectedState("ASSESSED", applicationId, {
    outcome: "ELIGIBLE",
    matchedCriteria: ["REGION", "ORG_TYPE", "DEADLINE"],
    failedCriteria: [],
    evidenceDigest: POSITIVE_EVIDENCE_DIGEST,
    sourceObservedAt: 1798761500,
    lastReason: "",
    requireAssessmentFields: true,
    retryCount: 0,
  });
}

export function assertApplicationReadback(result, expected) {
  if (!result || result.state !== expected.state) {
    throw new Error(`Readback mismatch: expected state ${expected.state}.`);
  }
  if (expected.outcome && result.outcome !== expected.outcome) {
    throw new Error(`Readback mismatch: expected outcome ${expected.outcome}.`);
  }
  if (expected.outcomes && !expected.outcomes.includes(result.outcome)) {
    throw new Error(`Readback mismatch: unexpected outcome ${result.outcome ?? "missing"}.`);
  }
  if (expected.matchedCriteria && JSON.stringify(result.matched_criteria) !== JSON.stringify(expected.matchedCriteria)) {
    throw new Error("Readback mismatch: matched criteria differ.");
  }
  if (expected.failedCriteria && JSON.stringify(result.failed_criteria) !== JSON.stringify(expected.failedCriteria)) {
    throw new Error("Readback mismatch: failed criteria differ.");
  }
  if (expected.evidenceDigest !== undefined && result.evidence_digest !== expected.evidenceDigest) {
    throw new Error("Readback mismatch: evidence digest differs.");
  }
  if (expected.requireAssessmentFields) {
    if (!Array.isArray(result.matched_criteria) || !Array.isArray(result.failed_criteria)) {
      throw new Error("Readback mismatch: assessment criteria arrays are missing.");
    }
    if (typeof result.evidence_digest !== "string" || !Number.isInteger(result.source_observed_at) || typeof result.last_reason !== "string") {
      throw new Error("Readback mismatch: assessment evidence fields are invalid.");
    }
  }
  if (expected.minimumRetryCount !== undefined && Number(result.retry_count) < expected.minimumRetryCount) {
    throw new Error(`Readback mismatch: retry count is below ${expected.minimumRetryCount}.`);
  }
  if (expected.retryCount !== undefined && Number(result.retry_count) !== expected.retryCount) {
    throw new Error(`Readback mismatch: expected retry count ${expected.retryCount}.`);
  }
  return result;
}

export function createOperationCoordinator(session, operation, expected, onProgress) {
  const client = createWriteClient(session);
  const coordinator = createWriteCoordinator({
    storageKey: "open-grant-eligibility.pending-write.v1",
    waitForFinalized: (hash) => waitForFinalized(client, hash, {
      onPoll: (state) => onProgress?.({ phase: "finalizing", hash, state }),
    }),
    readback: (pending) => readApplication(client, pending.expected.applicationId),
    assertReadback: assertApplicationReadback,
  });
  return { client, coordinator };
}

export async function getApplicationSnapshot(applicationId) {
  return readApplication(createReadClient(), applicationId);
}

export function explorerTransactionUrl(hash) {
  return `${EXPLORER_URL.replace(/\/$/, "")}/tx/${hash}`;
}
