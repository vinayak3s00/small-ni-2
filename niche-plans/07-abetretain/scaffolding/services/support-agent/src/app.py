# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""FastAPI app for the AbetRetain support agent."""
from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel
from support import Order, Policy, resolve

app = FastAPI(title="AbetRetain Support Agent", version="1.0.0")


class ResolveRequest(BaseModel):
    intent: str
    orderId: str
    status: str
    tracking: str | None = None
    daysSinceDelivery: int | None = None
    returnWindowDays: int = 7


class ResolveResponse(BaseModel):
    intent: str
    resolved: bool
    reply: str
    citations: list[str]
    escalated: bool
    escalationReason: str | None = None


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/support/resolve", response_model=ResolveResponse)
def support_resolve(req: ResolveRequest) -> ResolveResponse:
    order = Order(
        order_id=req.orderId,
        status=req.status,
        tracking=req.tracking,
        days_since_delivery=req.daysSinceDelivery,
    )
    r = resolve(req.intent, order, Policy(return_window_days=req.returnWindowDays))
    return ResolveResponse(
        intent=r.intent,
        resolved=r.resolved,
        reply=r.reply,
        citations=r.citations,
        escalated=r.escalated,
        escalationReason=r.escalation_reason,
    )
