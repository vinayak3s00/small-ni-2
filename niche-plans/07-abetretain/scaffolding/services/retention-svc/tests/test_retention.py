# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

from retention import (
    CommerceStore,
    FrequencyLedger,
    OrderEvent,
    score_retention,
)


def ev(order_id, party="p1", etype="placed", total=10000):
    return OrderEvent(order_id, party, etype, total, "2026-06-01T00:00:00Z")


def test_ingest_is_idempotent_on_order_and_event_type():
    store = CommerceStore()
    assert store.ingest(ev("o1", etype="placed")) is True
    # Duplicate webhook delivery of the same event is ignored.
    assert store.ingest(ev("o1", etype="placed")) is False
    # A different event type for the same order IS applied.
    assert store.ingest(ev("o1", etype="shipped")) is True
    assert len(store.events) == 2


def test_ltv_sums_placed_orders_only():
    store = CommerceStore()
    store.ingest(ev("o1", total=10000))
    store.ingest(ev("o1", etype="shipped", total=99999))  # not a purchase
    store.ingest(ev("o2", total=25000))
    score = score_retention(store.orders_for("p1"), days_since_last=10)
    assert score.ltv_minor == 35000


def test_churn_high_when_no_orders():
    score = score_retention([], days_since_last=5)
    assert score.churn_risk == "high"
    assert "no completed purchases" in score.reasons


def test_churn_high_when_dormant():
    score = score_retention([ev("o1")], days_since_last=200)
    assert score.churn_risk == "high"


def test_loyalty_offsets_moderate_recency():
    orders = [ev(f"o{i}") for i in range(5)]
    score = score_retention(orders, days_since_last=120)  # medium recency
    assert score.churn_risk == "low"
    assert "loyal repeat buyer" in score.reasons


def test_frequency_cap_blocks_after_limit():
    ledger = FrequencyLedger(cap=2)
    assert ledger.can_send("p1") is True
    ledger.record_send("p1")
    ledger.record_send("p1")
    assert ledger.can_send("p1") is False
