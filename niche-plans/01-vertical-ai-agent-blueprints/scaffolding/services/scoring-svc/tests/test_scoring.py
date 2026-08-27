from fastapi.testclient import TestClient

from scoring import ScoringPack, score_record
from app import app

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
