# Stage 1/2 implementation adaptation

## STAGE 1/2 IMPLEMENTATION ADAPTATION

- Original choice: `TreeMap[str, Application]` with three frozen criterion IDs, a UTC deadline, and observation bounds; assessment derives the outcome from the grant source.
- Verified problem/risk: Current GenLayer guidance requires every nondeterministic web access to run inside an equivalence pattern, and dynamic/raw evidence must not be compared as unconstrained prose. A product-sized LLM step would add no value because the approved criteria are three binary, explicitly identified facts.
- Authoritative evidence / probe: Official web-access and equivalence documentation checked 2026-08-30; exact candidate mechanism passed `genvm-lint check`, `genvm-lint schema`, and Direct Mode with pickling enabled using the installed `genlayer-test==0.29.2` and cached GenVM `v0.3.0-rc7`.
- Replacement: Use `gl.nondet.web.get()` inside `gl.vm.run_nondet_unsafe()`. Normalize a bounded JSON source into a JSON-string decision result, independently rederive outcome, matched/failed criteria, source observation time, and reason in the validator, and retain the leader's normalized source digest only as audit provenance. Require exact UTC `Z` timestamps and a source-declared `observed_at` inside the frozen observation window.
- Preserved product outcomes: one grant application, applicant-declared region/org type/submission time, freeze-before-assess workflow, `ELIGIBLE`, `NOT_ELIGIBLE`, `CRITERIA_MISSING`, `UNRESOLVED`, bounded retry, conditional-facts disclaimer, and no legal/funding guarantee.
- Affected tests/evidence: deadline before/on/after boundaries, missing IDs, canonical-source mismatch, HTTP `0/429/500/599`, retry recovery, duplicate application, authorization, validator consequence disagreement, schema extraction, and serialization/pickling.
- Residual risk: A live grant source must expose the documented JSON evidence shape over stable HTTPS. Arbitrary HTML or an unauthenticated dynamic page is not sufficient for this exact implementation; the UI must explain the evidence contract rather than imply general legal eligibility.
