# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""Conversational-commerce intent handling for AbetConcierge.

Classifies an inbound message into a commerce intent and produces the next
action. Deterministic + testable; in production the classifier is model-backed
but the action contract stays the same.
"""
from __future__ import annotations

from dataclasses import dataclass

INTENTS = ("browse", "price_quote", "order_status", "support", "handoff", "greeting")


@dataclass
class AgentAction:
    intent: str
    action: str  # what the concierge should do next
    requires_human: bool = False


_KEYWORDS: dict[str, tuple[str, ...]] = {
    "price_quote": ("price", "cost", "how much", "quote", "rate"),
    "order_status": ("order", "where is", "track", "delivery", "shipped"),
    "support": ("refund", "return", "broken", "complaint", "not working"),
    "handoff": ("agent", "human", "manager", "speak to someone"),
    "browse": ("show", "looking for", "do you have", "available", "catalog"),
    "greeting": ("hi", "hello", "hey", "namaste"),
}


def classify(message: str) -> str:
    m = message.lower()
    # Priority order: explicit handoff > support > order > price > browse > greeting.
    for intent in ("handoff", "support", "order_status", "price_quote", "browse", "greeting"):
        if any(kw in m for kw in _KEYWORDS[intent]):
            return intent
    return "browse"


def handle(message: str) -> AgentAction:
    intent = classify(message)
    if intent == "handoff":
        return AgentAction(intent, "route_to_human", requires_human=True)
    if intent == "support":
        return AgentAction(intent, "open_support_ticket", requires_human=False)
    if intent == "order_status":
        return AgentAction(intent, "lookup_order")
    if intent == "price_quote":
        return AgentAction(intent, "build_quote")
    if intent == "greeting":
        return AgentAction(intent, "send_welcome")
    return AgentAction("browse", "recommend_catalog")
