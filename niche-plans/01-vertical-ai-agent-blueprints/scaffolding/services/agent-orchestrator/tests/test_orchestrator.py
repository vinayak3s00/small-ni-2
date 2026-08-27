# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

from fastapi.testclient import TestClient

from orchestrator import Source, answer
from app import app

client = TestClient(app)

SOURCES = [
    Source("brochure-1", "The Green Acres project offers 2BHK and 3BHK ready-to-move flats."),
    Source("finance-1", "Home loans up to 80% are available through partner banks."),
    Source("care-faq-1", "Appointment booking is available from 9am to 6pm on weekdays."),
]


def test_grounded_answer_has_citations():
    r = answer("realty", "Do you have 3BHK ready-to-move flats?", SOURCES)
    assert r.escalated is False
    assert "brochure-1" in r.citations
    assert "[brochure-1]" in r.reply


def test_ungrounded_query_escalates():
    r = answer("realty", "What is the capital of France?", SOURCES)
    assert r.escalated is True
    assert "no approved source" in (r.escalation_reason or "")
    assert r.summary is not None


def test_care_guardrail_blocks_clinical_advice():
    r = answer("care", "What dosage of medicine should I take?", SOURCES)
    assert r.escalated is True
    assert "guarded intent" in (r.escalation_reason or "")
    # Guardrail must fire BEFORE any grounded answer is composed.
    assert r.citations == []


def test_care_non_clinical_is_answered():
    r = answer("care", "What are your appointment booking hours?", SOURCES)
    assert r.escalated is False
    assert "care-faq-1" in r.citations


def test_summary_includes_recent_turns():
    r = answer(
        "realty",
        "Tell me about the moon.",
        SOURCES,
        conversation=["Hi", "I want a flat", "Near the metro"],
    )
    assert r.escalated is True
    assert "Near the metro" in (r.summary or "")


def test_api_answer_endpoint():
    resp = client.post(
        "/v1/agent/answer",
        json={
            "vertical": "realty",
            "query": "3BHK ready-to-move flats?",
            "sources": [{"id": "brochure-1", "text": "Green Acres has 3BHK ready-to-move flats."}],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["escalated"] is False
    assert body["citations"] == ["brochure-1"]
