# Stage 1/2 implementation adaptation

## STAGE 1/2 IMPLEMENTATION ADAPTATION

- Original choice: `TreeMap[str, Application]` with three frozen criterion IDs, a UTC deadline, and observation bounds; assessment derives the outcome from the grant source.
- Verified problem/risk: Current GenLayer guidance requires every nondeterministic web access to run inside an equivalence pattern, and dynamic/raw evidence must not be compared as unconstrained prose. A product-sized LLM step would add no value because the approved criteria are three binary, explicitly identified facts.
- Authoritative evidence / probe: Official web-access and equivalence documentation checked 2026-09-20; the current candidate passes `genvm-lint check`, `genvm-lint schema`, and Direct Mode with the installed Studio Next RC family and GenVM `v0.6.0-rc5`.
- Historical replacement at the initial build: use `gl.nondet.web.get()` inside the retired `gl.vm.run_nondet_unsafe()` adapter, normalize a bounded JSON source, and independently rederive the consequence. Its audit-only digest treatment and applicant-selected source are superseded by the authority correction below.

## Steward-requested authority correction (2026-09-07)

- Superseded choice: the applicant supplied `grant_url`, criterion IDs, deadline, and observation bounds.
- Verified defect: independent fetching does not establish source authority when the applicant can choose or author that source.
- Replacement: the contract owner manages an authorized-publisher registry. Only an authorized publisher can create an immutable grant specification binding its address, canonical source URL, expected canonical JSON SHA-256, criterion IDs, deadline, and observation window. Applicants can only reference a registered specification and provide self-declared facts. Assessment requires exact URL, specification ID, and digest matches and validator equality includes the digest.
- Scope impact: contract storage/ABI, frontend forms/readback, fixture, automated tests, deployment and downstream evidence. Prior live deployment and final release evidence are invalidated.
- Preserved product outcomes: one grant application, applicant-declared region/org type/submission time, freeze-before-assess workflow, `ELIGIBLE`, `NOT_ELIGIBLE`, `CRITERIA_MISSING`, `UNRESOLVED`, bounded retry, conditional-facts disclaimer, and no legal/funding guarantee.
- Affected tests/evidence: deadline before/on/after boundaries, missing IDs, canonical-source mismatch, HTTP `0/429/500/599`, retry recovery, duplicate application, authorization, validator consequence disagreement, schema extraction, and serialization/pickling.
- Residual risk: A live grant source must expose the documented JSON evidence shape over stable HTTPS. Arbitrary HTML or an unauthenticated dynamic page is not sufficient for this exact implementation; the UI must explain the evidence contract rather than imply general legal eligibility.

## Controlled Studio Next target migration (2026-09-20)

- Current choice: retain the authority repair, contract storage/ABI and decision logic, while moving the runtime adapter from the retired Studionet target to the governed Studio Next development preview.
- Official target: `studioDevnet` / `studio-dev`, RPC `https://studio-dev.genlayer.com/api`, chain `61997` (`0xf22d`), Explorer `https://explorer-studio-dev.genlayer.com/`. Studionet `61999` remains a separate historical network and is not a fallback for this candidate.
- Runtime replacement: frontend `genlayer-js==2.0.0-rc.1`, Studio Next CLI `0.40.0-rc.3`, Python `0.19.0rc2`, matching test/linter prereleases, and the selected CLI actor7 public address recorded in the PRE_DEPLOY package.
- Contract adapter correction: `import genlayer as gl`, `gl.contract.Contract`, the current `allow` storage decorator exposed through the linter-compatible alias `allow_storage`, and `gl.vm.run_nondet` replace retired spellings. The ABI, storage fields, source binding, independent validator consequence comparison and state transitions remain unchanged.
- Preserved scope: ABI, storage layout, nondeterministic source/equivalence mechanism, authorized-publisher trust boundary, fixture semantics, tests and readback assertions. The raw source bytes necessarily changed because the runtime adapter and dependency pin changed.
- Invalidated evidence: every 61999 account/balance/fee-readiness claim, old Studio RPC matrix/probe, deployment address/hash, receipt/consensus/readback, Studio E2E, Vercel plan binding and reviewer approval that depended on the old network. Historical hashes remain read-only diagnostics and are never resumed on 61997.
- Release boundary: this adaptation is not a deployment. The exact current source/package must pass the new PRE_DEPLOY review before one controlled Studio Next deployment; `writesSubmitted=0` remains the current state.
