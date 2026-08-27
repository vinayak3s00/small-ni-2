# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""AbetRetain order-support agent.

Resolves the common order-support intents autonomously, with citations, and
escalates cleanly when it can't:

  * WISMO ("where is my order")  -> answer from fulfilment/tracking facts.
  * return / exchange            -> answer from the returns policy, but only if
    the order is within the returns window; otherwise escalate.

Every autonomous answer carries a citation. Anything the agent cannot ground or
that falls outside policy is escalated with a summary (never a dead end).
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Order:
    order_id: str
    status: str  # placed | shipped | delivered | cancelled
    tracking: str | None = None
    days_since_delivery: int | None = None


@dataclass
class Policy:
    return_window_days: int = 7


@dataclass
class Resolution:
    intent: str
    resolved: bool
    reply: str
    citations: list[str] = field(default_factory=list)
    escalated: bool = False
    escalation_reason: str | None = None


def _wismo(order: Order) -> Resolution:
    if order.status in ("shipped", "delivered") and order.tracking:
        reply = f"Your order {order.order_id} is {order.status}. Track it: {order.tracking}. [tracking]"
        return Resolution("wismo", True, reply, ["tracking"])
    if order.status == "placed":
        reply = f"Your order {order.order_id} is confirmed and being prepared for dispatch. [fulfilment]"
        return Resolution("wismo", True, reply, ["fulfilment"])
    # cancelled or missing tracking -> escalate.
    return Resolution(
        "wismo",
        False,
        "Let me connect you with our team to check on this order.",
        escalated=True,
        escalation_reason=f"no trackable status for order {order.order_id} ({order.status})",
    )


def _returns(order: Order, policy: Policy, intent: str) -> Resolution:
    if order.status != "delivered" or order.days_since_delivery is None:
        return Resolution(
            intent,
            False,
            "I'll pass this to our team to review your order.",
            escalated=True,
            escalation_reason="return requested on a non-delivered order",
        )
    if order.days_since_delivery <= policy.return_window_days:
        reply = (
            f"Order {order.order_id} is within the {policy.return_window_days}-day window. "
            f"I've started your {intent}. [returns_policy]"
        )
        return Resolution(intent, True, reply, ["returns_policy"])
    return Resolution(
        intent,
        False,
        "This order is outside the standard return window; a specialist will review it.",
        escalated=True,
        escalation_reason=(
            f"return window exceeded ({order.days_since_delivery} > {policy.return_window_days} days)"
        ),
    )


def resolve(intent: str, order: Order, policy: Policy | None = None) -> Resolution:
    policy = policy or Policy()
    if intent == "wismo":
        return _wismo(order)
    if intent in ("return", "exchange"):
        return _returns(order, policy, intent)
    return Resolution(
        intent,
        False,
        "Let me hand you to a colleague who can help with that.",
        escalated=True,
        escalation_reason=f"unsupported intent: {intent}",
    )
