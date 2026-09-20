# RPC budget

Studio and frontend traffic are separate scopes. Counts below are planned maxima of observable primary-AI actions or SDK/provider calls, not fabricated physical-network totals.

## Studio Next readiness (not an RPC budget gate)

Current governance does not require a Studio RPC measurement matrix, physical-request count, or capability-probe evidence. Studio execution is controlled by the official CLI route and a single-operation invariant: validate the exact target, reserve one operation ID, broadcast once, store the returned hash, and independently verify receipt/finality, semantic execution and authoritative readback. Never blind-retry a write.

```yaml
NETWORK_ALIAS: studio-dev
NETWORK_NAME: GenLayer Studio Devnet
CHAIN_ID: 61997
RPC: https://studio-dev.genlayer.com/api
EXPLORER: https://explorer-studio-dev.genlayer.com/
SDK_CHAIN: studioDevnet
CLI_VERSION: 0.40.0-rc.3
GENLAYER_JS_VERSION: 2.0.0-rc.1
GENLAYER_PY_VERSION: 0.19.0rc2
GENLAYER_TEST_VERSION: 0.30.0rc2
GENVM_LINTER_VERSION: 0.11.1rc2
SELECTED_ACTOR: actor7
SELECTED_ADDRESS: 0x8581c4a532dd3f9b163b12809b1bd089f367147f
INITIAL_READINESS_WRITES_SUBMITTED: 0
CURRENT_ACCEPTED_STUDIO_WRITES: 12
```

The isolated CLI wrapper and venv were verified against the canonical Studio Next target. The frontend matrix below is the applicable frontend release budget; Studio evidence is recorded in the deployment ledger rather than represented as a physical RPC count.

## Studio Next execution evidence

1. `studio-dev`, chain `61997`, actor7 and the exact candidate source/schema were verified before writes.
2. The exact reviewed source was deployed once with constructor arguments `[]`; deployment and every dependent write use one stable operation ID and one accepted hash.
3. Deployment and S0–S11 were independently checked for finality/status, leader semantic result, consensus and authoritative readback.
4. The accepted address is `0x7f8fB07F756125e60c114C61A55963eD454301a9`; the complete live matrix is in `private/resubmission/STUDIO-DEPLOYMENT-LEDGER.md`.
5. Unknown errors, identity mismatches, missing hashes and ambiguous operation states remain stop conditions; no blind resubmission or historical 61999 reuse is permitted.

The post-deployment ledger records exact arguments, hashes, receipt/finality, semantic result, consensus and readback. It does not claim a physical RPC count.

## FRONTEND RPC BUDGET MATRIX

Installed/runtime basis: `genlayer-js@2.0.0-rc.1` on `studioDevnet` (chain `61997`); finality polling in this app uses `getTransaction`, max 60 successful poll attempts at 2.5 seconds plus at most two transient retries. A normal injected-wallet write uses `eth_getTransactionCount`, `eth_estimateGas`, optional `eth_gasPrice`, and `eth_sendTransaction`; the SDK's recognized ABI-compatibility fallback can repeat estimate/gas-price/send before any accepted hash. Transaction maximum remains one accepted write.

| Workflow | Calls and branch | Polling / retry | Planned maximum calls | Transactions | Terminal/readback |
|---|---|---|---:|---:|---|
| Fresh page / open chooser | provider announcements only; no account RPC | none | 0 | 0 | disconnected chooser-ready UI |
| Connect, already on Studio Dev | `eth_requestAccounts`, `eth_chainId`, `eth_getBalance` | no blind retry | 3 | 0 | selected provider/account, correct chain, sufficient GEN |
| Connect, unknown chain worst branch | request accounts; chain ID; failed switch; add chain; switch retry; post-switch chain ID; balance | bounded branch only on error `4902` | 7 | 0 | same selected provider reaches Studio Dev |
| Create draft | `gen_call(get_grant_specification)` + write preparation/submission (normal 4; compatibility max 7) + up to 62 `getTransaction` attempts + `gen_call(get_application)` | 2.5s / 60; transient max 2, capped and abortable | 71 | 1 | `DRAFT` and exact specification/publisher/URL/digest snapshot |
| Freeze application | pre-read `gen_call(get_application)` + write max 7 + status max 62 + post-read | same | 71 | 1 | `FROZEN`, bound terms unchanged |
| Assess | pre-read + write max 7 + status max 62 + post-read | same | 71 | 1 | exact outcome, criteria, digest, reason and observed time |
| Retry unresolved | pre-read + write max 7 + status max 62 + post-read | same hash; no resubmit | 71 | 1 | unresolved/eligible postconditions and incremented retry count |
| Reload reconciliation | existing hash only: status max 62 + one authoritative post-read | abort on page hide/unload; no replacement write | 63 | 0 | retained operation/hash reconciled and journal cleared only after readback |
| Account/chain event | one balance refresh when account remains valid and target chain matches | stale response discarded | 1 | 0 | atomic store/write-client eligibility update |

No cache is used for authorization, balance, lifecycle or verdict reads. Pending writes are keyed by application ID, in-flight execution is single-flight, and a persisted hash is reconciled without automatic resubmission.
