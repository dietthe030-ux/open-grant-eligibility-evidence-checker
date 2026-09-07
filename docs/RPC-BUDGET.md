# RPC budget

Studio and frontend traffic are separate scopes. Counts below are planned maxima of observable primary-AI actions or SDK/provider calls, not fabricated physical-network totals.

## Studio RPC measurement capability probe

```yaml
STUDIO_CAPABILITY_PROBE_STATUS: COMPLETE
STUDIO_MEASUREMENT_MODE: OBSERVABLE_ACTION_LEDGER
STUDIO_MEASUREMENT_TIMING: PRE_E2E
STUDIO_CAPABILITY_PROBE_AT: "2026-09-07T09:30:21.1201080Z"
STUDIO_CAPABILITY_TOOL_OR_API: "Codex in-app Browser tool inventory and action receipts"
STUDIO_CAPABILITY_CHECK: "Inspected the available Browser control and app-tab APIs before opening Studio; no network-event, performance-entry, DevTools request log, proxy log, or physical-request counter is exposed, while commanded actions and returned transaction/readback results can be recorded individually."
STUDIO_CAPABILITY_RESULT: "Physical network requests are not exposed; every primary-AI action, transaction/hash, status poll, terminal receipt inspection and authoritative readback is observable."
STUDIO_PHYSICAL_COUNT_CLAIM: NONE
STUDIO_ACTION_LEDGER_STATUS: PRELOCKED
```

No Studio page, deployment, signature, contract write, or E2E action for this candidate preceded this probe. The post-deployment ledger will enumerate every observed action and variance without claiming a physical request count.

First read-only ledger entry after the probe: at `2026-09-07T09:34:23.3628670Z`, direct Studionet RPC returned `eth_chainId=0xf22f` and `eth_getBalance(0xeF5D2119416A2f5afa35dCFA209766EFC1BE5902, latest)=0x361a08405e8fd80000` (998 GEN). An unsupported read-only `eth_accounts` capability probe returned JSON-RPC `-32601 Method not found`; it created no transaction and is not treated as account-access proof.

## STUDIO RPC BUDGET MATRIX

Locked mode: `OBSERVABLE_ACTION_LEDGER`. Polling is bounded to 60 attempts at 2.5 seconds, with at most two recognized transient-transport retries, capped delay, terminal stop, and no write resubmission.

| Case | Account / role | Action or method | Exact purpose / arguments | Planned max observable actions | Transactions | Terminal proof |
|---|---|---|---|---:|---:|---|
| S00 | deployer/upgrader | account + network check | Studionet chain `61999`; account `0xeF5D2119416A2f5afa35dCFA209766EFC1BE5902`; spendable balance | 3 | 0 | exact chain/account/balance recorded |
| S01 | deployer/upgrader | pre-deploy schema/source probes | schema for exact candidate source and local SHA-256 parity | 2 | 0 | public ABI and exact source hash match reviewed package |
| S02 | deployer/upgrader | deploy | exact reviewed source; constructor arguments `[]` | 64 | 1 | one submission + max 62 status observations + terminal contract-address result/readback; `FINALIZED`, semantic success and consensus |
| S03 | deployer/upgrader/owner | deployed source + identity reads | `gen_getContractCode`, `get_owner()`, `get_upgrader()`, `is_authorized_publisher(deployer)` | 4 | 0 | source SHA exact and all identities bind to locked account / `true` |
| S04 | deployer/authorized publisher | `register_grant_specification` | fresh `open-grant-2027-v1` matching the deployed fixture identity, canonical public fixture URL, digest `9f8b149c071a70b52fe5a818d8d0368b2fbd7629b56c9bd1f9f1830d116584da`, IDs `region-1`/`org-type-1`/`deadline-2027`, deadline `2027-01-01T00:00:00Z`, window `1798760000..1798762000` | 64 | 1 | immutable specification readback exact |
| S05 | simulated unauthorized caller `0x1111111111111111111111111111111111111111` | Studio `gen_call` of `register_grant_specification` | fresh rejected ID with the same non-secret fields; read-only live-runtime authority probe | 3 | 0 | expected `publisher is not authorized`, unchanged count and unknown ID readback |
| S06 | applicant account | `create_application` | fresh `authorized-positive-20260907-02`, specification `open-grant-2027-v1`, `US`, `NONPROFIT`, `1798761500` | 64 | 1 | `DRAFT` snapshot binds publisher/source/digest |
| S07 | applicant account | `freeze_application` | same positive application ID | 64 | 1 | `FROZEN`; bound terms unchanged |
| S08 | applicant account | `assess_application` | same positive application ID | 64 | 1 | `ASSESSED`, `ELIGIBLE`, three matches, exact digest/time |
| S09 | deployer/authorized publisher | `register_grant_specification` | fresh `open-grant-2027-digest-mismatch-v2`; same URL/criteria/window but expected digest `0000000000000000000000000000000000000000000000000000000000000000` | 64 | 1 | mismatch specification readback exact |
| S10 | applicant account | create + freeze + assess mismatch journey | fresh `authorized-digest-mismatch-20260907-02`; `US`, `NONPROFIT`, `1798761500` | 192 | 3 | final `UNRESOLVED`, reason `EVIDENCE_DIGEST_MISMATCH`, observed digest retained |

Each write allowance is: one submission action, at most 62 status observations (60 ordinary polls plus two recognized transient retries), and one authoritative readback. Deployment substitutes contract-address/source/identity readback for application readback. The final ledger records actual actions, retries, hashes, receipt reads, readbacks, duplicate count and variance.

## FRONTEND RPC BUDGET MATRIX

Installed/runtime basis: `genlayer-js@1.1.8`; finality polling in this app uses `getTransaction`, max 60 successful poll attempts at 2.5 seconds plus at most two transient retries. A normal injected-wallet write uses `eth_getTransactionCount`, `eth_estimateGas`, optional `eth_gasPrice`, and `eth_sendTransaction`; the SDK's recognized ABI-compatibility fallback can repeat estimate/gas-price/send before any accepted hash. Transaction maximum remains one accepted write.

| Workflow | Calls and branch | Polling / retry | Planned maximum calls | Transactions | Terminal/readback |
|---|---|---|---:|---:|---|
| Fresh page / open chooser | provider announcements only; no account RPC | none | 0 | 0 | disconnected chooser-ready UI |
| Connect, already on Studionet | `eth_requestAccounts`, `eth_chainId`, `eth_getBalance` | no blind retry | 3 | 0 | selected provider/account, correct chain, sufficient GEN |
| Connect, unknown chain worst branch | request accounts; chain ID; failed switch; add chain; switch retry; post-switch chain ID; balance | bounded branch only on error `4902` | 7 | 0 | same selected provider reaches Studionet |
| Create draft | `gen_call(get_grant_specification)` + write preparation/submission (normal 4; compatibility max 7) + up to 62 `getTransaction` attempts + `gen_call(get_application)` | 2.5s / 60; transient max 2, capped and abortable | 71 | 1 | `DRAFT` and exact specification/publisher/URL/digest snapshot |
| Freeze application | pre-read `gen_call(get_application)` + write max 7 + status max 62 + post-read | same | 71 | 1 | `FROZEN`, bound terms unchanged |
| Assess | pre-read + write max 7 + status max 62 + post-read | same | 71 | 1 | exact outcome, criteria, digest, reason and observed time |
| Retry unresolved | pre-read + write max 7 + status max 62 + post-read | same hash; no resubmit | 71 | 1 | unresolved/eligible postconditions and incremented retry count |
| Reload reconciliation | existing hash only: status max 62 + one authoritative post-read | abort on page hide/unload; no replacement write | 63 | 0 | retained operation/hash reconciled and journal cleared only after readback |
| Account/chain event | one balance refresh when account remains valid and target chain matches | stale response discarded | 1 | 0 | atomic store/write-client eligibility update |

No cache is used for authorization, balance, lifecycle or verdict reads. Pending writes are keyed by application ID, in-flight execution is single-flight, and a persisted hash is reconciled without automatic resubmission.
