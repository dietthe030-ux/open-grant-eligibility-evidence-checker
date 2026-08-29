import calendar
import json

import pytest


GRANT_URL = "https://grants.example.org/open.json"
DEADLINE = "2027-01-01T00:00:00Z"
DEADLINE_EPOCH = calendar.timegm((2027, 1, 1, 0, 0, 0))
OBSERVED_AT = DEADLINE_EPOCH - 100


def source_payload(**overrides):
    payload = {
        "allowed_org_types": ["NONPROFIT", "PUBLIC_BENEFIT"],
        "allowed_regions": ["EU", "US"],
        "canonical_url": GRANT_URL,
        "criterion_ids": {
            "deadline": "deadline-2027",
            "org_type": "org-type-1",
            "region": "region-1",
        },
        "deadline_utc": DEADLINE,
        "observed_at": OBSERVED_AT,
    }
    payload.update(overrides)
    return json.dumps(payload, separators=(",", ":"))


def freeze(contract, application_id):
    contract.freeze_application(
        application_id,
        "region-1",
        "org-type-1",
        "deadline-2027",
        DEADLINE,
        DEADLINE_EPOCH - 1_000,
        DEADLINE_EPOCH + 1_000,
    )


def create(contract, application_id, submitted_at=DEADLINE_EPOCH):
    contract.create_application(application_id, GRANT_URL, "US", "NONPROFIT", submitted_at)
    freeze(contract, application_id)


def mock_source(direct_vm, body, status=200):
    direct_vm.mock_web(r"grants\.example\.org/open\.json", {"status": status, "body": body})


def read(contract, application_id):
    return json.loads(contract.get_application(application_id))


def test_create_freeze_readback_and_authorization(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/open_grant_eligibility_evidence_checker.py")
    direct_vm.sender = direct_alice
    contract.create_application("app-1", GRANT_URL, "US", "NONPROFIT", DEADLINE_EPOCH)

    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="only the applicant can freeze"):
        freeze(contract, "app-1")

    direct_vm.sender = direct_alice
    freeze(contract, "app-1")
    data = read(contract, "app-1")
    assert data["state"] == "FROZEN"
    assert data["declared_facts_notice"] == "Applicant facts are self-declared and not independently verified."
    assert data["deadline_utc"] == DEADLINE
    assert data["outcome"] == "UNRESOLVED"


def test_eligible_at_inclusive_deadline_and_not_eligible_after(direct_vm, direct_deploy):
    contract = direct_deploy("contracts/open_grant_eligibility_evidence_checker.py")
    direct_vm.check_pickling = True
    create(contract, "before-deadline", DEADLINE_EPOCH - 1)
    create(contract, "at-deadline", DEADLINE_EPOCH)
    create(contract, "after-deadline", DEADLINE_EPOCH + 1)
    mock_source(direct_vm, source_payload())

    contract.assess_application("before-deadline")
    assert read(contract, "before-deadline")["outcome"] == "ELIGIBLE"

    contract.assess_application("at-deadline")
    assert read(contract, "at-deadline")["outcome"] == "ELIGIBLE"
    assert read(contract, "at-deadline")["matched_criteria"] == ["REGION", "ORG_TYPE", "DEADLINE"]

    contract.assess_application("after-deadline")
    after = read(contract, "after-deadline")
    assert after["outcome"] == "NOT_ELIGIBLE"
    assert after["failed_criteria"] == ["DEADLINE"]


def test_missing_criteria_is_not_a_negative_eligibility_result(direct_vm, direct_deploy):
    contract = direct_deploy("contracts/open_grant_eligibility_evidence_checker.py")
    create(contract, "missing-criteria")
    payload = json.loads(source_payload())
    payload["criterion_ids"].pop("deadline")
    mock_source(direct_vm, json.dumps(payload))

    contract.assess_application("missing-criteria")
    result = read(contract, "missing-criteria")
    assert result["outcome"] == "CRITERIA_MISSING"
    assert result["failed_criteria"] == []


def test_unavailable_source_is_retryable_and_recovers(direct_vm, direct_deploy):
    contract = direct_deploy("contracts/open_grant_eligibility_evidence_checker.py")
    create(contract, "retry-me")
    mock_source(direct_vm, "", status=429)
    contract.assess_application("retry-me")
    assert read(contract, "retry-me")["outcome"] == "UNRESOLVED"

    direct_vm.clear_mocks()
    mock_source(direct_vm, source_payload())
    contract.retry_unresolved("retry-me")
    result = read(contract, "retry-me")
    assert result["outcome"] == "ELIGIBLE"
    assert result["retry_count"] == 1


@pytest.mark.parametrize("status", [0, 429, 500, 599])
def test_transient_source_failures_are_unresolved(status, direct_vm, direct_deploy):
    contract = direct_deploy("contracts/open_grant_eligibility_evidence_checker.py")
    create(contract, "unavailable")
    mock_source(direct_vm, "", status=status)

    contract.assess_application("unavailable")
    result = read(contract, "unavailable")
    assert result["outcome"] == "UNRESOLVED"
    assert result["last_reason"] == "SOURCE_UNAVAILABLE"


def test_source_identity_mismatch_is_unresolved(direct_vm, direct_deploy):
    contract = direct_deploy("contracts/open_grant_eligibility_evidence_checker.py")
    create(contract, "wrong-source")
    payload = json.loads(source_payload())
    payload["canonical_url"] = "https://other.example.org/grant.json"
    mock_source(direct_vm, json.dumps(payload))

    contract.assess_application("wrong-source")
    assert read(contract, "wrong-source")["last_reason"] == "SOURCE_INVALID_OR_UNBOUND"


def test_validator_rejects_changed_consequence(direct_vm, direct_deploy):
    contract = direct_deploy("contracts/open_grant_eligibility_evidence_checker.py")
    create(contract, "validator-check")
    mock_source(direct_vm, source_payload())
    contract.assess_application("validator-check")

    direct_vm.clear_mocks()
    changed = json.loads(source_payload())
    changed["allowed_regions"] = ["EU"]
    mock_source(direct_vm, json.dumps(changed))
    assert direct_vm.run_validator() is False


def test_duplicate_application_is_rejected(direct_deploy):
    contract = direct_deploy("contracts/open_grant_eligibility_evidence_checker.py")
    contract.create_application("duplicate", GRANT_URL, "US", "NONPROFIT", DEADLINE_EPOCH)
    with pytest.raises(Exception, match="application already exists"):
        contract.create_application("duplicate", GRANT_URL, "US", "NONPROFIT", DEADLINE_EPOCH)
