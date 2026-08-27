# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""FastAPI app for the AbetRetain journey engine."""
from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

from journey import JourneyEngine

app = FastAPI(title="AbetRetain Journey Engine", version="1.0.0")

_engine = JourneyEngine(frequency_cap=3)


class EventRequest(BaseModel):
    orderId: str
    partyId: str
    eventType: str


class EventResponse(BaseModel):
    emitted: bool
    step: str | None = None
    body: str | None = None


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/journey/event", response_model=EventResponse)
def journey_event(req: EventRequest) -> EventResponse:
    msg = _engine.on_event(req.orderId, req.partyId, req.eventType)
    if msg is None:
        return EventResponse(emitted=False)
    return EventResponse(emitted=True, step=msg.step, body=msg.body)
