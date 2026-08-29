# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from dataclasses import dataclass
import calendar
import datetime
import hashlib
import json
import re

from genlayer import *


STATES = ("DRAFT", "FROZEN", "ASSESSED")
OUTCOMES = ("UNRESOLVED", "CRITERIA_MISSING", "ELIGIBLE", "NOT_ELIGIBLE")
CRITERIA = ("REGION", "ORG_TYPE", "DEADLINE")
DECLARED_FACTS_NOTICE = "Applicant facts are self-declared and not independently verified."
MAX_ID = 96
MAX_TEXT = 128
MAX_URL = 2048
MAX_SOURCE = 120_000
UTC_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


@allow_storage
@dataclass
class Application:
    owner: Address
    grant_url: str
    region: str
    org_type: str
    submitted_at: u64
    declared_facts_notice: str
    region_criterion_id: str
    org_type_criterion_id: str
    deadline_criterion_id: str
    deadline_utc: str
    observation_not_before: u64
    observation_not_after: u64
    state: str
    outcome: str
    matched_criteria: str
    failed_criteria: str
    evidence_digest: str
    source_observed_at: u64
    last_reason: str
    retry_count: u8


def _fail(message: str) -> None:
    raise gl.vm.UserError(message)


def _text(value: str, label: str, limit: u256) -> str:
    normalized = str(value).strip()
    if not normalized or len(normalized) > limit:
        _fail("invalid " + label)
    return normalized


def _url(value: str) -> str:
    normalized = _text(value, "grant_url", MAX_URL)
    if not normalized.startswith("https://") or any(char.isspace() for char in normalized):
        _fail("grant_url must be an https URL")
    return normalized


def _utc(value: str, label: str) -> str:
    normalized = _text(value, label, 20)
    if not UTC_RE.match(normalized):
        _fail("invalid " + label)
    try:
        datetime.datetime.strptime(normalized, "%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        _fail("invalid " + label)
    return normalized


def _epoch(utc_text: str) -> u64:
    parsed = datetime.datetime.strptime(utc_text, "%Y-%m-%dT%H:%M:%SZ")
    return calendar.timegm(parsed.utctimetuple())


def _body(response) -> str:
    raw = response.body
    text = raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)
    if len(text) > MAX_SOURCE:
        raise ValueError("source body too large")
    return text


def _string_list(value, label: str) -> list:
    if not isinstance(value, list) or not value or len(value) > 32:
        raise ValueError("invalid " + label)
    values = []
    for item in value:
        if not isinstance(item, str):
            raise ValueError("invalid " + label)
        item = _text(item, label, MAX_TEXT)
        if item in values:
            raise ValueError("duplicate " + label)
        values.append(item)
    return sorted(values)


def _source_payload(response, expected_url: str) -> dict:
    if int(response.status) != 200:
        raise ValueError("source is not available")
    body = _body(response)
    payload = json.loads(body)
    if not isinstance(payload, dict):
        raise ValueError("source must be an object")
    if payload.get("canonical_url") != expected_url:
        raise ValueError("source URL does not match the frozen grant")
    observed_at = payload.get("observed_at")
    if isinstance(observed_at, bool) or not isinstance(observed_at, int):
        raise ValueError("invalid source observation time")
    criteria = payload.get("criterion_ids")
    if not isinstance(criteria, dict):
        raise KeyError("criterion IDs are missing")
    region_id = criteria.get("region")
    org_type_id = criteria.get("org_type")
    deadline_id = criteria.get("deadline")
    if not all(isinstance(item, str) and item for item in (region_id, org_type_id, deadline_id)):
        raise KeyError("criterion IDs are missing")
    deadline_utc = payload.get("deadline_utc")
    if not isinstance(deadline_utc, str):
        raise KeyError("deadline is missing")
    deadline_utc = _utc(deadline_utc, "source deadline_utc")
    regions = _string_list(payload.get("allowed_regions"), "allowed_regions")
    org_types = _string_list(payload.get("allowed_org_types"), "allowed_org_types")
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return {
        "observed_at": observed_at,
        "region_id": _text(region_id, "source region criterion", MAX_ID),
        "org_type_id": _text(org_type_id, "source org_type criterion", MAX_ID),
        "deadline_id": _text(deadline_id, "source deadline criterion", MAX_ID),
        "deadline_utc": deadline_utc,
        "allowed_regions": regions,
        "allowed_org_types": org_types,
        "digest": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
    }


def _result(outcome: str, matched: list, failed: list, digest: str, observed_at: u64, reason: str) -> str:
    return json.dumps(
        {
            "outcome": outcome,
            "matched_criteria": matched,
            "failed_criteria": failed,
            "evidence_digest": digest,
            "source_observed_at": observed_at,
            "reason": reason,
        },
        sort_keys=True,
        separators=(",", ":"),
    )


def _evaluate(
    grant_url: str,
    region: str,
    org_type: str,
    submitted_at: u64,
    region_criterion_id: str,
    org_type_criterion_id: str,
    deadline_criterion_id: str,
    deadline_utc: str,
    observation_not_before: u64,
    observation_not_after: u64,
) -> str:
    response = gl.nondet.web.get(grant_url)
    status = int(response.status)
    if status != 200:
        if status == 0 or status == 429 or 500 <= status <= 599:
            return _result("UNRESOLVED", [], [], "", 0, "SOURCE_UNAVAILABLE")
        return _result("UNRESOLVED", [], [], "", 0, "SOURCE_NOT_FOUND")
    try:
        source = _source_payload(response, grant_url)
    except KeyError:
        return _result("CRITERIA_MISSING", [], [], "", 0, "CRITERIA_MISSING")
    except Exception:
        return _result("UNRESOLVED", [], [], "", 0, "SOURCE_INVALID_OR_UNBOUND")

    if not (observation_not_before <= source["observed_at"] <= observation_not_after):
        return _result("UNRESOLVED", [], [], source["digest"], source["observed_at"], "OBSERVATION_OUTSIDE_WINDOW")
    if (
        source["region_id"] != region_criterion_id
        or source["org_type_id"] != org_type_criterion_id
        or source["deadline_id"] != deadline_criterion_id
        or source["deadline_utc"] != deadline_utc
    ):
        return _result("UNRESOLVED", [], [], source["digest"], source["observed_at"], "FROZEN_CRITERIA_MISMATCH")

    region_ok = region in source["allowed_regions"]
    org_type_ok = org_type in source["allowed_org_types"]
    deadline_ok = submitted_at <= _epoch(source["deadline_utc"])
    matched = []
    failed = []
    for criterion, passed in (("REGION", region_ok), ("ORG_TYPE", org_type_ok), ("DEADLINE", deadline_ok)):
        (matched if passed else failed).append(criterion)
    outcome = "ELIGIBLE" if not failed else "NOT_ELIGIBLE"
    return _result(outcome, matched, failed, source["digest"], source["observed_at"], "" if not failed else "DECLARED_FACTS_DO_NOT_MATCH")


def _same_consequence(leader_json: str, validator_json: str) -> bool:
    leader = json.loads(leader_json)
    validator = json.loads(validator_json)
    if not isinstance(leader, dict) or not isinstance(validator, dict):
        return False
    return all(leader.get(key) == validator.get(key) for key in ("outcome", "matched_criteria", "failed_criteria", "source_observed_at", "reason"))


class OpenGrantEligibilityEvidenceChecker(gl.Contract):
    applications: TreeMap[str, Application]
    application_count: u32

    def __init__(self):
        self.application_count = 0

    @gl.public.write
    def create_application(self, application_id: str, grant_url: str, region: str, org_type: str, submitted_at: u64) -> None:
        application_id = _text(application_id, "application_id", MAX_ID)
        grant_url = _url(grant_url)
        region = _text(region, "region", MAX_TEXT)
        org_type = _text(org_type, "org_type", MAX_TEXT)
        if application_id in self.applications:
            _fail("application already exists")
        self.applications[application_id] = Application(
            gl.message.sender_address,
            grant_url,
            region,
            org_type,
            submitted_at,
            DECLARED_FACTS_NOTICE,
            "",
            "",
            "",
            "",
            0,
            0,
            "DRAFT",
            "UNRESOLVED",
            "[]",
            "[]",
            "",
            0,
            "",
            0,
        )
        self.application_count = self.application_count + 1

    @gl.public.write
    def freeze_application(
        self,
        application_id: str,
        region_criterion_id: str,
        org_type_criterion_id: str,
        deadline_criterion_id: str,
        deadline_utc: str,
        observation_not_before: u64,
        observation_not_after: u64,
    ) -> None:
        record = self.applications[application_id]
        if gl.message.sender_address != record.owner:
            _fail("only the applicant can freeze")
        if record.state != "DRAFT":
            _fail("application is not draft")
        if observation_not_before > observation_not_after:
            _fail("invalid observation window")
        record.region_criterion_id = _text(region_criterion_id, "region_criterion_id", MAX_ID)
        record.org_type_criterion_id = _text(org_type_criterion_id, "org_type_criterion_id", MAX_ID)
        record.deadline_criterion_id = _text(deadline_criterion_id, "deadline_criterion_id", MAX_ID)
        record.deadline_utc = _utc(deadline_utc, "deadline_utc")
        record.observation_not_before = observation_not_before
        record.observation_not_after = observation_not_after
        record.state = "FROZEN"

    def _assess_application(self, application_id: str) -> None:
        record = self.applications[application_id]
        grant_url = str(record.grant_url)
        region = str(record.region)
        org_type = str(record.org_type)
        submitted_at = int(record.submitted_at)
        region_criterion_id = str(record.region_criterion_id)
        org_type_criterion_id = str(record.org_type_criterion_id)
        deadline_criterion_id = str(record.deadline_criterion_id)
        deadline_utc = str(record.deadline_utc)
        observation_not_before = int(record.observation_not_before)
        observation_not_after = int(record.observation_not_after)

        def leader_fn():
            return _evaluate(
                grant_url,
                region,
                org_type,
                submitted_at,
                region_criterion_id,
                org_type_criterion_id,
                deadline_criterion_id,
                deadline_utc,
                observation_not_before,
                observation_not_after,
            )

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return) or not isinstance(leader_result.calldata, str):
                return False
            try:
                validator_result = _evaluate(
                    grant_url,
                    region,
                    org_type,
                    submitted_at,
                    region_criterion_id,
                    org_type_criterion_id,
                    deadline_criterion_id,
                    deadline_utc,
                    observation_not_before,
                    observation_not_after,
                )
                return _same_consequence(leader_result.calldata, validator_result)
            except Exception:
                return False

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        if not isinstance(result, str):
            _fail("invalid consensus result")
        data = json.loads(result)
        if not isinstance(data, dict) or data.get("outcome") not in OUTCOMES:
            _fail("invalid consensus result")
        record.outcome = str(data["outcome"])
        record.matched_criteria = json.dumps(data.get("matched_criteria", []), separators=(",", ":"))
        record.failed_criteria = json.dumps(data.get("failed_criteria", []), separators=(",", ":"))
        record.evidence_digest = str(data.get("evidence_digest", ""))
        record.source_observed_at = data.get("source_observed_at", 0)
        record.last_reason = str(data.get("reason", ""))
        record.state = "ASSESSED"

    @gl.public.write
    def assess_application(self, application_id: str) -> None:
        record = self.applications[application_id]
        if record.state != "FROZEN":
            _fail("application is not assessable")
        self._assess_application(application_id)

    @gl.public.write
    def retry_unresolved(self, application_id: str) -> None:
        record = self.applications[application_id]
        if record.outcome != "UNRESOLVED":
            _fail("application is not unresolved")
        if record.retry_count >= 2:
            _fail("retry limit reached")
        record.retry_count = record.retry_count + 1
        self._assess_application(application_id)

    def _application_json(self, record: Application, result_only: bool) -> str:
        data = {
            "state": str(record.state),
            "outcome": str(record.outcome),
            "matched_criteria": json.loads(record.matched_criteria),
            "failed_criteria": json.loads(record.failed_criteria),
            "evidence_digest": str(record.evidence_digest),
            "source_observed_at": int(record.source_observed_at),
            "last_reason": str(record.last_reason),
            "retry_count": int(record.retry_count),
        }
        if not result_only:
            data.update(
                {
                    "owner": str(record.owner),
                    "grant_url": str(record.grant_url),
                    "region": str(record.region),
                    "org_type": str(record.org_type),
                    "submitted_at": int(record.submitted_at),
                    "declared_facts_notice": str(record.declared_facts_notice),
                    "region_criterion_id": str(record.region_criterion_id),
                    "org_type_criterion_id": str(record.org_type_criterion_id),
                    "deadline_criterion_id": str(record.deadline_criterion_id),
                    "deadline_utc": str(record.deadline_utc),
                    "observation_not_before": int(record.observation_not_before),
                    "observation_not_after": int(record.observation_not_after),
                }
            )
        return json.dumps(data, sort_keys=True, separators=(",", ":"))

    @gl.public.view
    def get_application(self, application_id: str) -> str:
        return self._application_json(self.applications[application_id], False)

    @gl.public.view
    def get_result(self, application_id: str) -> str:
        return self._application_json(self.applications[application_id], True)

    @gl.public.view
    def get_application_count(self) -> u32:
        return self.application_count
