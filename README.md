# Open Grant Eligibility Evidence Checker

An end-to-end GenLayer Project for checking three published grant criteria against applicant-declared facts:

- allowed region;
- allowed organization type; and
- published UTC deadline.

The contract produces an evidence signal, not a legal or funding guarantee. Applicant facts are self-declared and are not independently verified.

## Trust problem

An applicant should not be able to choose the grant source, criteria or evidence digest that decides their own eligibility. A mutable or mismatched public source can make a frontend label look authoritative while validators observe different facts.

## Why GenLayer is essential

The consequential decision is the validator-agreed interpretation of a bounded public JSON source: exact URL identity, canonical digest, criteria, deadline, observation window and applicant facts. GenLayer records publisher authorization and application lifecycle on-chain, then requires leader and validator equivalence before the result becomes authoritative.

## Intelligent Contract

`contracts/open_grant_eligibility_evidence_checker.py` stores an owner-managed publisher allowlist, immutable grant specifications, and applications.

### How it works

1. The contract owner authorizes a publisher with `set_publisher_authorization` (the deployer is authorized initially).
2. That publisher calls `register_grant_specification`, binding a unique specification ID to its canonical HTTPS URL, expected canonical JSON SHA-256, criterion IDs, deadline, and observation window. Specification IDs are immutable.
3. An applicant calls `create_application` with that registered specification ID and only applicant-declared facts. The contract snapshots the publisher-bound terms; the applicant cannot supply or replace them.
4. The applicant calls `freeze_application(application_id)` to seal that snapshot without any rule or source arguments.
5. Any assessor calls `assess_application`. An unavailable source can be retried with `retry_unresolved` up to two times.

The source bound by the authorized publisher must be a bounded JSON object with this shape:

```json
{
  "canonical_url": "https://example.org/grant.json",
  "observed_at": 1798761500,
  "criterion_ids": {
    "region": "region-1",
    "org_type": "org-type-1",
    "deadline": "deadline-2027"
  },
  "allowed_regions": ["EU", "US"],
  "allowed_org_types": ["NONPROFIT"],
  "deadline_utc": "2027-01-01T00:00:00Z"
}
```

Validators independently refetch and rederive the consequential result. The fetched exact URL and canonical JSON digest must equal the values precommitted by the authorized publisher, and leader/validator equivalence includes that digest. The source cannot authorize itself by declaring an on-chain specification ID. Unauthorized registration, source identity mismatch, digest mismatch, unavailable, malformed, stale, or otherwise unbound evidence cannot produce a conclusive eligibility result.

## Verified links

- Studio Next contract: [`0x7f8fB07F756125e60c114C61A55963eD454301a9`](https://explorer-studio-dev.genlayer.com/address/0x7f8fB07F756125e60c114C61A55963eD454301a9)
- Deployment transaction: [`0xa019e5555f39e1f658787af50135810d3002811a5655dcbc3cf8bf253204a634`](https://explorer-studio-dev.genlayer.com/tx/0xa019e5555f39e1f658787af50135810d3002811a5655dcbc3cf8bf253204a634)
- Canonical public fixture: [`open-grant-eligibility.json`](https://open-grant-eligibility-evidence-che.vercel.app/e2e/open-grant-eligibility.json)
- Live application: Vercel release pending the governed GitHub/Vercel release steps; no unverified URL is advertised.

The accepted deployment is `FINALIZED` with `MAJORITY_AGREE`, `FINISHED_WITH_RETURN`, leader `SUCCESS/return`, and 5/5 revealed votes. The deployed contract code is 21,592 bytes and matches source SHA-256 `01FC51D2C56DBECEE2AB6283189A7AAB9E92461FCA90DFC256D82E6BFCA6D615`.

## Local verification

The current Studio Next-compatible verification environment is Python 3.13.6 with `genlayer-test==0.30.0rc2`, `genlayer-py==0.19.0rc2`, `genvm-linter==0.11.1rc2`, GenLayer CLI `0.40.0-rc.3`, and `genlayer-js==2.0.0-rc.1`. The selected network is Studio Devnet (`studioDevnet`, chain `61997`, RPC `https://studio-dev.genlayer.com/api`).

```powershell
$env:PYTHONIOENCODING = 'utf-8'
gltest tests/ -q
genvm-lint check contracts/open_grant_eligibility_evidence_checker.py --json
genvm-lint schema contracts/open_grant_eligibility_evidence_checker.py
```

## Architecture

The Intelligent Contract owns publisher authorization, immutable grant specifications, application lifecycle, validator equivalence and the final outcome. The Vite frontend owns wallet selection, input validation, transaction progress, bounded polling, hash retention, retry/reconciliation controls and authoritative readback presentation. The public JSON source is evidence input only; the on-chain specification and application readback are the source of truth for what was authorized and what was concluded.

## Transaction lifecycle

Every write explicitly moves through wallet confirmation, submission, bounded finality polling, semantic execution verification, consensus verification and authoritative readback. A hash is retained with Copy and Explorer controls after submission. The interface exposes `FINALIZED` separately from semantic success and readback; rejected, failed and reconciliation-required states never auto-resubmit. `retry_unresolved` is explicit and bounded, and the application ID prevents duplicate creation.

## Frontend

The native Vite frontend lives in `frontend/`. It uses the coherent Studio Dev RC stack with `genlayer-js==2.0.0-rc.1` and the exported `studioDevnet` chain configuration (`https://studio-dev.genlayer.com/api`, chain `61997`). No contract address is bundled into source: copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_CONTRACT_ADDRESS` only after a Studio Dev contract has been deployed.

```powershell
Set-Location frontend
npm test
npm run build
```

The wallet chooser supports MetaMask, OKX Wallet, and Rabby through EIP-6963. It never requests accounts when the chooser opens. Writes are single-flight, persist the transaction hash when browser storage is available, poll the GenLayer transaction object for `FINALIZED` plus `MAJORITY_AGREE`, require semantic `FINISHED_WITH_RETURN`, and then perform an application readback. If storage persistence degrades after submission, the hash is retained only for the current page and the UI instructs the user not to retry.

The current frontend is bound to the accepted Studio Dev contract above through `VITE_CONTRACT_ADDRESS`. The repository target is [dietthe030-ux/open-grant-eligibility-evidence-checker](https://github.com/dietthe030-ux/open-grant-eligibility-evidence-checker). The public Vercel application URL will be added only after the exact release is deployed and independently checked.

## Deployment and verification

- Network: GenLayer Studio Devnet, chain `61997` (`0xf22d`), RPC `https://studio-dev.genlayer.com/api`.
- Frontend build root: `frontend`; set `VITE_CONTRACT_ADDRESS` to the verified contract address above.
- Exact source/deployment parity, the complete Studio S0–S11 proof matrix, recovery manifest and current frontend RPC matrix are recorded in [`docs/DEPLOYMENT-RECOVERY.md`](docs/DEPLOYMENT-RECOVERY.md) and [`docs/RPC-BUDGET.md`](docs/RPC-BUDGET.md).
- The public release remains subject to post-push GitHub review and the required exact-deployment Vercel E2E.

## Security and trust boundaries

Applicants submit only self-declared facts and cannot choose the evidence URL, criteria or digest. Only an authorized publisher can register an immutable specification. Validators independently refetch the exact bound URL and compare the publisher-precommitted digest and consequential fields. Wallet secrets never enter the repository or contract. This tool is not identity verification, legal advice or a funding guarantee.

## Known limitations

- Applicant facts are self-declared.
- Eligibility depends on the bounded public source being available, well-formed, fresh and equivalent across validators; otherwise the contract fails closed as `UNRESOLVED`.
- The public Vercel app link is intentionally not advertised until its exact release and final E2E are complete.

## Official technical references

- https://docs.genlayer.com/developers/intelligent-contracts/features/web-access
- https://docs.genlayer.com/developers/intelligent-contracts/features/upgradability
- https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle
- https://docs.genlayer.com/api-references/genlayer-linter
- https://docs.genlayer.com/api-references/genlayer-test
- https://docs.genlayer.com/api-references/genlayer-js
