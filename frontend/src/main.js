import "./styles.css";
import { WalletRegistry, WalletSession, formatProviderError } from "./wallet.js";
import {
  CHAIN,
  CHAIN_ID,
  CONTRACT_ADDRESS,
  createOperationCoordinator,
  explorerTransactionUrl,
  getApplicationSnapshot,
  isConfigured,
  expectedState,
  assessmentExpectedState,
  LEGACY_PENDING_STORAGE_KEY,
  PENDING_STORAGE_PREFIX,
} from "./contract.js";
import { parseUtcEpoch } from "./time.js";

const registry = new WalletRegistry(window);
const session = new WalletSession(CHAIN_ID, renderConnection, CHAIN);

const elements = {
  connect: document.querySelector("#connect-button"),
  walletMenu: document.querySelector("#wallet-menu"),
  changeWallet: document.querySelector("#change-wallet"),
  disconnectWallet: document.querySelector("#disconnect-wallet"),
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
  cancelWallet: document.querySelector("#cancel-wallet"),
  options: document.querySelector("#wallet-options"),
};

let providers = [];
let busy = false;
let actionStateTimer;

// -------------------------------------------------------------
// Initialization & Registry Subscription
// -------------------------------------------------------------
registry.subscribe((next) => {
  providers = next;
  renderWalletOptions();
});
registry.start();
renderConnection(session.snapshot());
renderConfiguration();
renderPendingNotice();

// -------------------------------------------------------------
// Wallet Control & Popover Interactions
// -------------------------------------------------------------
elements.connect?.addEventListener("click", (event) => {
  event.stopPropagation();
  const state = session.snapshot();
  if (state.connected) {
    const isHidden = elements.walletMenu.hidden;
    if (isHidden) {
      openWalletMenu();
    } else {
      closeWalletMenu();
    }
    return;
  }
  openWalletChooser();
});

elements.changeWallet?.addEventListener("click", (event) => {
  event.stopPropagation();
  closeWalletMenu();
  openWalletChooser();
});

elements.disconnectWallet?.addEventListener("click", (event) => {
  event.stopPropagation();
  closeWalletMenu();
  session.clear("Wallet disconnected.");
  appendLog("Wallet", "Wallet session closed by user.", "info");
});

elements.closeWallet?.addEventListener("click", () => elements.dialog.close());
elements.cancelWallet?.addEventListener("click", () => elements.dialog.close());

elements.dialog?.addEventListener("click", (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});

// Menu Keyboard Navigation
elements.walletMenu?.addEventListener("keydown", (event) => {
  const items = Array.from(elements.walletMenu.querySelectorAll('[role="menuitem"]'));
  const activeIndex = items.indexOf(document.activeElement);

  if (event.key === "ArrowDown") {
    event.preventDefault();
    const nextIndex = (activeIndex + 1) % items.length;
    items[nextIndex]?.focus();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    const prevIndex = (activeIndex - 1 + items.length) % items.length;
    items[prevIndex]?.focus();
  } else if (event.key === "Tab") {
    closeWalletMenu();
  }
});

// Global Keyboard & Click Dismissal
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (elements.walletMenu && !elements.walletMenu.hidden) {
    closeWalletMenu();
    elements.connect?.focus();
  }
  if (elements.dialog?.open) {
    elements.dialog.close();
  }
});

document.addEventListener("click", (event) => {
  if (elements.walletMenu && !elements.walletMenu.hidden && !event.target.closest(".wallet-control")) {
    closeWalletMenu();
  }
});

function openWalletMenu() {
  elements.walletMenu.hidden = false;
  elements.connect.setAttribute("aria-expanded", "true");
  const firstItem = elements.walletMenu.querySelector('[role="menuitem"]');
  firstItem?.focus();
}

function closeWalletMenu() {
  if (elements.walletMenu) {
    elements.walletMenu.hidden = true;
  }
  if (elements.connect) {
    elements.connect.setAttribute("aria-expanded", "false");
  }
}

function openWalletChooser() {
  renderWalletOptions();
  elements.dialog.showModal();
}

// -------------------------------------------------------------
// Form Submissions
// -------------------------------------------------------------
elements.createForm?.addEventListener("submit", (event) => submitCreate(event));
elements.freezeForm?.addEventListener("submit", (event) => submitFreeze(event));
elements.assess?.addEventListener("click", () => submitAssess(false));
elements.retry?.addEventListener("click", () => submitAssess(true));

// -------------------------------------------------------------
// State Rendering Functions
// -------------------------------------------------------------
function renderConfiguration() {
  if (!isConfigured()) {
    appendLog("Configuration", "Contract address is not configured in environment. Write actions are disabled.", "warn");
    elements.networkLabel.textContent = "Studionet · pending address";
  } else {
    elements.networkLabel.textContent = "Studionet · ready";
  }
}

function renderConnection(state) {
  const connected = state.connected;
  elements.connectionDot.className = `status-dot ${connected && state.correctNetwork ? "connected" : connected ? "warn" : ""}`;
  elements.connectionLabel.textContent = connected ? "Connected" : "Disconnected";

  if (connected) {
    elements.accountLabel.textContent = shorten(state.account);
    elements.accountLabel.style.display = "inline-block";
  } else {
    elements.accountLabel.textContent = "";
    elements.accountLabel.style.display = "none";
  }

  if (connected) {
    elements.connect.className = "button button-header wallet-connected";
    elements.connect.innerHTML = `
      <span class="wallet-status-dot" aria-hidden="true"></span>
      <span class="wallet-status-label">Wallet connected</span>
      <span class="wallet-address-pill">${shorten(state.account)}</span>
      <span class="wallet-chevron-icon" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </span>
    `;
    elements.connect.setAttribute("aria-label", `Connected wallet ${state.account}. Click to open menu.`);
  } else {
    elements.connect.className = "button button-header";
    elements.connect.innerHTML = `
      <span class="button-icon" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      </span>
      <span>Connect wallet</span>
    `;
    elements.connect.setAttribute("aria-label", "Connect browser wallet");
    closeWalletMenu();
  }

  if (connected && !state.correctNetwork) {
    elements.networkLabel.textContent = "Wrong network · switch to Studionet";
  }
}

function renderWalletOptions() {
  elements.options.replaceChildren();
  if (providers.length === 0) {
    const empty = document.createElement("div");
    empty.className = "wallet-empty-state";
    const title = document.createElement("p");
    title.className = "muted";
    title.textContent = "No compatible wallet detected.";
    const detail = document.createElement("p");
    detail.className = "dialog-subtext";
    detail.textContent = "Install a supported browser wallet (MetaMask, OKX, or Rabby), then reload the page.";
    empty.append(title, detail);
    elements.options.append(empty);
    return;
  }

  providers.forEach((detail) => {
    const button = document.createElement("button");
    button.className = "wallet-option";
    button.type = "button";

    const iconWrapper = document.createElement("div");
    iconWrapper.className = "wallet-option-icon-wrap";
    const image = document.createElement("img");
    image.className = "wallet-icon";
    image.src = detail.info.icon;
    image.alt = "";
    iconWrapper.append(image);

    const textWrap = document.createElement("div");
    textWrap.className = "wallet-option-text";
    const name = document.createElement("span");
    name.className = "wallet-option-name";
    name.textContent = detail.info.name;
    const desc = document.createElement("span");
    desc.className = "wallet-option-desc";
    desc.textContent = "Supported browser wallet";
    textWrap.append(name, desc);

    const arrow = document.createElement("span");
    arrow.className = "wallet-option-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

    button.append(iconWrapper, textWrap, arrow);
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

// -------------------------------------------------------------
// Transaction Handlers
// -------------------------------------------------------------
async function submitCreate(event) {
  event.preventDefault();
  const data = new FormData(elements.createForm);
  const applicationId = textField(data, "applicationId");
  const submittedAt = epochField(data, "submittedAt");
  if (!applicationId || !submittedAt) return;
  elements.actionId.value = applicationId;
  await runWrite(
    "create_application",
    expectedState("DRAFT", applicationId, {
      outcome: "UNRESOLVED",
      matchedCriteria: [],
      failedCriteria: [],
      evidenceDigest: "",
      sourceObservedAt: 0,
      lastReason: "",
      retryCount: 0,
    }),
    (client) =>
      client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "create_application",
        args: [
          applicationId,
          textField(data, "grantUrl"),
          textField(data, "region"),
          textField(data, "orgType"),
          submittedAt,
        ],
      })
  );
}

async function submitFreeze(event) {
  event.preventDefault();
  const data = new FormData(elements.freezeForm);
  const applicationId = textField(data, "applicationId");
  const before = epochField(data, "observationNotBefore");
  const after = epochField(data, "observationNotAfter");
  const deadline = utcField(data, "deadlineUtc");
  if (!applicationId || before === undefined || after === undefined || !deadline) return;
  if (before > after) {
    return showError("Observation start timestamp must be before or equal to observation end timestamp.");
  }
  elements.actionId.value = applicationId;
  await runWrite(
    "freeze_application",
    expectedState("FROZEN", applicationId, {
      outcome: "UNRESOLVED",
      matchedCriteria: [],
      failedCriteria: [],
      evidenceDigest: "",
      sourceObservedAt: 0,
      lastReason: "",
      retryCount: 0,
    }),
    (client) =>
      client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "freeze_application",
        args: [
          applicationId,
          textField(data, "regionCriterionId"),
          textField(data, "orgTypeCriterionId"),
          textField(data, "deadlineCriterionId"),
          deadline,
          before,
          after,
        ],
      })
  );
}

async function submitAssess(retry) {
  const applicationId = elements.actionId.value.trim();
  if (!applicationId) return showError("Enter an application ID first.");
  let expected;
  try {
    expected = assessmentExpectedState(retry, applicationId, await getApplicationSnapshot(applicationId));
  } catch (error) {
    return showError(errorMessage(error));
  }
  await runWrite(
    retry ? "retry_unresolved" : "assess_application",
    expected,
    (client) =>
      client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: retry ? "retry_unresolved" : "assess_application",
        args: [applicationId],
      })
  );
}

async function runWrite(operation, expected, submit) {
  if (busy) {
    return showError("Another write transaction is in progress. Please wait for finality and readback.");
  }
  const state = session.snapshot();
  if (!state.connected) return showError("Connect a supported wallet before signing transactions.");
  if (!state.correctNetwork) return showError("Switch wallet to Studionet before signing.");
  if (!state.sufficientBalance) return showError("Wallet balance is insufficient to cover transaction gas fees.");
  if (!isConfigured()) return showError("Contract address is not configured. Transactions cannot be submitted.");

  busy = true;
  toggleActions(true);
  setActionState(operation, "loading");
  try {
    const { client, coordinator } = createOperationCoordinator(state, operation, expected, logProgress);
    const result = await coordinator.execute({
      operation,
      contract: CONTRACT_ADDRESS,
      account: state.account,
      expected,
      submit: () => submit(client),
      progress: logProgress,
    });
    renderResult(result);
    setActionState(operation, "success");
    appendLog(operation, "FINALIZED + Consensus confirmed + Authoritative readback verified.", "ok");
  } catch (error) {
    setActionState(operation, "error");
    appendLog(operation, errorMessage(error), "error");
  } finally {
    busy = false;
    toggleActions(false);
  }
}

// -------------------------------------------------------------
// Recovery & Storage Reconciliations
// -------------------------------------------------------------
function pendingRecords() {
  const records = [];
  try {
    const keys = [LEGACY_PENDING_STORAGE_KEY];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(PENDING_STORAGE_PREFIX)) keys.push(key);
    }
    for (const storageKey of new Set(keys)) {
      const pending = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (pending?.hash) records.push({ pending, storageKey });
    }
  } catch {
    return [];
  }
  return records;
}

async function offerPendingReconciliation() {
  const state = session.snapshot();
  const records = pendingRecords().filter(({ pending }) =>
    String(pending.account).toLowerCase() === state.account,
  );
  records.forEach(({ pending }) => {
    appendLog(
      "Recovery",
      `Pending transaction detected for ${pending.applicationId ?? pending.expected?.applicationId ?? "application"}. Click Reconcile to verify on-chain state without re-signing.`,
      "warn"
    );
    const button = document.createElement("button");
    button.className = "button button-outline button-sm";
    button.type = "button";
    button.textContent = `Reconcile ${pending.applicationId ?? pending.expected?.applicationId ?? "pending transaction"}`;
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const { coordinator } = createOperationCoordinator(state, pending.operation, pending.expected, logProgress);
        const result = await coordinator.resume(logProgress);
        renderResult(result);
        appendLog("Recovery", "Pending transaction reconciled and readback verified.", "ok");
      } catch (error) {
        appendLog("Recovery", errorMessage(error), "error");
        button.disabled = false;
      }
    });
    elements.log.prepend(button);
  });
}

function renderPendingNotice() {
  for (const { pending } of pendingRecords()) {
    appendLog(
      "Recovery",
      `A pending transaction hash exists (${shorten(pending.hash)}). Connect the same wallet to reconcile it.`,
      "warn"
    );
  }
}

// -------------------------------------------------------------
// Readback Result Rendering (Authoritative Dossier)
// -------------------------------------------------------------
function renderResult(result) {
  elements.result.className = "result-card active";
  elements.result.replaceChildren();

  // Header Bar
  const header = document.createElement("div");
  header.className = "result-header";

  const outcomeVal = String(result.outcome ?? "READBACK").toUpperCase();
  const outcomeBadge = document.createElement("div");
  outcomeBadge.className = `result-outcome-badge ${outcomeVal.toLowerCase().replaceAll("_", "-")}`;

  let outcomeIcon = "";
  if (outcomeVal === "ELIGIBLE") {
    outcomeIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  } else if (outcomeVal === "NOT-ELIGIBLE" || outcomeVal === "NOT_ELIGIBLE") {
    outcomeIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
  } else {
    outcomeIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  }

  outcomeBadge.innerHTML = `${outcomeIcon}<span>${escapeHtml(outcomeVal)}</span>`;

  const metaGroup = document.createElement("div");
  metaGroup.className = "result-meta-group";

  const statePill = document.createElement("span");
  statePill.className = "result-state-pill";
  statePill.textContent = `Status: ${result.state ?? "UNKNOWN"}`;

  metaGroup.append(statePill);
  header.append(outcomeBadge, metaGroup);

  // Criteria Grid
  const criteriaGrid = document.createElement("div");
  criteriaGrid.className = "result-criteria-grid";

  const matchedList = Array.isArray(result.matched_criteria)
    ? result.matched_criteria
    : typeof result.matched_criteria === "string" && result.matched_criteria
    ? [result.matched_criteria]
    : [];

  const failedList = Array.isArray(result.failed_criteria)
    ? result.failed_criteria
    : typeof result.failed_criteria === "string" && result.failed_criteria
    ? [result.failed_criteria]
    : [];

  const matchedCard = document.createElement("div");
  matchedCard.className = `criterion-card ${matchedList.length > 0 ? "matched" : ""}`;
  const matchedLabel = document.createElement("span");
  matchedLabel.className = "criterion-label";
  matchedLabel.textContent = `Matched Criteria (${matchedList.length})`;
  const matchedTags = document.createElement("div");
  matchedTags.className = "criterion-tags";
  if (matchedList.length > 0) {
    matchedList.forEach((crit) => {
      const tag = document.createElement("span");
      tag.className = "criterion-tag ok";
      tag.textContent = crit;
      matchedTags.append(tag);
    });
  } else {
    const emptyTag = document.createElement("span");
    emptyTag.className = "criterion-tag empty";
    emptyTag.textContent = "None";
    matchedTags.append(emptyTag);
  }
  matchedCard.append(matchedLabel, matchedTags);

  const failedCard = document.createElement("div");
  failedCard.className = `criterion-card ${failedList.length > 0 ? "failed" : ""}`;
  const failedLabel = document.createElement("span");
  failedLabel.className = "criterion-label";
  failedLabel.textContent = `Failed Criteria (${failedList.length})`;
  const failedTags = document.createElement("div");
  failedTags.className = "criterion-tags";
  if (failedList.length > 0) {
    failedList.forEach((crit) => {
      const tag = document.createElement("span");
      tag.className = "criterion-tag fail";
      tag.textContent = crit;
      failedTags.append(tag);
    });
  } else {
    const emptyTag = document.createElement("span");
    emptyTag.className = "criterion-tag empty";
    emptyTag.textContent = "None";
    failedTags.append(emptyTag);
  }
  failedCard.append(failedLabel, failedTags);

  criteriaGrid.append(matchedCard, failedCard);

  // Detail Items Grid
  const detailsBox = document.createElement("div");
  detailsBox.className = "result-details-box";

  if (result.evidence_digest) {
    const digestItem = document.createElement("div");
    digestItem.className = "result-detail-item";
    digestItem.innerHTML = `<span class="result-detail-label">Evidence Digest</span><span class="result-detail-value">${shortenDigest(result.evidence_digest)}</span>`;
    detailsBox.append(digestItem);
  }

  if (result.source_observed_at !== undefined && result.source_observed_at !== 0) {
    const observedItem = document.createElement("div");
    observedItem.className = "result-detail-item";
    const dateStr = new Date(Number(result.source_observed_at) * 1000).toUTCString();
    observedItem.innerHTML = `<span class="result-detail-label">Observation Timestamp</span><span class="result-detail-value">${escapeHtml(dateStr)}</span>`;
    detailsBox.append(observedItem);
  }

  if (result.retry_count !== undefined) {
    const retryItem = document.createElement("div");
    retryItem.className = "result-detail-item";
    retryItem.innerHTML = `<span class="result-detail-label">Retry Count</span><span class="result-detail-value">${result.retry_count}</span>`;
    detailsBox.append(retryItem);
  }

  // Verdict Narrative / Last Reason
  const reasonBox = document.createElement("div");
  reasonBox.className = "result-reason-box";
  const reasonLabel = document.createElement("span");
  reasonLabel.className = "result-reason-label";
  reasonLabel.textContent = "Assessment Verdict Narrative";
  const reasonText = document.createElement("p");
  reasonText.className = "result-reason-text";
  reasonText.textContent = result.last_reason || result.reason || "Authoritative contract state readback verified without errors.";
  reasonBox.append(reasonLabel, reasonText);

  elements.result.append(header, criteriaGrid);
  if (detailsBox.children.length > 0) {
    elements.result.append(detailsBox);
  }
  elements.result.append(reasonBox);
}

function logProgress(event) {
  if (event.phase === "submitted") {
    appendLog(
      "Submitted",
      event.persistenceDegraded
        ? "Hash saved for this session only; keep this tab open until finality is reached."
        : "Transaction submitted to network. Awaiting leader consensus.",
      "warn",
      event.hash
    );
  } else if (event.phase === "finalizing") {
    const status = event.state?.status ? `: ${String(event.state.status).toLowerCase()}` : "";
    appendLog("Finality", `Awaiting GenLayer finality confirmation${status}.`, "info", event.hash);
  } else if (event.phase === "readback") {
    appendLog("Readback", "Fetching authoritative on-chain state to verify postconditions.", "info", event.hash);
  }
}

function appendLog(title, message, tone = "info", hash = undefined) {
  const entry = document.createElement("div");
  entry.className = `log-entry ${tone}`;

  const header = document.createElement("div");
  header.className = "log-entry-header";

  const tag = document.createElement("span");
  tag.className = `log-tag ${tone}`;
  tag.textContent = title;

  const text = document.createElement("span");
  text.className = "log-text";
  text.textContent = message;

  header.append(tag, text);
  entry.append(header);

  if (hash) {
    const linkWrap = document.createElement("div");
    linkWrap.className = "log-hash-wrap";
    const link = document.createElement("a");
    link.href = explorerTransactionUrl(hash);
    link.target = "_blank";
    link.rel = "noreferrer";
    link.className = "log-hash-link";
    link.innerHTML = `<span aria-hidden="true">↗</span><span>${shorten(hash)}</span>`;

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "button button-outline button-sm";
    copy.textContent = "Copy hash";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(hash);
        copy.textContent = "Copied";
        setTimeout(() => { copy.textContent = "Copy hash"; }, 2000);
      } catch {
        copy.textContent = "Copy unavailable";
      }
    });
    linkWrap.append(link, copy);
    entry.append(linkWrap);
  }
  elements.log.prepend(entry);
}

function toggleActions(disabled) {
  [elements.createForm, elements.freezeForm, elements.assess, elements.retry].forEach((element) => {
    if (!element) return;
    element.querySelectorAll?.("button").forEach((button) => {
      button.disabled = disabled;
    });
    if (element instanceof HTMLButtonElement) element.disabled = disabled;
  });
}

function setActionState(operation, state) {
  const button = {
    create_application: elements.createForm?.querySelector('button[type="submit"]'),
    freeze_application: elements.freezeForm?.querySelector('button[type="submit"]'),
    assess_application: elements.assess,
    retry_unresolved: elements.retry,
  }[operation];
  if (!button) return;
  clearTimeout(actionStateTimer);
  if (state === "idle") {
    button.removeAttribute("data-state");
    button.removeAttribute("aria-busy");
    return;
  }
  button.dataset.state = state;
  if (state === "loading") button.setAttribute("aria-busy", "true");
  else button.removeAttribute("aria-busy");
  if (state !== "loading") {
    actionStateTimer = setTimeout(() => setActionState(operation, "idle"), 1800);
  }
}

function textField(data, name) {
  const value = String(data.get(name) ?? "").trim();
  if (!value) showError(`${name} is required.`);
  return value;
}

function epochField(data, name) {
  const value = String(data.get(name) ?? "");
  const epoch = parseUtcEpoch(value);
  if (epoch === undefined) {
    showError(`${name} must be a valid UTC date.`);
    return undefined;
  }
  return epoch;
}

function utcField(data, name) {
  const epoch = epochField(data, name);
  return epoch === undefined ? "" : new Date(epoch * 1000).toISOString().replace(".000Z", "Z");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showError(message) {
  appendLog("Validation", message, "error");
}

function errorMessage(error) {
  return formatProviderError(error);
}

function shorten(value) {
  const text = String(value ?? "");
  return text.length > 13 ? `${text.slice(0, 6)}…${text.slice(-4)}` : text;
}

function shortenDigest(digest) {
  const text = String(digest ?? "");
  return text.length > 20 ? `${text.slice(0, 10)}…${text.slice(-8)}` : text;
}
