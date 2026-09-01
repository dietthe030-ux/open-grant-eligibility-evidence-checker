import test from "node:test";
import assert from "node:assert/strict";
import { WalletRegistry, WalletSession, normalizeChainId, supportedWallet } from "../../frontend/src/wallet.js";

const provider = { request: async () => ["0x1111111111111111111111111111111111111111"] };
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
    request: async ({ method }) => method === "eth_chainId" ? "0xf22f" : ["0x2222222222222222222222222222222222222222"],
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
    request: async ({ method }) => method === "eth_chainId" ? "0xf22f" : ["0x2222222222222222222222222222222222222222"],
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

test("chain IDs normalize decimal and hexadecimal forms", () => {
  assert.equal(normalizeChainId("0xf22f"), 61999);
  assert.equal(normalizeChainId("61999"), 61999);
  assert.equal(normalizeChainId("nope"), undefined);
});
