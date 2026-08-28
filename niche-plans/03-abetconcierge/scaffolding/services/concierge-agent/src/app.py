# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""FastAPI app for the AbetConcierge concierge agent."""
from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

from abet_meter import MeterEmitter
from commerce import handle
from identity import IdentityGraph

app = FastAPI(title="AbetConcierge Agent", version="1.0.0")

_graph = IdentityGraph()
# Billable-usage emitter. Tests replace `app.state.meter` with an in-memory sink.
app.state.meter = MeterEmitter(service="concierge-agent")


class InboundMessage(BaseModel):
    tenantId: str
    channel: str
    handle: str
    body: str


class InboundResponse(BaseModel):
    partyId: str
    intent: str
    action: str
    requiresHuman: bool


class LinkRequest(BaseModel):
    tenantId: str
    partyId: str
    channel: str
    handle: str


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/inbound", response_model=InboundResponse)
def inbound(msg: InboundMessage) -> InboundResponse:
    party = _graph.resolve(msg.tenantId, msg.channel, msg.handle)
    action = handle(msg.body)
    # Billable usage: handling an inbound conversational message is an AI action.
    app.state.meter.count("ai_actions", msg.tenantId, source=f"inbound:{action.intent}")
    return InboundResponse(
        partyId=party.id,
        intent=action.intent,
        action=action.action,
        requiresHuman=action.requires_human,
    )
