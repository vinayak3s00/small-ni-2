# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

import pytest
from fastapi.testclient import TestClient

from reconcile import CutoverBlocked, assert_cutover_allowed, reconcile
from app import app

client = TestClient(app)

SRC = {
    "a@x.com": {"name": "Asha", "amount_minor": 10050},
    "r@x.com": {"name": "Ravi", "amount_minor": 0},
}


def test_perfect_match_passes_and_allows_cutover():
    report = reconcile(SRC, dict(SRC), ["name", "amount_minor"])
    assert report.passed is True
    assert report.accuracy == 1.0
    assert_cutover_allowed(report)  # does not raise


def test_count_mismatch_blocks_cutover():
    target = {"a@x.com": SRC["a@x.com"]}  # missing r@x.com
    report = reconcile(SRC, target, ["name"])
    assert report.passed is False
    with pytest.raises(CutoverBlocked):
        assert_cutover_allowed(report)


def test_field_mismatch_lowers_accuracy_and_blocks():
    target = {
        "a@x.com": {"name": "Asha", "amount_minor": 999},  # wrong amount
        "r@x.com": {"name": "Ravi", "amount_minor": 0},
    }
    report = reconcile(SRC, target, ["name", "amount_minor"])
    assert report.accuracy < 1.0
    with pytest.raises(CutoverBlocked):
        assert_cutover_allowed(report)


def test_threshold_allows_minor_drift():
    target = {
        "a@x.com": {"name": "Asha", "amount_minor": 999},
        "r@x.com": {"name": "Ravi", "amount_minor": 0},
    }
    # 3 of 4 field comparisons correct => 0.75 accuracy.
    report = reconcile(SRC, target, ["name", "amount_minor"], threshold=0.75)
    assert report.accuracy == 0.75
    # count parity still holds, so with a relaxed threshold cutover is allowed.
    assert report.passed is True
    assert_cutover_allowed(report)


def test_api_blocks_and_reports_reason():
    resp = client.post(
        "/v1/reconcile",
        json={
            "source": {"a": {"v": 1}, "b": {"v": 2}},
            "target": {"a": {"v": 1}},
            "compareFields": ["v"],
            "threshold": 1.0,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["cutoverAllowed"] is False
    assert "record_count" in body["blockReason"]
