import calendar
import hashlib
import json
import pytest

SPEC_ID = "authorized-grant-2027"
GRANT_URL = "https://grants.example.org/open.json"
DEADLINE = "2027-01-01T00:00:00Z"
DEADLINE_EPOCH = calendar.timegm((2027, 1, 1, 0, 0, 0))
OBSERVED_AT = DEADLINE_EPOCH - 100

def payload_dict(**overrides):
    value = {"allowed_org_types":["NONPROFIT","PUBLIC_BENEFIT"],"allowed_regions":["EU","US"],"canonical_url":GRANT_URL,"criterion_ids":{"deadline":"deadline-2027","org_type":"org-type-1","region":"region-1"},"deadline_utc":DEADLINE,"observed_at":OBSERVED_AT,"specification_id":SPEC_ID}
    value.update(overrides)
    return value

def canonical(value): return json.dumps(value, sort_keys=True, separators=(",", ":"))
def digest(value=None): return hashlib.sha256(canonical(value or payload_dict()).encode()).hexdigest()

def register(contract, expected_digest=None, spec_id=SPEC_ID):
    contract.register_grant_specification(spec_id, GRANT_URL, expected_digest or digest(), "region-1", "org-type-1", "deadline-2027", DEADLINE, DEADLINE_EPOCH - 1000, DEADLINE_EPOCH + 1000)

def create(contract, application_id, submitted_at=DEADLINE_EPOCH, freeze=True):
    contract.create_application(application_id, SPEC_ID, "US", "NONPROFIT", submitted_at)
    if freeze: contract.freeze_application(application_id)

def mock_source(vm, value=None, status=200):
    vm.mock_web(r"grants\.example\.org/open\.json", {"status":status,"body":canonical(value or payload_dict()) if status == 200 else ""})

def read(contract, application_id): return json.loads(contract.get_application(application_id))

def deployed_with_spec(direct_deploy):
    contract = direct_deploy("contracts/open_grant_eligibility_evidence_checker.py")
    register(contract)
    return contract

def test_deployer_is_the_only_recorded_upgrader_and_upgrade_is_authorized(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/open_grant_eligibility_evidence_checker.py")
    deployer = direct_vm.sender
    assert contract.get_upgrader().lower() == ("0x" + deployer.hex()).lower()

    root = __import__("genlayer", fromlist=["gl"]).gl.storage.Root.get()
    assert [str(value).lower() for value in root.upgraders.get()] == [contract.get_upgrader().lower()]

    original = bytes(root.code.get())
    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="only the recorded upgrader"):
        contract.upgrade(b"unauthorized-code")
    assert bytes(root.code.get()) == original

    direct_vm.sender = deployer
    contract.upgrade(b"compatible-v2")
    assert bytes(root.code.get()) == b"compatible-v2"

def test_authority_registry_and_immutable_specification(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/open_grant_eligibility_evidence_checker.py")
    owner = direct_vm.sender
    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="publisher is not authorized"): register(contract)
    with pytest.raises(Exception, match="only the contract owner"): contract.set_publisher_authorization("0x" + direct_bob.hex(), True)
    direct_vm.sender = owner
    contract.set_publisher_authorization("0x" + direct_alice.hex(), True)
    assert contract.is_authorized_publisher("0x" + direct_alice.hex()) is True
    direct_vm.sender = direct_alice
    register(contract)
    spec = json.loads(contract.get_grant_specification(SPEC_ID))
    assert spec["publisher"].lower() == "0x" + direct_alice.hex()
    assert spec["expected_evidence_digest"] == digest()
    with pytest.raises(Exception, match="already exists"): register(contract)
    direct_vm.sender = owner
    contract.set_publisher_authorization("0x" + direct_alice.hex(), False)
    assert contract.is_authorized_publisher("0x" + direct_alice.hex()) is False
    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="publisher is not authorized"): register(contract, spec_id="revoked-publisher-spec")

def test_application_references_bound_spec_and_applicant_cannot_change_terms(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/open_grant_eligibility_evidence_checker.py")
    publisher = direct_vm.sender
    register(contract)
    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="does not exist"): contract.create_application("unknown", "applicant-controlled", "US", "NONPROFIT", DEADLINE_EPOCH)
    contract.create_application("app-1", SPEC_ID, "US", "NONPROFIT", DEADLINE_EPOCH)
    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="only the applicant"): contract.freeze_application("app-1")
    direct_vm.sender = direct_alice
    contract.freeze_application("app-1")
    data = read(contract, "app-1")
    assert data["publisher"].lower() == "0x" + publisher.hex()
    assert data["grant_url"] == GRANT_URL and data["expected_evidence_digest"] == digest()
    assert data["deadline_utc"] == DEADLINE and data["state"] == "FROZEN"

def test_eligible_at_inclusive_deadline_and_not_eligible_after(direct_vm, direct_deploy):
    contract = deployed_with_spec(direct_deploy)
    direct_vm.check_pickling = True
    for app_id, timestamp in (("before",DEADLINE_EPOCH-1),("at",DEADLINE_EPOCH),("after",DEADLINE_EPOCH+1)): create(contract, app_id, timestamp)
    mock_source(direct_vm)
    for app_id in ("before","at","after"): contract.assess_application(app_id)
    assert read(contract,"before")["outcome"] == "ELIGIBLE"
    assert read(contract,"at")["matched_criteria"] == ["REGION","ORG_TYPE","DEADLINE"]
    assert read(contract,"after")["failed_criteria"] == ["DEADLINE"]

def test_evidence_digest_mismatch_fails_closed(direct_vm, direct_deploy):
    contract = direct_deploy("contracts/open_grant_eligibility_evidence_checker.py")
    register(contract, "0" * 64); create(contract, "digest-mismatch"); mock_source(direct_vm)
    contract.assess_application("digest-mismatch")
    result = read(contract,"digest-mismatch")
    assert result["outcome"] == "UNRESOLVED" and result["last_reason"] == "EVIDENCE_DIGEST_MISMATCH"
    assert result["failed_criteria"] == [] and result["evidence_digest"] == digest()

@pytest.mark.parametrize("change,reason", [({"canonical_url":"https://other.example.org/grant.json"},"SOURCE_IDENTITY_MISMATCH"),({"specification_id":"applicant-authored-spec"},"SPECIFICATION_IDENTITY_MISMATCH")])
def test_source_identity_mismatches_fail_closed(change, reason, direct_vm, direct_deploy):
    contract = deployed_with_spec(direct_deploy); create(contract, reason); mock_source(direct_vm, payload_dict(**change)); contract.assess_application(reason)
    result = read(contract,reason)
    assert result["outcome"] == "UNRESOLVED" and result["last_reason"] == reason

def test_missing_criteria_is_not_negative_eligibility(direct_vm, direct_deploy):
    value = payload_dict(); value["criterion_ids"].pop("deadline")
    contract = direct_deploy("contracts/open_grant_eligibility_evidence_checker.py"); register(contract, digest(value)); create(contract,"missing"); mock_source(direct_vm,value); contract.assess_application("missing")
    assert read(contract,"missing")["outcome"] == "CRITERIA_MISSING"

def test_publisher_bound_criteria_mismatch_fails_closed(direct_vm, direct_deploy):
    value = payload_dict(criterion_ids={"deadline":"deadline-2027","org_type":"org-type-1","region":"different-region"})
    contract = direct_deploy("contracts/open_grant_eligibility_evidence_checker.py"); register(contract,digest(value)); create(contract,"criteria-mismatch"); mock_source(direct_vm,value); contract.assess_application("criteria-mismatch")
    result = read(contract,"criteria-mismatch")
    assert result["outcome"] == "UNRESOLVED" and result["last_reason"] == "PUBLISHER_SPECIFICATION_MISMATCH"

@pytest.mark.parametrize("status", [0,429,500,599])
def test_transient_source_failures_are_retryable(status, direct_vm, direct_deploy):
    contract = deployed_with_spec(direct_deploy); create(contract,"unavailable"); mock_source(direct_vm,status=status); contract.assess_application("unavailable")
    result = read(contract,"unavailable")
    assert result["outcome"] == "UNRESOLVED" and result["last_reason"] == "SOURCE_UNAVAILABLE"

def test_nonexistent_malformed_oversized_and_stale_sources_fail_closed(direct_vm, direct_deploy):
    cases = [("missing-source",404,"","SOURCE_NOT_FOUND"),("malformed",200,"not-json","SOURCE_INVALID_OR_UNBOUND"),("oversized",200,"x" * 120001,"SOURCE_INVALID_OR_UNBOUND")]
    contract = deployed_with_spec(direct_deploy)
    for app_id, status, body, reason in cases:
        create(contract,app_id); direct_vm.clear_mocks(); direct_vm.mock_web(r"grants\.example\.org/open\.json",{"status":status,"body":body}); contract.assess_application(app_id)
        result = read(contract,app_id); assert result["outcome"] == "UNRESOLVED" and result["last_reason"] == reason
    stale = payload_dict(observed_at=DEADLINE_EPOCH + 1001)
    direct_vm.clear_mocks(); create(contract,"stale"); mock_source(direct_vm,stale); contract.assess_application("stale")
    # Digest identity fails before temporal interpretation, preventing changed publisher bytes from being trusted.
    assert read(contract,"stale")["last_reason"] == "EVIDENCE_DIGEST_MISMATCH"

def test_publisher_bound_observation_window_is_enforced(direct_vm, direct_deploy):
    stale = payload_dict(observed_at=DEADLINE_EPOCH + 1001)
    contract = direct_deploy("contracts/open_grant_eligibility_evidence_checker.py"); register(contract,digest(stale)); create(contract,"outside-window"); mock_source(direct_vm,stale); contract.assess_application("outside-window")
    result = read(contract,"outside-window")
    assert result["outcome"] == "UNRESOLVED" and result["last_reason"] == "OBSERVATION_OUTSIDE_WINDOW"

def test_retry_recovers_without_changing_bound_specification(direct_vm, direct_deploy):
    contract = deployed_with_spec(direct_deploy); create(contract,"retry"); mock_source(direct_vm,status=429); contract.assess_application("retry")
    direct_vm.clear_mocks(); mock_source(direct_vm); contract.retry_unresolved("retry")
    result = read(contract,"retry")
    assert result["outcome"] == "ELIGIBLE" and result["retry_count"] == 1 and result["expected_evidence_digest"] == digest()

def test_retry_cap_rejects_third_attempt(direct_vm, direct_deploy):
    contract = deployed_with_spec(direct_deploy); create(contract,"retry-cap"); mock_source(direct_vm,status=429); contract.assess_application("retry-cap")
    contract.retry_unresolved("retry-cap"); contract.retry_unresolved("retry-cap")
    with pytest.raises(Exception,match="retry limit reached"): contract.retry_unresolved("retry-cap")

def test_retry_requires_completed_unresolved_assessment(direct_deploy):
    contract = deployed_with_spec(direct_deploy); create(contract,"draft",freeze=False)
    with pytest.raises(Exception,match="not retryable"): contract.retry_unresolved("draft")

def test_transient_and_unknown_exception_boundaries(direct_vm, direct_deploy):
    contract = deployed_with_spec(direct_deploy); create(contract,"timeout"); create(contract,"unknown"); direct_vm.clear_mocks()
    direct_vm._live_web_handler = lambda _request: (_ for _ in ()).throw(TimeoutError("timed out")); contract.assess_application("timeout")
    assert read(contract,"timeout")["last_reason"] == "SOURCE_UNAVAILABLE"
    direct_vm._live_web_handler = lambda _request: (_ for _ in ()).throw(RuntimeError("network invariant failed"))
    try:
        with pytest.raises(Exception,match="network invariant failed"): contract.assess_application("unknown")
    finally: direct_vm._live_web_handler = None

def test_validator_rejects_digest_disagreement(direct_vm, direct_deploy):
    contract = deployed_with_spec(direct_deploy); create(contract,"validator"); mock_source(direct_vm); contract.assess_application("validator")
    direct_vm.clear_mocks(); mock_source(direct_vm,payload_dict(extra_nonconsequential_text="changed bytes"))
    assert direct_vm.run_validator() is False

def test_duplicate_application_and_invalid_digest_are_rejected(direct_deploy):
    contract = direct_deploy("contracts/open_grant_eligibility_evidence_checker.py")
    with pytest.raises(Exception,match="invalid evidence_digest"): register(contract,"not-a-digest")
    register(contract); contract.create_application("duplicate",SPEC_ID,"US","NONPROFIT",DEADLINE_EPOCH)
    with pytest.raises(Exception,match="already exists"): contract.create_application("duplicate",SPEC_ID,"US","NONPROFIT",DEADLINE_EPOCH)
