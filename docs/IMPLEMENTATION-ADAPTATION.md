# Stage 1/2 implementation adaptation

## STAGE 1/2 IMPLEMENTATION ADAPTATION

- Original choice: `TreeMap[str, Application]` with three frozen criterion IDs, a UTC deadline, and observation bounds; assessment derives the outcome from the grant source.
- Verified problem/risk: Current GenLayer guidance requires every nondeterministic web access to run inside an equivalence pattern, and dynamic/raw evidence must not be compared as unconstrained prose. A product-sized LLM step would add no value because the approved criteria are three binary, explicitly identified facts.
- Authoritative evidence / probe: Official web-access and equivalence documentation checked 2026-08-30; exact candidate mechanism passed `genvm-lint check`, `genvm-lint schema`, and Direct Mode with pickling enabled using the installed `genlayer-test==0.29.2` and cached GenVM `v0.3.0-rc7`.
- Historical replacement at the initial build: use `gl.nondet.web.get()` inside `gl.vm.run_nondet_unsafe()`, normalize a bounded JSON source, and independently rederive the consequence. Its audit-only digest treatment and applicant-selected source are superseded by the authority correction below.

## Steward-requested authority correction (2026-09-07)

- Superseded choice: the applicant supplied `grant_url`, criterion IDs, deadline, and observation bounds.
- Verified defect: independent fetching does not establish source authority when the applicant can choose or author that source.
- Replacement: the contract owner manages an authorized-publisher registry. Only an authorized publisher can create an immutable grant specification binding its address, canonical source URL, expected canonical JSON SHA-256, criterion IDs, deadline, and observation window. Applicants can only reference a registered specification and provide self-declared facts. Assessment requires exact URL, specification ID, and digest matches and validator equality includes the digest.
- Scope impact: contract storage/ABI, frontend forms/readback, fixture, automated tests, deployment and downstream evidence. Prior live deployment and final release evidence are invalidated.
- Preserved product outcomes: one grant application, applicant-declared region/org type/submission time, freeze-before-assess workflow, `ELIGIBLE`, `NOT_ELIGIBLE`, `CRITERIA_MISSING`, `UNRESOLVED`, bounded retry, conditional-facts disclaimer, and no legal/funding guarantee.
- Affected tests/evidence: deadline before/on/after boundaries, missing IDs, canonical-source mismatch, HTTP `0/429/500/599`, retry recovery, duplicate application, authorization, validator consequence disagreement, schema extraction, and serialization/pickling.
- Residual risk: A live grant source must expose the documented JSON evidence shape over stable HTTPS. Arbitrary HTML or an unauthenticated dynamic page is not sufficient for this exact implementation; the UI must explain the evidence contract rather than imply general legal eligibility.
