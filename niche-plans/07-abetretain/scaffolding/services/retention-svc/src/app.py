"""FastAPI app for AbetRetain: commerce webhook + retention score + journey enroll."""
from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

from retention import (
    CommerceStore,
    FrequencyLedger,
    OrderEvent,
    score_retention,
)

app = FastAPI(title="AbetRetain", version="1.0.0")

_store = CommerceStore()
_ledger = FrequencyLedger(cap=3)


class WebhookEvent(BaseModel):
    orderId: str
    partyId: str
    eventType: str
    totalMinor: int = 0
    occurredAt: str = "1970-01-01T00:00:00Z"


class EnrollRequest(BaseModel):
    partyId: str


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/webhooks/commerce")
def commerce_webhook(evt: WebhookEvent) -> dict:
    applied = _store.ingest(
        OrderEvent(evt.orderId, evt.partyId, evt.eventType, evt.totalMinor, evt.occurredAt)
    )
    return {"applied": applied}  # idempotent: False on duplicate


@app.get("/v1/retention/{party_id}/score")
def retention_score(party_id: str, days_since_last: int = 0) -> dict:
    score = score_retention(_store.orders_for(party_id), days_since_last)
    return {
        "ltvMinor": score.ltv_minor,
        "churnRisk": score.churn_risk,
        "reasons": score.reasons,
        "refreshedAt": score.refreshed_at,
    }


@app.post("/v1/journeys/enroll")
def enroll(req: EnrollRequest) -> dict:
    if not _ledger.can_send(req.partyId):
        return {"enrolled": False, "reason": "frequency cap reached"}
    _ledger.record_send(req.partyId)
    return {"enrolled": True}
