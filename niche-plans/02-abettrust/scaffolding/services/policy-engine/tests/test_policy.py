# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

from fastapi.testclient import TestClient

from policy import Actor, evaluate, check_grounding
from app import app

client = TestClient(app)


def test_export_kyc_denied_without_compliance_role():
    d = evaluate(Actor("u1", ["sales"]), "export", "kyc_record")
    assert d.allow is False
    assert any("compliance_officer" in r for r in d.reasons)


def test_export_kyc_allowed_for_compliance_officer():
    d = evaluate(Actor("u2", ["compliance_officer"]), "export", "kyc_record")
    assert d.allow is True


def test_read_is_allowed_but_masks_restricted_fields():
    d = evaluate(Actor("u3", ["sales"]), "read", "party", ["name", "aadhaar_number"])
    assert d.allow is True
    assert d.masked_fields == ["aadhaar_number"]


def test_advisor_can_see_internal_notes():
    d = evaluate(Actor("u4", ["advisor"]), "read", "party", ["internal_risk_notes"])
    assert d.masked_fields == []


def test_grounding_blocks_uncited_output():
    result = check_grounding("The rate is 9%.", ["policy-doc-1"])
    assert result["passed"] is False
    assert result["citations"] == []


def test_grounding_passes_with_citation():
    result = check_grounding("The rate is 9% [policy-doc-1].", ["policy-doc-1"])
    assert result["passed"] is True
    assert result["citations"] == ["policy-doc-1"]


def test_api_evaluate_deny():
    resp = client.post(
        "/v1/policy/evaluate",
        json={"actor": {"sub": "u1", "roles": ["sales"]}, "action": "export", "resource": "kyc_record"},
    )
    assert resp.status_code == 200
    assert resp.json()["decision"] == "deny"
