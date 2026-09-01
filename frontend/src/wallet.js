const LEGACY_PREFIX = "legacy-window-ethereum";
export const MIN_SPENDABLE_GEN_WEI = 1n;
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

function legacyWallet(provider) {
  if (!isProvider(provider)) return undefined;
  if (provider.isRabby) return SUPPORTED_WALLETS.find((wallet) => wallet.key === "rabby");
  if (provider.isOkxWallet || provider.isOKXWallet || provider.isOkx) return SUPPORTED_WALLETS.find((wallet) => wallet.key === "okx");
  if (provider.isMetaMask) return SUPPORTED_WALLETS.find((wallet) => wallet.key === "metamask");
  return undefined;
}

export function supportedWallet(info) {
  const rdns = String(info?.rdns ?? "").toLowerCase();
  return SUPPORTED_WALLETS.find((wallet) =>
    wallet.rdns.includes(rdns),
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
      if (this.byUuid.size > 0) return;
      const injected = this.target.ethereum;
      const candidates = Array.isArray(injected?.providers) ? injected.providers : [injected];
      candidates.forEach((provider) => {
        const wallet = legacyWallet(provider);
        if (!wallet) return;
        const uuid = `${LEGACY_PREFIX}-${wallet.key}`;
        const detail = {
          legacy: true,
          info: { uuid, name: wallet.label, rdns: wallet.rdns[0], icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E" },
          provider,
        };
        this.uuidByProvider.set(provider, uuid);
        this.byUuid.set(uuid, detail);
      });
      if (this.byUuid.size > 0) this.publish();
    });
  }

  accept(detail) {
    if (!isAnnouncement(detail) || !supportedWallet(detail.info)) return false;
    const providerObject = detail.provider;
    const priorUuid = this.uuidByProvider.get(providerObject);
    const priorDetail = this.byUuid.get(detail.info.uuid);
    if (priorUuid && priorUuid !== detail.info.uuid && !String(priorUuid).startsWith(`${LEGACY_PREFIX}-`)) return false;
    if (priorDetail && priorDetail.provider !== providerObject) return false;
    for (const [uuid, candidate] of this.byUuid) if (candidate.legacy) this.byUuid.delete(uuid);
    this.uuidByProvider.set(providerObject, detail.info.uuid);
    this.byUuid.set(detail.info.uuid, detail);
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
  constructor(expectedChainId, onChange = () => {}, chain = {}) {
    this.expectedChainId = Number(expectedChainId);
    this.onChange = onChange;
    this.chain = chain;
    this.provider = undefined;
    this.account = undefined;
    this.chainId = undefined;
    this.balanceWei = undefined;
    this.detail = undefined;
    this.handleAccounts = (accounts) => {
      const next = Array.isArray(accounts) ? accounts[0] : undefined;
      if (!next) this.clear("Wallet disconnected.");
      else {
        this.account = String(next).toLowerCase();
        this.balanceWei = undefined;
        this.onChange(this.snapshot());
        void this.refreshBalance(this.account, this.chainId);
      }
    };
    this.handleChain = (chainId) => {
      this.chainId = normalizeChainId(chainId);
      this.balanceWei = undefined;
      this.onChange(this.snapshot());
      void this.refreshBalance(this.account, this.chainId);
    };
    this.handleDisconnect = () => this.clear("Wallet disconnected.");
  }

  async connect(detail) {
    if (!detail?.provider || !supportedWallet(detail.info)) {
      throw new Error("Select a supported wallet provider first.");
    }
    const accounts = await detail.provider.request({ method: "eth_requestAccounts" });
    const account = Array.isArray(accounts) ? accounts[0] : undefined;
    if (!isAddress(account)) throw new Error("The selected wallet returned no usable account.");
    let chainId = normalizeChainId(await detail.provider.request({ method: "eth_chainId" }));
    if (chainId !== this.expectedChainId) {
      await this.switchToExpectedNetwork(detail.provider);
      chainId = normalizeChainId(await detail.provider.request({ method: "eth_chainId" }));
    }
    if (chainId !== this.expectedChainId) throw new Error("Wallet did not switch to Studionet.");
    const balanceWei = parseBalance(await detail.provider.request({ method: "eth_getBalance", params: [account, "latest"] }));
    if (balanceWei < MIN_SPENDABLE_GEN_WEI) throw new Error("Wallet has no spendable GEN for this transaction.");
    this.clearListeners();
    this.provider = detail.provider;
    this.detail = detail;
    this.account = account.toLowerCase();
    this.chainId = chainId;
    this.balanceWei = balanceWei;
    this.provider.on?.("accountsChanged", this.handleAccounts);
    this.provider.on?.("chainChanged", this.handleChain);
    this.provider.on?.("disconnect", this.handleDisconnect);
    this.onChange(this.snapshot());
    return this.snapshot();
  }

  clear(reason = "Disconnected.") {
    this.clearListeners();
    this.provider = undefined;
    this.account = undefined;
    this.chainId = undefined;
    this.balanceWei = undefined;
    this.detail = undefined;
    this.onChange({ ...this.snapshot(), reason });
  }

  clearListeners() {
    this.provider?.removeListener?.("accountsChanged", this.handleAccounts);
    this.provider?.removeListener?.("chainChanged", this.handleChain);
    this.provider?.removeListener?.("disconnect", this.handleDisconnect);
  }

  async refreshBalance(account = this.account, chainId = this.chainId) {
    if (!this.provider || !isAddress(account) || chainId !== this.expectedChainId) return;
    const provider = this.provider;
    try {
      const balanceWei = parseBalance(await provider.request({ method: "eth_getBalance", params: [account, "latest"] }));
      if (this.provider !== provider || this.account !== String(account).toLowerCase() || this.chainId !== chainId) return;
      this.balanceWei = balanceWei;
      this.onChange(this.snapshot());
    } catch (error) {
      if (this.provider !== provider || this.account !== String(account).toLowerCase() || this.chainId !== chainId) return;
      this.balanceWei = undefined;
      this.onChange({ ...this.snapshot(), reason: String(error?.message ?? error) });
    }
  }

  snapshot() {
    return Object.freeze({
      connected: Boolean(this.provider && this.account),
      provider: this.provider,
      detail: this.detail,
      account: this.account,
      chainId: this.chainId,
      balanceWei: this.balanceWei,
      sufficientBalance: this.balanceWei !== undefined && this.balanceWei >= MIN_SPENDABLE_GEN_WEI,
      correctNetwork: this.chainId === this.expectedChainId,
    });
  }

  async switchToExpectedNetwork(provider) {
    const chainId = `0x${this.expectedChainId.toString(16)}`;
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    } catch (error) {
      const code = error?.code ?? error?.data?.originalError?.code;
      if (code !== 4902) throw new Error("Wallet network switch was rejected or unavailable.");
      await provider.request({ method: "wallet_addEthereumChain", params: [this.chainParameters(chainId)] });
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    }
  }

  chainParameters(chainId) {
    return {
      chainId,
      chainName: this.chain.name ?? "Genlayer Studio Network",
      nativeCurrency: this.chain.nativeCurrency ?? { name: "GEN Token", symbol: "GEN", decimals: 18 },
      rpcUrls: this.chain.rpcUrls?.default?.http ?? ["https://studio.genlayer.com/api"],
      blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
    };
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

function parseBalance(value) {
  try {
    const text = String(value ?? "");
    if (!/^0x[0-9a-f]+$/i.test(text)) throw new Error("invalid balance");
    return BigInt(text);
  } catch {
    throw new Error("Could not verify the wallet GEN balance.");
  }
}

export { EMPTY };
