# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""FastAPI PDP + grounding endpoints for AbetTrust."""
from __future__ import annotations

from fastapi import FastAPI, Header
from pydantic import BaseModel

from abet_meter import MeterEmitter
from policy import Actor, evaluate, check_grounding

app = FastAPI(title="AbetTrust Policy Engine", version="1.0.0")
# Billable-usage emitter. Tests replace `app.state.meter` with an in-memory sink.
app.state.meter = MeterEmitter(service="policy-engine")


class ActorModel(BaseModel):
    sub: str
    roles: list[str] = []


class EvaluateRequest(BaseModel):
    actor: ActorModel
    action: str
    resource: str
    fields: list[str] = []


class EvaluateResponse(BaseModel):
    decision: str
    reasons: list[str]
    maskedFields: list[str]


class GroundingRequest(BaseModel):
    messageId: str
    text: str
    approvedSources: list[str] = []


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/policy/evaluate", response_model=EvaluateResponse)
def policy_evaluate(req: EvaluateRequest, x_tenant_id: str | None = Header(default=None)) -> EvaluateResponse:
    d = evaluate(
        Actor(sub=req.actor.sub, roles=req.actor.roles),
        req.action,
        req.resource,
        req.fields,
    )
    # Billable usage: a governed policy decision is an AI action.
    app.state.meter.count("ai_actions", x_tenant_id, source=f"policy:{req.action}")
    return EvaluateResponse(
        decision="allow" if d.allow else "deny",
        reasons=d.reasons,
        maskedFields=d.masked_fields,
    )


@app.post("/v1/grounding/check")
def grounding_check(req: GroundingRequest, x_tenant_id: str | None = Header(default=None)) -> dict:
    result = check_grounding(req.text, req.approvedSources)
    # Billable usage: a grounding/citation check is an AI action.
    app.state.meter.count("ai_actions", x_tenant_id, event_id=req.messageId, source="grounding")
    return result
