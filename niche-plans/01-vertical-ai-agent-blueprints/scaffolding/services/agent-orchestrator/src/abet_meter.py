# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""Usage-metering emitter for Python services — the FastAPI counterpart of the
TypeScript @abetworks/core MeterEmitter. Emits a billable event whenever an AI
action runs (a score computed, an answer generated, a policy evaluated).

The event shape is byte-for-byte compatible with @abetworks/billing's
MeterAggregator, so the same downstream pipeline consumes both TS and Python
emitters. The default sink writes a structured `{"type":"meter",...}` JSON line;
production swaps in a Kafka sink. Never raises — metering must not break a
request.
"""
from __future__ import annotations

import json
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Literal

MeterKey = Literal["records", "messages", "voice_minutes", "ai_actions"]

MeterSink = Callable[[dict], None]


def log_meter_sink(event: dict) -> None:
    sys.stdout.write(json.dumps({"type": "meter", **event}) + "\n")


@dataclass
class InMemoryMeterSink:
    """Collects emitted events in memory — for unit tests."""

    def __post_init__(self) -> None:
        self.events: list[dict] = []

    def __call__(self, event: dict) -> None:
        self.events.append(event)


class MeterEmitter:
    def __init__(self, service: str, sink: MeterSink | None = None) -> None:
        self.service = service
        self.sink: MeterSink = sink or log_meter_sink

    def emit(
        self,
        meter: MeterKey,
        tenant_id: str | None,
        quantity: int = 1,
        event_id: str | None = None,
        source: str | None = None,
    ) -> None:
        """Record `quantity` units of `meter` for `tenant_id`. Never raises."""
        try:
            if quantity < 0 or not tenant_id:
                return
            event = {
                "eventId": event_id or str(uuid.uuid4()),
                "tenantId": tenant_id,
                "meter": meter,
                "quantity": quantity,
                "at": datetime.now(timezone.utc).isoformat(),
                "service": self.service,
            }
            if source:
                event["source"] = source
            self.sink(event)
        except Exception:  # noqa: BLE001 - metering must never break a request
            pass

    def count(
        self,
        meter: MeterKey,
        tenant_id: str | None,
        event_id: str | None = None,
        source: str | None = None,
    ) -> None:
        self.emit(meter, tenant_id, 1, event_id, source)
