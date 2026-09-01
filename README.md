# Open Grant Eligibility Evidence Checker

An end-to-end GenLayer Project for checking three published grant criteria against applicant-declared facts:

- allowed region;
- allowed organization type; and
- published UTC deadline.

The contract produces an evidence signal, not a legal or funding guarantee. Applicant facts are self-declared and are not independently verified.

## Contract

`contracts/open_grant_eligibility_evidence_checker.py` stores applications in `TreeMap[str, Application]`.

Workflow:

1. Applicant calls `create_application`.
2. Applicant calls `freeze_application` with the three canonical criterion IDs, deadline, and observation window.
3. Any assessor calls `assess_application`.
4. An unavailable source can be retried with `retry_unresolved` up to two times.

The source at `grant_url` must be a bounded JSON object with this shape:

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

Validators independently refetch and rederive the consequential result. Unavailable, malformed, stale, or unbound evidence never becomes a negative eligibility decision.

## Local verification

The current verified local environment is Python 3.13 with `genlayer-test==0.29.2`, `genlayer-py==0.16.3`, `genvm-linter==0.11.0`, and the cached GenVM `v0.3.0-rc7` runner bundle.

```powershell
$env:PYTHONIOENCODING = 'utf-8'
gltest tests/ -q
genvm-lint check contracts/open_grant_eligibility_evidence_checker.py --json
genvm-lint schema contracts/open_grant_eligibility_evidence_checker.py
```

## Frontend

The native Vite frontend lives in `frontend/`. It uses `genlayer-js==1.1.8` and the current exported `studionet` chain configuration. No contract address is bundled into source: copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_CONTRACT_ADDRESS` only after a contract has been deployed.

```powershell
Set-Location frontend
npm test
npm run build
```

The wallet chooser supports MetaMask, OKX Wallet, and Rabby through EIP-6963. It never requests accounts when the chooser opens. Writes are single-flight, persist the transaction hash when browser storage is available, poll the GenLayer transaction object for `FINALIZED` plus `MAJORITY_AGREE`, require semantic `FINISHED_WITH_RETURN`, and then perform an application readback. If storage persistence degrades after submission, the hash is retained only for the current page and the UI instructs the user not to retry.

This repository is prepared only through the pre-deployment boundary. Studio deployment, signing, live E2E, GitHub push, and Vercel deployment require their later approvals and are intentionally not performed here.

## Official technical references

- https://docs.genlayer.com/developers/intelligent-contracts/features/web-access
- https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle
- https://docs.genlayer.com/api-references/genlayer-linter
- https://docs.genlayer.com/api-references/genlayer-test
- https://docs.genlayer.com/api-references/genlayer-js
