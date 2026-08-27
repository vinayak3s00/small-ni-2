# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""AbetRetain post-purchase journey engine.

An event-driven cadence: order lifecycle events (placed -> shipped -> delivered)
advance a per-party journey, emitting the right WhatsApp message at each step.

Guarantees from the plan:
  * Event-driven and *idempotent* — a duplicate event (order_id, event_type)
    never re-fires a step.
  * *Frequency-capped* — the engine will not emit more than the cap allows in a
    window, protecting the WhatsApp quality rating and avoiding fatigue.
"""
from __future__ import annotations

from dataclasses import dataclass, field

# Which journey step each order event triggers, and the message template.
STEP_FOR_EVENT: dict[str, tuple[str, str]] = {
    "placed": ("order_confirmation", "Thanks! Your order {order_id} is confirmed."),
    "shipped": ("shipping_update", "Good news — order {order_id} has shipped."),
    "delivered": ("delivery_followup", "Your order {order_id} arrived. How was it?"),
}
# Events that should never message (e.g. internal state changes).
SILENT_EVENTS = {"payment_authorized", "picked"}


@dataclass
class EmittedMessage:
    party_id: str
    step: str
    body: str


@dataclass
class JourneyEngine:
    frequency_cap: int = 3
    _seen: set[tuple[str, str]] = field(default_factory=set)  # (order_id, event)
    _sends: dict[str, int] = field(default_factory=dict)  # party_id -> count in window
    emitted: list[EmittedMessage] = field(default_factory=list)

    def _can_send(self, party_id: str) -> bool:
        return self._sends.get(party_id, 0) < self.frequency_cap

    def on_event(self, order_id: str, party_id: str, event_type: str) -> EmittedMessage | None:
        """Advance the journey for one order event. Returns the emitted message,
        or None if the event was a duplicate, silent, or frequency-capped."""
        key = (order_id, event_type)
        if key in self._seen:
            return None  # idempotent: duplicate delivery ignored
        self._seen.add(key)

        if event_type in SILENT_EVENTS or event_type not in STEP_FOR_EVENT:
            return None

        if not self._can_send(party_id):
            return None  # frequency cap reached — suppress to avoid fatigue

        step, template = STEP_FOR_EVENT[event_type]
        msg = EmittedMessage(party_id=party_id, step=step, body=template.format(order_id=order_id))
        self._sends[party_id] = self._sends.get(party_id, 0) + 1
        self.emitted.append(msg)
        return msg

    def messages_for(self, party_id: str) -> list[EmittedMessage]:
        return [m for m in self.emitted if m.party_id == party_id]
