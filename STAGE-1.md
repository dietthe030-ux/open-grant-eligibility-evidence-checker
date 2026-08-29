# Stage 1 — Open Grant Eligibility Evidence Checker

Trust problem: grant criteria involving region, organization type and deadline are interpreted inconsistently; an applicant cannot be the sole eligibility authority. Actors: applicant, publisher, assessor, validators, reader. Workflow: bind grant URL and bounded applicant facts -> freeze -> assess -> `ELIGIBLE`, `NOT_ELIGIBLE`, `CRITERIA_MISSING`, or `UNRESOLVED`. No legal or funding guarantee. Closest projects: `grant-review-recusal-graph`, `federal-award-scope-drift`, `charity-program-claim-ledger`; this has one application and no recusal/spending graph. Evidence: criteria IDs, source digest, timestamp, tx/readback. Risk: overclaim; UI must say evidence signal.

## Revision 2 — constrained trust scope

The product evaluates only three explicit binary criteria carrying canonical IDs: allowed region, allowed organization type, and published deadline. Discretionary prose never produces `ELIGIBLE`; ambiguity/missing IDs yields `CRITERIA_MISSING` or `UNRESOLVED`. Applicant facts are self-declared and the result is explicitly “conditional on declared facts,” not identity/fact authentication. Deadline is UTC, ISO-8601, inclusive through the exact published instant; source retrieval must occur inside the frozen observation window.
