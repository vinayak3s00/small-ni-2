# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

from app import app
from commerce import classify, handle
from fastapi.testclient import TestClient
from identity import IdentityGraph, normalize_handle

client = TestClient(app)


def test_normalize_phone_to_e164():
    assert normalize_handle("whatsapp", "98000 12345") == "+919800012345"
    assert normalize_handle("voice", "+919800012345") == "+919800012345"


def test_normalize_email_and_instagram():
    assert normalize_handle("email", "Asha@Example.COM") == "asha@example.com"
    assert normalize_handle("instagram", "@AshaShops") == "ashashops"


def test_same_phone_resolves_to_one_party():
    g = IdentityGraph()
    p1 = g.resolve("t1", "whatsapp", "9800012345")
    p2 = g.resolve("t1", "whatsapp", "+91 98000 12345")
    assert p1.id == p2.id
    assert g.party_count() == 1


def test_different_tenants_are_isolated():
    g = IdentityGraph()
    a = g.resolve("t1", "whatsapp", "9800012345")
    b = g.resolve("t2", "whatsapp", "9800012345")
    assert a.id != b.id
    assert g.party_count() == 2


def test_linking_channels_unifies_into_one_party():
    g = IdentityGraph()
    wa = g.resolve("t1", "whatsapp", "9800012345")
    # Same person emails in separately -> gets a distinct party first.
    em = g.resolve("t1", "email", "asha@example.com")
    assert em is not wa
    assert g.party_count() == 2
    # Link the email identity to the WhatsApp party -> merge into one.
    g.link("t1", wa, "email", "asha@example.com")
    assert g.party_count() == 1
    channels = {i.channel for i in wa.identities}
    assert channels == {"whatsapp", "email"}


def test_intent_classification_priority():
    assert classify("I want to speak to a human") == "handoff"
    assert classify("my order is broken, I need a refund") == "support"
    assert classify("where is my order") == "order_status"
    assert classify("how much is the kurta") == "price_quote"
    assert classify("hello") == "greeting"


def test_handle_routes_support_and_handoff():
    assert handle("agent please").requires_human is True
    assert handle("I need a refund").action == "open_support_ticket"
    assert handle("how much?").action == "build_quote"


def test_api_inbound_resolves_party_and_intent():
    resp = client.post(
        "/v1/inbound",
        json={"tenantId": "t1", "channel": "whatsapp", "handle": "9800012345", "body": "how much is it"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["intent"] == "price_quote"
    assert body["partyId"]
