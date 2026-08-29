# PRE_DEPLOY verification package

## Boundary

This package records the exact local implementation prepared before real Studio deployment. No wallet was connected, no contract was deployed or signed, no Studio transaction exists, and no GitHub/Vercel target was selected.

## Governance migration receipt

The Task now follows the current unified Build → implementation → Studio → GitHub/Vercel → E2E → review → Project Explorer lifecycle. The prior local implementation and exact evidence were retained; no workflow restart and no second Explorer build were created. `Milestones` was not activated. The current checkpoint is `PRE_DEPLOY` readiness, and the required anonymous checkpoint remains independent from this Task.

## Verified implementation

- Category: `PROJECT`.
- Contract: `contracts/open_grant_eligibility_evidence_checker.py`.
- Frontend: `frontend/` with native HTML/CSS/ES modules and Vite.
- Runtime: Python 3.13, `genlayer-py==0.16.3`, `genlayer-test==0.29.2`, `genvm-linter==0.11.0`, cached GenVM `v0.3.0-rc7`.
- Browser dependencies: `genlayer-js==1.1.8`, `vite==8.2.2`, Node `v22.22.2`.
- Network configuration: imported current `studionet` chain from `genlayer-js`; no remembered RPC or contract address is hardcoded.
- Public UI language audit: technical routing/provider details are kept out of the judge-facing page; wallet names appear only as individual picker choices.

## Automated evidence

```text
gltest tests/ -q
11 passed

genvm-lint check contracts/open_grant_eligibility_evidence_checker.py --json
ok=true; semantic validation passed; 7 methods (3 view, 4 write)

genvm-lint schema contracts/open_grant_eligibility_evidence_checker.py
7 methods; 3 view methods; 4 write methods; 0 constructor parameters

Set-Location frontend; npm test
7 passed

Set-Location frontend; npm run build
Vite production build passed
```

The linter emitted informational `I200` that a newer runner exists; the project remains pinned to the locally verified compatible GenVM bundle and has not changed runners.

## Required live evidence still absent

- `PRE_DEPLOY` anonymous co-review approval for the final exact revision.
- Read-only Studio schema/deployer-account verification. The Codex in-app Browser preflight was attempted twice and stopped after the same environment error: `failed to write kernel assets: The system cannot find the path specified (os error 3)`. No Studio page was opened and no wallet/provider action occurred.
- Contract address, deployment transaction, finalized execution, consensus, and deployed-source readback.
- Studio lifecycle matrix and live Explorer evidence.
- User-confirmed GitHub/Vercel targets and user-operated final Vercel E2E.

## Stop condition

The next authorized action is the governed PRE_DEPLOY review and, only after its approval, a read-only Studio setup followed by deployment/signing. This task stops before any real Studio deployment.
