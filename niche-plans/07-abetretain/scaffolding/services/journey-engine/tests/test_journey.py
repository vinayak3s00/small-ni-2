# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

from fastapi.testclient import TestClient

from journey import JourneyEngine
from app import app

client = TestClient(app)


def test_placed_event_emits_confirmation():
    e = JourneyEngine()
    msg = e.on_event("o1", "p1", "placed")
    assert msg is not None
    assert msg.step == "order_confirmation"
    assert "o1" in msg.body


def test_duplicate_event_is_idempotent():
    e = JourneyEngine()
    assert e.on_event("o1", "p1", "placed") is not None
    assert e.on_event("o1", "p1", "placed") is None  # duplicate suppressed
    assert len(e.messages_for("p1")) == 1


def test_full_lifecycle_emits_three_steps():
    e = JourneyEngine()
    e.on_event("o1", "p1", "placed")
    e.on_event("o1", "p1", "shipped")
    e.on_event("o1", "p1", "delivered")
    steps = [m.step for m in e.messages_for("p1")]
    assert steps == ["order_confirmation", "shipping_update", "delivery_followup"]


def test_silent_event_emits_nothing():
    e = JourneyEngine()
    assert e.on_event("o1", "p1", "payment_authorized") is None
    assert e.messages_for("p1") == []


def test_frequency_cap_suppresses_extra_messages():
    e = JourneyEngine(frequency_cap=2)
    e.on_event("o1", "p1", "placed")
    e.on_event("o1", "p1", "shipped")
    # Third distinct messaging event is capped.
    assert e.on_event("o1", "p1", "delivered") is None
    assert len(e.messages_for("p1")) == 2


def test_api_event_flow():
    r1 = client.post("/v1/journey/event", json={"orderId": "oX", "partyId": "pX", "eventType": "placed"})
    assert r1.json()["emitted"] is True
    r2 = client.post("/v1/journey/event", json={"orderId": "oX", "partyId": "pX", "eventType": "placed"})
    assert r2.json()["emitted"] is False  # idempotent
