import test from "node:test";
import assert from "node:assert/strict";
import { WalletRegistry, WalletSession, normalizeChainId, supportedWallet } from "../../frontend/src/wallet.js";

const provider = { request: async ({ method }) => method === "eth_getBalance" ? "0x1" : ["0x1111111111111111111111111111111111111111"] };
const detail = (uuid = "meta-1", currentProvider = provider) => ({
  info: { uuid, name: "MetaMask", rdns: "io.metamask", icon: "data:image/svg+xml,%3Csvg/%3E" },
  provider: currentProvider,
});

test("provider registry accepts supported announcements and deduplicates provider objects", () => {
  const registry = new WalletRegistry();
  assert.equal(registry.accept(detail()), true);
  assert.equal(registry.accept(detail("meta-2")), false);
  assert.equal(registry.providers().length, 1);
  assert.equal(supportedWallet(detail().info).label, "MetaMask");
  assert.equal(supportedWallet({ name: "Unknown", rdns: "unknown.wallet" }), undefined);
  assert.equal(supportedWallet({ name: "MetaMask", rdns: "forged.wallet" }), undefined);
});

test("wallet session is explicitly connected and invalidates on account removal", async () => {
  const listeners = new Map();
  const sessionProvider = {
    request: async ({ method }) => method === "eth_chainId" ? "0xf22f" : method === "eth_getBalance" ? "0x1" : ["0x2222222222222222222222222222222222222222"],
    on: (event, handler) => listeners.set(event, handler),
    removeListener: (event) => listeners.delete(event),
  };
  const session = new WalletSession(61999);
  await session.connect(detail("meta-session", sessionProvider));
  assert.equal(session.snapshot().correctNetwork, true);
  assert.equal(session.snapshot().connected, true);
  assert.equal(listeners.has("disconnect"), true);
  listeners.get("accountsChanged")([]);
  assert.equal(session.snapshot().connected, false);
});

test("wallet session clears on provider disconnect", async () => {
  const listeners = new Map();
  const sessionProvider = {
    request: async ({ method }) => method === "eth_chainId" ? "0xf22f" : method === "eth_getBalance" ? "0x1" : ["0x2222222222222222222222222222222222222222"],
    on: (event, handler) => listeners.set(event, handler),
    removeListener: (event) => listeners.delete(event),
  };
  const session = new WalletSession(61999);
  await session.connect(detail("meta-disconnect", sessionProvider));
  listeners.get("disconnect")({ code: 4900 });
  assert.equal(session.snapshot().connected, false);
  assert.equal(listeners.has("disconnect"), false);
});

test("registry does not expose an unidentified injected wallet", async () => {
  const target = {
    ethereum: provider,
    addEventListener: () => {},
    dispatchEvent: () => {},
  };
  const registry = new WalletRegistry(target);
  registry.start();
  await new Promise((resolve) => queueMicrotask(resolve));
  assert.deepEqual(registry.providers(), []);
});

test("registry falls back to a flagged legacy wallet when EIP-6963 is absent", async () => {
  const legacy = { isMetaMask: true, request: async () => [] };
  const target = { ethereum: legacy, addEventListener: () => {}, dispatchEvent: () => {} };
  const registry = new WalletRegistry(target);
  registry.start();
  await new Promise((resolve) => queueMicrotask(resolve));
  assert.equal(registry.providers()[0].info.rdns, "io.metamask");
  assert.equal(registry.providers()[0].legacy, true);
});

test("a later EIP-6963 announcement replaces the legacy fallback", async () => {
  const legacy = { isMetaMask: true, request: async () => [] };
  const announced = { request: async () => [] };
  const target = { ethereum: legacy, addEventListener: () => {}, dispatchEvent: () => {} };
  const registry = new WalletRegistry(target);
  registry.start();
  await new Promise((resolve) => queueMicrotask(resolve));
  assert.equal(registry.providers()[0].legacy, true);
  assert.equal(registry.accept(detail("announced-meta", announced)), true);
  assert.deepEqual(registry.providers().map((item) => item.info.uuid), ["announced-meta"]);
});

test("wallet session adds and switches an unknown chain, then verifies GEN balance", async () => {
  const methods = [];
  let chainId = "0x1";
  const sessionProvider = {
    request: async ({ method }) => {
      methods.push(method);
      if (method === "eth_requestAccounts") return ["0x2222222222222222222222222222222222222222"];
      if (method === "eth_chainId") return chainId;
      if (method === "wallet_switchEthereumChain") {
        if (chainId !== "0x1") return null;
        const error = new Error("unknown chain"); error.code = 4902; throw error;
      }
      if (method === "wallet_addEthereumChain") { chainId = "0xf22f"; return null; }
      if (method === "eth_getBalance") return "0x2";
      return null;
    },
  };
  const session = new WalletSession(61999, () => {}, { name: "Genlayer Studio Network", nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 }, rpcUrls: { default: { http: ["https://studio.genlayer.com/api"] } } });
  await session.connect(detail("meta-add", sessionProvider));
  assert.equal(session.snapshot().sufficientBalance, true);
  assert.deepEqual(methods, ["eth_requestAccounts", "eth_chainId", "wallet_switchEthereumChain", "wallet_addEthereumChain", "wallet_switchEthereumChain", "eth_chainId", "eth_getBalance"]);
});

test("wallet session switches a known chain without adding it", async () => {
  let chainId = "0x1";
  const sessionProvider = {
    request: async ({ method }) => {
      if (method === "eth_requestAccounts") return ["0x2222222222222222222222222222222222222222"];
      if (method === "eth_chainId") return chainId;
      if (method === "wallet_switchEthereumChain") { chainId = "0xf22f"; return null; }
      if (method === "eth_getBalance") return "0x2";
      return null;
    },
  };
  const session = new WalletSession(61999, () => {}, { name: "Genlayer Studio Network" });
  await session.connect(detail("meta-switch", sessionProvider));
  assert.equal(session.snapshot().correctNetwork, true);
});

test("wallet session surfaces a rejected network switch", async () => {
  const sessionProvider = {
    request: async ({ method }) => {
      if (method === "eth_requestAccounts") return ["0x2222222222222222222222222222222222222222"];
      if (method === "eth_chainId") return "0x1";
      if (method === "wallet_switchEthereumChain") { const error = new Error("rejected"); error.code = 4001; throw error; }
      return null;
    },
  };
  const session = new WalletSession(61999, () => {}, { name: "Genlayer Studio Network" });
  await assert.rejects(() => session.connect(detail("meta-reject", sessionProvider)), /switch was rejected/);
});

test("chain IDs normalize decimal and hexadecimal forms", () => {
  assert.equal(normalizeChainId("0xf22f"), 61999);
  assert.equal(normalizeChainId("61999"), 61999);
  assert.equal(normalizeChainId("nope"), undefined);
});
