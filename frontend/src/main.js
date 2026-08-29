import "./styles.css";
import { WalletRegistry, WalletSession } from "./wallet.js";
import {
  CHAIN,
  CHAIN_ID,
  CONTRACT_ADDRESS,
  createOperationCoordinator,
  explorerTransactionUrl,
  getApplicationSnapshot,
  isConfigured,
} from "./contract.js";

const registry = new WalletRegistry(window);
const session = new WalletSession(CHAIN_ID, renderConnection);
const elements = {
  connect: document.querySelector("#connect-button"),
  connectionDot: document.querySelector("#connection-dot"),
  connectionLabel: document.querySelector("#connection-label"),
  accountLabel: document.querySelector("#account-label"),
  networkLabel: document.querySelector("#network-label"),
  createForm: document.querySelector("#create-form"),
  freezeForm: document.querySelector("#freeze-form"),
  actionId: document.querySelector("#action-application-id"),
  assess: document.querySelector("#assess-button"),
  retry: document.querySelector("#retry-button"),
  result: document.querySelector("#result-card"),
  log: document.querySelector("#activity-log"),
  dialog: document.querySelector("#wallet-dialog"),
  closeWallet: document.querySelector("#close-wallet"),
  options: document.querySelector("#wallet-options"),
};

let providers = [];
let busy = false;

registry.subscribe((next) => {
  providers = next;
  renderWalletOptions();
});
registry.start();
renderConnection(session.snapshot());
renderConfiguration();
renderPendingNotice();

elements.connect.addEventListener("click", () => {
  renderWalletOptions();
  elements.dialog.showModal();
});
elements.closeWallet.addEventListener("click", () => elements.dialog.close());
elements.dialog.addEventListener("click", (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});
elements.createForm.addEventListener("submit", (event) => submitCreate(event));
elements.freezeForm.addEventListener("submit", (event) => submitFreeze(event));
elements.assess.addEventListener("click", () => submitAssess(false));
elements.retry.addEventListener("click", () => submitAssess(true));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.dialog.open) elements.dialog.close();
});

function renderConfiguration() {
  if (!isConfigured()) {
    appendLog("Configuration", "Contract connection is not configured yet. Signing is unavailable.", "warn");
    elements.networkLabel.textContent = "Studionet · connection pending";
  } else {
    elements.networkLabel.textContent = "Studionet · ready";
  }
}

function renderConnection(state) {
  const connected = state.connected;
  elements.connectionDot.className = `status-dot ${connected && state.correctNetwork ? "connected" : connected ? "warn" : ""}`;
  elements.connectionLabel.textContent = connected ? `Connected · ${state.detail?.info?.name ?? "wallet"}` : "Disconnected";
  elements.accountLabel.textContent = connected ? shorten(state.account) : "";
  elements.connect.textContent = connected ? "Change wallet" : "Connect wallet";
  if (connected && !state.correctNetwork) {
    elements.networkLabel.textContent = "Wrong network · switch wallet to Studionet";
  }
}

function renderWalletOptions() {
  elements.options.replaceChildren();
  if (providers.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No supported provider announced. Install MetaMask, OKX Wallet, or Rabby, then reload.";
    elements.options.append(empty);
    return;
  }
  providers.forEach((detail) => {
    const button = document.createElement("button");
    button.className = "wallet-option";
    button.type = "button";
    const image = document.createElement("img");
    image.className = "wallet-icon";
    image.src = detail.info.icon;
    image.alt = "";
    const text = document.createElement("span");
    text.textContent = detail.info.name + (detail.legacy ? " (injected)" : "");
    button.append(image, text);
    button.addEventListener("click", async () => {
      try {
        await session.connect(detail);
        elements.dialog.close();
        appendLog("Wallet", `Connected ${detail.info.name}.`, "ok");
        await offerPendingReconciliation();
      } catch (error) {
        appendLog("Wallet error", errorMessage(error), "error");
      }
    });
    elements.options.append(button);
  });
}

async function submitCreate(event) {
  event.preventDefault();
  const data = new FormData(elements.createForm);
  const applicationId = textField(data, "applicationId");
  const submittedAt = epochField(data, "submittedAt");
  if (!applicationId || !submittedAt) return;
  elements.actionId.value = applicationId;
  await runWrite("create_application", { applicationId, state: "DRAFT" }, (client) => client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "create_application",
    args: [applicationId, textField(data, "grantUrl"), textField(data, "region"), textField(data, "orgType"), submittedAt],
  }));
}

async function submitFreeze(event) {
  event.preventDefault();
  const data = new FormData(elements.freezeForm);
  const applicationId = textField(data, "applicationId");
  const before = epochField(data, "observationNotBefore");
  const after = epochField(data, "observationNotAfter");
  const deadline = utcField(data, "deadlineUtc");
  if (!applicationId || before === undefined || after === undefined || !deadline) return;
  if (before > after) return showError("Observation start must be before or equal to observation end.");
  elements.actionId.value = applicationId;
  await runWrite("freeze_application", { applicationId, state: "FROZEN" }, (client) => client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "freeze_application",
    args: [applicationId, textField(data, "regionCriterionId"), textField(data, "orgTypeCriterionId"), textField(data, "deadlineCriterionId"), deadline, before, after],
  }));
}

async function submitAssess(retry) {
  const applicationId = elements.actionId.value.trim();
  if (!applicationId) return showError("Enter an application ID first.");
  await runWrite(retry ? "retry_unresolved" : "assess_application", { applicationId, state: "ASSESSED" }, (client) => client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: retry ? "retry_unresolved" : "assess_application",
    args: [applicationId],
  }));
}

async function runWrite(operation, expected, submit) {
  if (busy) return showError("Another write is being reconciled. Wait for its hash and readback.");
  const state = session.snapshot();
  if (!state.connected) return showError("Connect a supported wallet before signing.");
  if (!state.correctNetwork) return showError("Switch the wallet to Studionet before signing.");
  if (!isConfigured()) return showError("Contract connection is not ready for signing.");
  busy = true;
  toggleActions(true);
  try {
    const { coordinator } = createOperationCoordinator(state, operation, expected, logProgress);
    const result = await coordinator.execute({
      operation,
      contract: CONTRACT_ADDRESS,
      account: state.account,
      expected,
      submit,
      progress: logProgress,
    });
    renderResult(result);
    appendLog(operation, "FINALIZED + successful execution + authoritative readback confirmed.", "ok");
  } catch (error) {
    appendLog(operation, errorMessage(error), "error");
  } finally {
    busy = false;
    toggleActions(false);
  }
}

async function offerPendingReconciliation() {
  const state = session.snapshot();
  let pending;
  try { pending = JSON.parse(localStorage.getItem("open-grant-eligibility.pending-write.v1") ?? "null"); } catch { return; }
  if (!pending?.hash || String(pending.account).toLowerCase() !== state.account) return;
  appendLog("Recovery", `Pending ${pending.operation} found for ${pending.applicationId ?? pending.expected?.applicationId ?? "application"}. Choose reconcile to continue; no resubmission will occur.`, "warn");
  const button = document.createElement("button");
  button.className = "button button-outline";
  button.type = "button";
  button.textContent = "Reconcile pending transaction";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const { coordinator } = createOperationCoordinator(state, pending.operation, pending.expected, logProgress);
      const result = await coordinator.resume(logProgress);
      renderResult(result);
      appendLog("Recovery", "Pending hash reconciled and readback verified.", "ok");
    } catch (error) {
      appendLog("Recovery", errorMessage(error), "error");
      button.disabled = false;
    }
  });
  elements.log.append(button);
}

function renderPendingNotice() {
  try {
    const pending = JSON.parse(localStorage.getItem("open-grant-eligibility.pending-write.v1") ?? "null");
    if (pending?.hash) appendLog("Recovery", `A pending hash exists: ${pending.hash}. Connect the same wallet to reconcile it; do not submit again.`, "warn");
  } catch { /* storage is unavailable; writes will fail closed */ }
}

function renderResult(result) {
  elements.result.className = "result-card";
  elements.result.replaceChildren();
  const outcome = document.createElement("div");
  const outcomeValue = result.outcome ?? "READBACK";
  outcome.className = `outcome ${String(outcomeValue).toLowerCase().replaceAll("_", "-")}`;
  outcome.textContent = outcomeValue;
  const state = document.createElement("strong");
  state.textContent = `State: ${result.state ?? "unknown"}`;
  const facts = document.createElement("p");
  facts.className = "muted";
  facts.textContent = `Matched: ${result.matched_criteria ?? "—"} · Failed: ${result.failed_criteria ?? "—"}`;
  const reason = document.createElement("p");
  reason.className = "muted";
  reason.textContent = result.last_reason ?? result.reason ?? "Authoritative contract readback.";
  elements.result.append(outcome, state, facts, reason);
}

function logProgress(event) {
  if (event.phase === "submitted") {
    appendLog("Submitted", event.persistenceDegraded ? "Hash retained; keep this page open until confirmation." : "Hash retained while confirmation is checked.", "warn", event.hash);
  } else if (event.phase === "finalizing") {
    const status = event.state?.status ? `: ${event.state.status.toLowerCase()}` : "";
    appendLog("Finality", `Awaiting network confirmation${status}.`, "info", event.hash);
  } else if (event.phase === "readback") {
    appendLog("Readback", "Fetching the application state after finality.", "info", event.hash);
  }
}

function appendLog(title, message, tone = "info", hash = undefined) {
  const entry = document.createElement("div");
  entry.className = `log-entry ${tone}`;
  const strong = document.createElement("strong");
  strong.textContent = title;
  const text = document.createElement("span");
  text.textContent = message;
  entry.append(strong, text);
  if (hash) {
    const link = document.createElement("a");
    link.href = explorerTransactionUrl(hash);
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = hash;
    entry.append(link);
  }
  elements.log.prepend(entry);
}

function toggleActions(disabled) {
  [elements.createForm, elements.freezeForm, elements.assess, elements.retry].forEach((element) => {
    element.querySelectorAll?.("button").forEach((button) => { button.disabled = disabled; });
    if (element instanceof HTMLButtonElement) element.disabled = disabled;
  });
}

function textField(data, name) {
  const value = String(data.get(name) ?? "").trim();
  if (!value) showError(`${name} is required.`);
  return value;
}

function epochField(data, name) {
  const value = String(data.get(name) ?? "");
  const date = value ? new Date(`${value}:00Z`) : new Date("invalid");
  if (!Number.isFinite(date.getTime())) { showError(`${name} must be a valid UTC date.`); return undefined; }
  return Math.floor(date.getTime() / 1000);
}

function utcField(data, name) {
  const epoch = epochField(data, name);
  return epoch === undefined ? "" : new Date(epoch * 1000).toISOString().replace(".000Z", "Z");
}

function showError(message) { appendLog("Validation", message, "error"); }
function errorMessage(error) { return error instanceof Error ? error.message : String(error); }
function shorten(value) { const text = String(value ?? ""); return text.length > 12 ? `${text.slice(0, 6)}…${text.slice(-4)}` : text; }
