# PRE_DEPLOY verification package

## Boundary

This package records the exact local implementation prepared before real Studio deployment. No wallet was connected, no contract was deployed or signed, no Studio transaction exists, and no GitHub/Vercel target was selected.

## Governance migration receipt

The Task now follows the current unified Build → implementation → Studio → GitHub/Vercel → E2E → review → Project Explorer lifecycle. The prior local implementation and exact evidence were retained; no workflow restart and no second Explorer build were created. `Milestones` was not activated. The current checkpoint is `PRE_DEPLOY` readiness, and the required anonymous checkpoint remains independent from this Task.

## Verified implementation

- Exact reviewed revision is recorded in the ignored private PRE_DEPLOY package generated after the final source commit; this tracked note intentionally does not self-reference its own commit.
- Category: `PROJECT`.
- Contract: `contracts/open_grant_eligibility_evidence_checker.py`.
- Frontend: `frontend/` with native HTML/CSS/ES modules and Vite.
- Runtime: Python 3.13, `genlayer-py==0.16.3`, `genlayer-test==0.29.2`, `genvm-linter==0.11.0`, cached GenVM `v0.3.0-rc7`.
- Browser dependencies: `genlayer-js==1.1.8`, `vite==8.2.2`, Node `v22.22.2`.
- Network configuration: imported current `studionet` chain from `genlayer-js`; no remembered RPC or contract address is hardcoded.
- Public UI language audit: technical routing/provider details are kept out of the judge-facing page; wallet names appear only as individual picker choices.
- Frontend redesign: Claude `CLAUDE_DESIGN_ITERATION 1/2` was reviewed by Codex, limited to the allowed frontend files, then corrected for public copy and runtime-data-safe DOM rendering.

## Automated evidence

```text
gltest tests/ -q
14 passed

genvm-lint check contracts/open_grant_eligibility_evidence_checker.py --json
ok=true; semantic validation passed; 7 methods (3 view, 4 write)

genvm-lint schema contracts/open_grant_eligibility_evidence_checker.py
7 methods; 3 view methods; 4 write methods; 0 constructor parameters

Set-Location frontend; npm test
10 passed

Set-Location frontend; npm run build
Vite production build passed
```

The linter emitted informational `I200` that a newer runner exists; the project remains pinned to the locally verified compatible GenVM bundle and has not changed runners.

## Review finding closure

- Retry is now restricted to assessed unresolved applications; draft applications cannot be assessed through the retry path.
- Explicit timeout/connection/OSError web failures persist `UNRESOLVED` with bounded retry; unknown VM failures are not silently converted, even when their message contains network terminology.
- Transaction success now requires exact `FINALIZED`, `MAJORITY_AGREE`, and `FINISHED_WITH_RETURN` values.
- Wallet sessions now clear on provider `disconnect`, and unidentified injected providers are not shown as supported wallets.
- If browser storage fails after submission, the hash remains available only for the current page and the UI explicitly prohibits retry; durable journal persistence is required for reload recovery.

## Read-only Studio preflight

- Studio page opened in the Codex in-app Browser: `https://studio.genlayer.com/contracts`.
- Current visible network/account state: `998 GEN`; selected public account `0xeF5D2119416A2f5afa35dCFA209766EFC1BE5902`.
- The account menu was inspected without connecting a new provider, signing, submitting, or changing Studio state.

## Required live evidence still absent

- `PRE_DEPLOY` anonymous co-review approval for the final exact revision.
- Studio source upload/deployment schema acceptance and deployer-role confirmation for the final contract.
- Contract address, deployment transaction, finalized execution, consensus, and deployed-source readback.
- Studio lifecycle matrix and live Explorer evidence.
- User-confirmed GitHub/Vercel targets and user-operated final Vercel E2E.

## Stop condition

The next authorized action is the governed PRE_DEPLOY review. Even after reviewer approval, this task stops before any Studio deployment, signing, or other transaction until the user gives explicit permission.
