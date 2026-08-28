# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

from app import app
from fastapi.testclient import TestClient
from support import Order, Policy, resolve

client = TestClient(app)


def test_wismo_shipped_is_resolved_with_citation():
    r = resolve("wismo", Order("o1", "shipped", tracking="http://track/o1"))
    assert r.resolved is True
    assert r.citations == ["tracking"]
    assert "track" in r.reply.lower()


def test_wismo_placed_cites_fulfilment():
    r = resolve("wismo", Order("o1", "placed"))
    assert r.resolved is True
    assert r.citations == ["fulfilment"]


def test_wismo_cancelled_escalates():
    r = resolve("wismo", Order("o1", "cancelled"))
    assert r.escalated is True
    assert "no trackable status" in (r.escalation_reason or "")


def test_return_within_window_resolves():
    r = resolve("return", Order("o1", "delivered", days_since_delivery=3), Policy(return_window_days=7))
    assert r.resolved is True
    assert r.citations == ["returns_policy"]


def test_return_outside_window_escalates():
    r = resolve("return", Order("o1", "delivered", days_since_delivery=30), Policy(return_window_days=7))
    assert r.escalated is True
    assert "window exceeded" in (r.escalation_reason or "")


def test_return_on_undelivered_escalates():
    r = resolve("exchange", Order("o1", "shipped"))
    assert r.escalated is True


def test_unsupported_intent_escalates():
    r = resolve("cancel_subscription", Order("o1", "delivered", days_since_delivery=1))
    assert r.escalated is True
    assert "unsupported intent" in (r.escalation_reason or "")


def test_api_resolve_wismo():
    resp = client.post(
        "/v1/support/resolve",
        json={"intent": "wismo", "orderId": "o1", "status": "shipped", "tracking": "http://t/o1"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["resolved"] is True
    assert body["citations"] == ["tracking"]
