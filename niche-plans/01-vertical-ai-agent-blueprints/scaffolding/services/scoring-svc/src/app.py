# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""FastAPI app exposing explainable scoring for AbetVerticals."""
from __future__ import annotations

from abet_meter import MeterEmitter
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from scoring import ScoringPack, score_record

app = FastAPI(title="AbetVerticals Scoring", version="1.0.0")

# Billable-usage emitter. Tests replace `app.state.meter` with an in-memory sink.
app.state.meter = MeterEmitter(service="scoring-svc")

# In a real deployment these are loaded per-tenant from the Vertical Intelligence
# Pack store. Bundled defaults keep the service runnable standalone.
_PACKS: dict[str, ScoringPack] = {
    "realty": ScoringPack.from_manifest(
        {
            "vertical": "realty",
            "scoring": {
                "signals": {
                    "ready_to_move_budget_match": 30,
                    "site_visit_intent": 25,
                    "verified_phone": 15,
                    "financing_ready": 10,
                },
                "labels": {
                    "ready_to_move_budget_match": "ready-to-move budget match",
                    "site_visit_intent": "site-visit intent",
                    "verified_phone": "verified phone",
                    "financing_ready": "financing ready",
                },
            },
        }
    ),
    "care": ScoringPack.from_manifest(
        {
            "vertical": "care",
            "scoring": {
                "signals": {
                    "appointment_intent": 30,
                    "insurance_verified": 20,
                    "verified_phone": 15,
                },
            },
        }
    ),
    "admit": ScoringPack.from_manifest(
        {
            "vertical": "admit",
            "scoring": {
                "signals": {
                    "eligibility_match": 30,
                    "counselling_intent": 25,
                    "financing_ready": 10,
                },
            },
        }
    ),
}


class ScoreRequest(BaseModel):
    vertical: str = Field(examples=["realty", "care", "admit"])
    signals: dict[str, bool]
    # Optional idempotency key (e.g. the scored record id) so at-least-once
    # delivery downstream dedupes cleanly.
    eventId: str | None = None


class ScoreResponse(BaseModel):
    score: int
    reasons: list[str]
    refreshedAt: str


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/score", response_model=ScoreResponse)
def score(req: ScoreRequest, x_tenant_id: str | None = Header(default=None)) -> ScoreResponse:
    pack = _PACKS.get(req.vertical)
    if pack is None:
        raise HTTPException(status_code=404, detail=f"unknown vertical: {req.vertical}")
    result = score_record(pack, req.signals)
    # Billable usage: an explainable score is an AI action. Tenant comes from the
    # X-Tenant-Id header the gateway/caller propagates. Only successful scores
    # are billed (unknown-vertical requests raise before reaching here).
    app.state.meter.count(
        "ai_actions", x_tenant_id, event_id=req.eventId, source=f"score:{req.vertical}"
    )
    return ScoreResponse(
        score=result.score, reasons=result.reasons, refreshedAt=result.refreshed_at
    )
