# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

from app import app
from fastapi.testclient import TestClient
from scoring import ScoringPack, score_record

client = TestClient(app)

REALTY = ScoringPack.from_manifest(
    {
        "vertical": "realty",
        "scoring": {
            "signals": {
                "ready_to_move_budget_match": 30,
                "site_visit_intent": 25,
                "verified_phone": 15,
                "financing_ready": 10,
            }
        },
    }
)


def test_score_sums_fired_signals_and_orders_reasons():
    result = score_record(
        REALTY,
        {
            "ready_to_move_budget_match": True,
            "site_visit_intent": True,
            "verified_phone": True,
            "financing_ready": False,
        },
    )
    assert result.score == 70
    # highest-contributing reason first
    assert result.reasons[0] == "ready to move budget match"
    assert "financing ready" not in result.reasons


def test_score_is_capped_at_100():
    pack = ScoringPack.from_manifest(
        {"vertical": "x", "scoring": {"signals": {"a": 80, "b": 80}}}
    )
    assert score_record(pack, {"a": True, "b": True}).score == 100


def test_unknown_signals_are_ignored():
    result = score_record(REALTY, {"not_a_signal": True})
    assert result.score == 0
    assert result.reasons == []


def test_api_scores_realty():
    resp = client.post(
        "/v1/score",
        json={"vertical": "realty", "signals": {"site_visit_intent": True, "verified_phone": True}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["score"] == 40
    assert "refreshedAt" in body


def test_api_unknown_vertical_404():
    resp = client.post("/v1/score", json={"vertical": "nope", "signals": {}})
    assert resp.status_code == 404


def test_score_emits_ai_actions_meter_with_tenant():
    from abet_meter import InMemoryMeterSink, MeterEmitter

    sink = InMemoryMeterSink()
    app.state.meter = MeterEmitter(service="scoring-svc", sink=sink)
    try:
        resp = client.post(
            "/v1/score",
            json={"vertical": "realty", "signals": {"verified_phone": True}, "eventId": "rec-1"},
            headers={"X-Tenant-Id": "tenant-s"},
        )
        assert resp.status_code == 200
        assert len(sink.events) == 1
        assert sink.events[0]["meter"] == "ai_actions"
        assert sink.events[0]["tenantId"] == "tenant-s"
        assert sink.events[0]["eventId"] == "rec-1"
        assert sink.events[0]["service"] == "scoring-svc"
    finally:
        app.state.meter = MeterEmitter(service="scoring-svc")


def test_no_tenant_header_does_not_bill():
    from abet_meter import InMemoryMeterSink, MeterEmitter

    sink = InMemoryMeterSink()
    app.state.meter = MeterEmitter(service="scoring-svc", sink=sink)
    try:
        resp = client.post("/v1/score", json={"vertical": "realty", "signals": {}})
        assert resp.status_code == 200
        assert sink.events == []  # no tenant => nothing billable
    finally:
        app.state.meter = MeterEmitter(service="scoring-svc")


def test_unknown_vertical_does_not_bill():
    from abet_meter import InMemoryMeterSink, MeterEmitter

    sink = InMemoryMeterSink()
    app.state.meter = MeterEmitter(service="scoring-svc", sink=sink)
    try:
        resp = client.post(
            "/v1/score",
            json={"vertical": "nope", "signals": {}},
            headers={"X-Tenant-Id": "tenant-s"},
        )
        assert resp.status_code == 404
        assert sink.events == []  # failed score not billed
    finally:
        app.state.meter = MeterEmitter(service="scoring-svc")
