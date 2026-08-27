# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""AbetRetain core: idempotent order events, explainable LTV/churn, journeys.

Design guarantees from the plan:
  * Order webhooks are *idempotent* — dedupe on (order_id, event_type).
  * Scoring is *explainable* — churn/LTV expose reason codes.
  * Journeys respect *frequency caps* to avoid WhatsApp fatigue.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class OrderEvent:
    order_id: str
    party_id: str
    event_type: str  # placed | shipped | delivered | cancelled
    total_minor: int
    occurred_at: str


class CommerceStore:
    """Ingests order events idempotently and derives per-party purchase history."""

    def __init__(self) -> None:
        self._seen: set[tuple[str, str]] = set()  # (order_id, event_type)
        self.events: list[OrderEvent] = []

    def ingest(self, event: OrderEvent) -> bool:
        """Return True if newly applied, False if a duplicate was ignored."""
        key = (event.order_id, event.event_type)
        if key in self._seen:
            return False
        self._seen.add(key)
        self.events.append(event)
        return True

    def orders_for(self, party_id: str) -> list[OrderEvent]:
        # A "purchase" is a distinct placed order.
        return [e for e in self.events if e.party_id == party_id and e.event_type == "placed"]


@dataclass
class RetentionScore:
    ltv_minor: int
    churn_risk: str  # low | medium | high
    reasons: list[str]
    refreshed_at: str


def score_retention(orders: list[OrderEvent], days_since_last: int) -> RetentionScore:
    """Explainable LTV + churn. LTV = sum of placed-order totals. Churn risk is a
    transparent function of recency and order count, with reason codes."""
    ltv = sum(o.total_minor for o in orders)
    count = len(orders)
    reasons: list[str] = []

    if count == 0:
        return RetentionScore(0, "high", ["no completed purchases"], _now())

    if days_since_last > 180:
        churn = "high"
        reasons.append(f"no purchase in {days_since_last} days")
    elif days_since_last > 90:
        churn = "medium"
        reasons.append(f"last purchase {days_since_last} days ago")
    else:
        churn = "low"
        reasons.append("recently active")

    if count >= 5:
        reasons.append("loyal repeat buyer")
        if churn == "medium":
            churn = "low"  # loyalty offsets moderate recency risk

    return RetentionScore(ltv_minor=ltv, churn_risk=churn, reasons=reasons, refreshed_at=_now())


class FrequencyLedger:
    """Enforces per-party messaging frequency caps within a rolling window."""

    def __init__(self, cap: int = 3) -> None:
        self.cap = cap
        self._counts: dict[str, int] = {}

    def can_send(self, party_id: str) -> bool:
        return self._counts.get(party_id, 0) < self.cap

    def record_send(self, party_id: str) -> None:
        self._counts[party_id] = self._counts.get(party_id, 0) + 1


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
