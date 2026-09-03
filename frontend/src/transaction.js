export const FINALIZED = "FINALIZED";
export const FINISHED_WITH_RETURN = "FINISHED_WITH_RETURN";
const CONSENSUS_BY_CODE = Object.freeze({ 0: "IDLE", 1: "AGREE", 2: "DISAGREE", 3: "TIMEOUT", 4: "DETERMINISTIC_VIOLATION", 5: "NO_MAJORITY", 6: "MAJORITY_AGREE", 7: "MAJORITY_DISAGREE" });

function consensusName(transaction) {
  const value = transaction.resultName ?? transaction.result_name ?? transaction.result;
  return String(CONSENSUS_BY_CODE[String(value)] ?? value ?? "").toUpperCase();
}

export class TerminalTransactionError extends Error {
  constructor(message) {
    super(message);
    this.name = "TerminalTransactionError";
  }
}

export class TransientTransportError extends Error {
  constructor(message, { status, retryAfterMs } = {}) {
    super(message);
    this.name = "TransientTransportError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export function isTransientTransportError(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.cause?.status);
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  if (error?.name === "TransientTransportError") return true;
  return /fetch|network|timeout|timed out|rate limit|server busy|temporar|HTTP (?:408|425|429|500|502|503|504)/i
    .test(String(error?.message ?? error ?? ""));
}

function abortableSleep(ms, signal) {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms));
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function classifyTransaction(transaction) {
  const value = transaction && typeof transaction === "object" ? transaction : {};
  const status = String(value.statusName ?? value.status ?? "").toUpperCase();
  const consensus = consensusName(value);
  const leader = Array.isArray(value.consensus_data?.leader_receipt)
    ? value.consensus_data.leader_receipt.find((receipt) => receipt?.mode === "leader")
    : undefined;
  const execution = String(
    value.txExecutionResultName ??
      (leader?.execution_result === "SUCCESS" && leader?.result?.status === "return"
        ? FINISHED_WITH_RETURN
        : ""),
  ).toUpperCase();
  return Object.freeze({
    status,
    consensus,
    execution,
    finalized: status === FINALIZED,
    consensusAgreed: consensus === "MAJORITY_AGREE",
    executionSucceeded: execution === FINISHED_WITH_RETURN,
    successful: status === FINALIZED &&
      consensus === "MAJORITY_AGREE" &&
      execution === FINISHED_WITH_RETURN,
  });
}

export function assertSuccessfulTransaction(transaction) {
  const result = classifyTransaction(transaction);
  if (!result.finalized) throw new Error("The transaction did not reach FINALIZED.");
  if (!result.consensusAgreed) {
    throw new Error(`Consensus failed: ${result.consensus || "unknown"}.`);
  }
  if (!result.executionSucceeded) {
    throw new Error(`Contract execution failed: ${result.execution || "unknown"}.`);
  }
  return result;
}

export function parseContractJson(value) {
  if (typeof value === "string") return JSON.parse(value);
  if (value && typeof value === "object") return value;
  throw new Error("The contract returned an invalid JSON value.");
}

export function isHexHash(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(String(value ?? ""));
}

export function createWriteCoordinator({
  storage = globalThis.localStorage,
  storageKey,
  legacyStorageKey,
  waitForFinalized,
  assertSuccessful = assertSuccessfulTransaction,
  readback,
  assertReadback,
}) {
  let inFlight = false;
  let volatilePending;
  const probeKey = `${storageKey}.probe`;

  function read(key) {
    try {
      const value = JSON.parse(storage?.getItem(key) ?? "null");
      return isPending(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }

  function isPending(value) {
    return Boolean(value && typeof value === "object" && value.version === 1 &&
      typeof value.operation === "string" && isHexHash(value.hash) &&
      typeof value.contract === "string" && typeof value.account === "string" &&
      value.expected !== undefined);
  }

  function load() {
    if (volatilePending) return volatilePending;
    return read(storageKey);
  }

  function loadForResume() {
    const scoped = load();
    if (scoped || !legacyStorageKey || legacyStorageKey === storageKey) return scoped;
    const legacy = read(legacyStorageKey);
    if (!legacy) return undefined;
    volatilePending = legacy;
    try {
      storage.setItem(storageKey, JSON.stringify(legacy));
      volatilePending = undefined;
    } catch {
      // The legacy record remains the authoritative fallback for this resume.
    }
    return legacy;
  }

  function legacyBlocks(expected) {
    const legacy = legacyStorageKey && legacyStorageKey !== storageKey ? read(legacyStorageKey) : undefined;
    const applicationId = expected?.applicationId;
    return Boolean(legacy && applicationId &&
      (legacy.expected?.applicationId ?? legacy.applicationId) === applicationId);
  }

  function requireStorage() {
    try {
      storage.setItem(probeKey, "1");
      if (storage.getItem(probeKey) !== "1") throw new Error("storage mismatch");
      storage.removeItem(probeKey);
    } catch {
      throw new Error("Transaction recovery storage is unavailable. No write was submitted.");
    }
  }

  function save(pending) {
    volatilePending = pending;
    try {
      storage.setItem(storageKey, JSON.stringify(pending));
      return true;
    } catch {
      return false;
    }
  }

  function clearOrRemainLocked(pending) {
    try {
      storage.removeItem(storageKey);
      if (legacyStorageKey && read(legacyStorageKey)?.hash === pending.hash) storage.removeItem(legacyStorageKey);
      volatilePending = undefined;
    } catch {
      volatilePending = pending;
      throw new Error("Terminal transaction reached, but recovery cleanup failed. Restore storage before retrying.");
    }
  }

  async function reconcile(pending, progress = () => {}) {
    try {
      progress({ phase: "finalizing", hash: pending.hash });
      const transaction = await waitForFinalized(pending.hash);
      try {
        assertSuccessful(transaction);
      } catch (error) {
        throw new TerminalTransactionError(error instanceof Error ? error.message : "Finalized transaction failed.");
      }
      progress({ phase: "readback", hash: pending.hash });
      const result = await readback(pending);
      assertReadback(result, pending.expected);
      clearOrRemainLocked(pending);
      return result;
    } catch (error) {
      if (error?.name === "TerminalTransactionError") clearOrRemainLocked(pending);
      throw error;
    }
  }

  async function execute({ operation, contract, account, expected, submit, progress = () => {} }) {
    if (inFlight || load() || legacyBlocks(expected)) throw new Error("A write is still pending reconciliation.");
    requireStorage();
    inFlight = true;
    try {
      const hash = await submit();
      if (!isHexHash(hash)) throw new Error("The wallet returned an invalid transaction hash.");
      const pending = { version: 1, operation, hash, contract, account, expected };
      const persisted = save(pending);
      progress({ phase: "submitted", hash, persistenceDegraded: !persisted });
      return await reconcile(pending, progress);
    } finally {
      inFlight = false;
    }
  }

  async function resume(progress = () => {}) {
    const pending = loadForResume();
    if (!pending) throw new Error("No transaction is waiting for reconciliation.");
    if (inFlight) throw new Error("Transaction reconciliation is already running.");
    inFlight = true;
    try {
      return await reconcile(pending, progress);
    } finally {
      inFlight = false;
    }
  }

  return Object.freeze({ execute, resume, load });
}

export async function waitForFinalized(client, hash, {
  maxPolls = 60,
  intervalMs = 2500,
  maxTransportRetries = 2,
  transportRetryBaseMs = 500,
  transportRetryMaxMs = 5000,
  random = Math.random,
  sleep = abortableSleep,
  signal,
  onPoll = () => {},
  onTransportError = () => {},
} = {}) {
  let last;
  let poll = 0;
  let transportRetries = 0;
  while (poll < maxPolls) {
    signal?.throwIfAborted();
    try {
      last = await client.getTransaction({ hash });
    } catch (error) {
      if (!isTransientTransportError(error) || transportRetries >= maxTransportRetries) throw error;
      transportRetries += 1;
      const backoff = transportRetryBaseMs * (2 ** (transportRetries - 1));
      const jitter = Math.floor(backoff * 0.25 * random());
      const requestedDelay = Number.isFinite(error?.retryAfterMs) ? error.retryAfterMs : backoff + jitter;
      const delayMs = Math.max(0, Math.min(requestedDelay, transportRetryMaxMs));
      onTransportError({ attempt: transportRetries, maxRetries: maxTransportRetries, delayMs, error });
      await sleep(delayMs, signal);
      continue;
    }
    poll += 1;
    const state = classifyTransaction(last);
    onPoll(state, last);
    if (state.finalized) return last;
    if (["CANCELED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"].includes(state.status)) return last;
    if (poll < maxPolls) await sleep(intervalMs, signal);
  }
  throw new Error(`Timed out waiting for FINALIZED. Last status: ${classifyTransaction(last).status || "unknown"}.`);
}
