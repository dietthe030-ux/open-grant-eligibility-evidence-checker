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
  listeners.get("accountsChanged")([]);
  assert.equal(session.snapshot().connected, false);
});

test("chain IDs normalize decimal and hexadecimal forms", () => {
  assert.equal(normalizeChainId("0xf22f"), 61999);
  assert.equal(normalizeChainId("61999"), 61999);
  assert.equal(normalizeChainId("nope"), undefined);
});
