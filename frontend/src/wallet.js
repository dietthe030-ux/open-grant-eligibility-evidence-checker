const LEGACY_UUID = "legacy-window-ethereum";
const EMPTY = Object.freeze([]);

export const SUPPORTED_WALLETS = Object.freeze([
  { key: "metamask", label: "MetaMask", rdns: ["io.metamask"] },
  { key: "okx", label: "OKX Wallet", rdns: ["com.okex.wallet", "com.okx.wallet"] },
  { key: "rabby", label: "Rabby", rdns: ["io.rabby"] },
]);

function isProvider(value) {
  return Boolean(value && typeof value === "object" && typeof value.request === "function");
}

function isAnnouncement(value) {
  if (!value || typeof value !== "object") return false;
  const info = value.info;
  return Boolean(
    info && typeof info.uuid === "string" && info.uuid.length > 0 &&
    typeof info.name === "string" && info.name.length > 0 &&
    typeof info.rdns === "string" && typeof info.icon === "string" &&
    info.icon.startsWith("data:") && isProvider(value.provider),
  );
}

export function supportedWallet(info) {
  const rdns = String(info?.rdns ?? "").toLowerCase();
  const name = String(info?.name ?? "").toLowerCase();
  return SUPPORTED_WALLETS.find((wallet) =>
    wallet.rdns.includes(rdns) ||
    (wallet.key === "metamask" && name.includes("metamask")) ||
    (wallet.key === "okx" && name.includes("okx")) ||
    (wallet.key === "rabby" && name.includes("rabby")),
  );
}

export class WalletRegistry {
  constructor(target = globalThis.window) {
    this.target = target;
    this.byUuid = new Map();
    this.uuidByProvider = new WeakMap();
    this.subscribers = new Set();
    this.started = false;
    this.onAnnouncement = (event) => this.accept(event?.detail);
  }

  start() {
    if (this.started || !this.target?.addEventListener) return;
    this.started = true;
    this.target.addEventListener("eip6963:announceProvider", this.onAnnouncement);
    this.target.dispatchEvent(new Event("eip6963:requestProvider"));
    queueMicrotask(() => {
      if (this.byUuid.size === 0 && isProvider(this.target.ethereum)) {
        this.byUuid.set(LEGACY_UUID, {
          legacy: true,
          info: {
            uuid: LEGACY_UUID,
            name: "Injected wallet",
            icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
            rdns: "legacy.window.ethereum",
          },
          provider: this.target.ethereum,
        });
        this.publish();
      }
    });
  }

  accept(detail) {
    if (!isAnnouncement(detail) || !supportedWallet(detail.info)) return false;
    const providerObject = detail.provider;
    const priorUuid = this.uuidByProvider.get(providerObject);
    const priorDetail = this.byUuid.get(detail.info.uuid);
    if (priorUuid && priorUuid !== detail.info.uuid) return false;
    if (priorDetail && priorDetail.provider !== providerObject) return false;
    this.byUuid.delete(LEGACY_UUID);
    this.uuidByProvider.set(providerObject, detail.info.uuid);
    this.byUuid.set(detail.info.uuid, { legacy: false, ...detail });
    this.publish();
    return true;
  }

  publish() {
    this.subscribers.forEach((notify) => notify(this.providers()));
  }

  providers() {
    return Object.freeze([...this.byUuid.values()].sort((a, b) =>
      a.info.name.localeCompare(b.info.name),
    ));
  }

  subscribe(notify) {
    this.subscribers.add(notify);
    return () => this.subscribers.delete(notify);
  }
}

export class WalletSession {
  constructor(expectedChainId, onChange = () => {}) {
    this.expectedChainId = Number(expectedChainId);
    this.onChange = onChange;
    this.provider = undefined;
    this.account = undefined;
    this.chainId = undefined;
    this.detail = undefined;
    this.handleAccounts = (accounts) => {
      const next = Array.isArray(accounts) ? accounts[0] : undefined;
      if (!next) this.clear("Wallet disconnected.");
      else {
        this.account = String(next).toLowerCase();
        this.onChange(this.snapshot());
      }
    };
    this.handleChain = (chainId) => {
      this.chainId = normalizeChainId(chainId);
      this.onChange(this.snapshot());
    };
  }

  async connect(detail) {
    if (!detail?.provider || !supportedWallet(detail.info)) {
      throw new Error("Select a supported wallet provider first.");
    }
    const accounts = await detail.provider.request({ method: "eth_requestAccounts" });
    const account = Array.isArray(accounts) ? accounts[0] : undefined;
    if (!isAddress(account)) throw new Error("The selected wallet returned no usable account.");
    const chainId = normalizeChainId(await detail.provider.request({ method: "eth_chainId" }));
    this.clearListeners();
    this.provider = detail.provider;
    this.detail = detail;
    this.account = account.toLowerCase();
    this.chainId = chainId;
    this.provider.on?.("accountsChanged", this.handleAccounts);
    this.provider.on?.("chainChanged", this.handleChain);
    this.onChange(this.snapshot());
    return this.snapshot();
  }

  clear(reason = "Disconnected.") {
    this.clearListeners();
    this.provider = undefined;
    this.account = undefined;
    this.chainId = undefined;
    this.detail = undefined;
    this.onChange({ ...this.snapshot(), reason });
  }

  clearListeners() {
    this.provider?.removeListener?.("accountsChanged", this.handleAccounts);
    this.provider?.removeListener?.("chainChanged", this.handleChain);
  }

  snapshot() {
    return Object.freeze({
      connected: Boolean(this.provider && this.account),
      provider: this.provider,
      detail: this.detail,
      account: this.account,
      chainId: this.chainId,
      correctNetwork: this.chainId === this.expectedChainId,
    });
  }
}

export function normalizeChainId(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const text = String(value ?? "");
  if (/^0x[0-9a-f]+$/i.test(text)) return Number.parseInt(text, 16);
  if (/^\d+$/.test(text)) return Number(text);
  return undefined;
}

export function isAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value ?? ""));
}

export { EMPTY };
