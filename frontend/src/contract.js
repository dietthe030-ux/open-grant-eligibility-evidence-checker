import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { createWriteCoordinator, parseContractJson, waitForFinalized } from "./transaction.js";

export const CONTRACT_ADDRESS = String(import.meta.env.VITE_CONTRACT_ADDRESS ?? "").trim();
export const CHAIN = studionet;
export const CHAIN_ID = Number(studionet.id);
export const EXPLORER_URL = studionet.blockExplorers?.default?.url ?? "https://explorer-studio.genlayer.com";

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

export function expectedState(state, applicationId, outcome = undefined) {
  return { applicationId, state, ...(outcome ? { outcome } : {}) };
}

export function assertApplicationReadback(result, expected) {
  if (!result || result.state !== expected.state) {
    throw new Error(`Readback mismatch: expected state ${expected.state}.`);
  }
  if (expected.outcome && result.outcome !== expected.outcome) {
    throw new Error(`Readback mismatch: expected outcome ${expected.outcome}.`);
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
