"""FastAPI PDP + grounding endpoints for AbetTrust."""
from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

from policy import Actor, evaluate, check_grounding

app = FastAPI(title="AbetTrust Policy Engine", version="1.0.0")


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
def policy_evaluate(req: EvaluateRequest) -> EvaluateResponse:
    d = evaluate(
        Actor(sub=req.actor.sub, roles=req.actor.roles),
        req.action,
        req.resource,
        req.fields,
    )
    return EvaluateResponse(
        decision="allow" if d.allow else "deny",
        reasons=d.reasons,
        maskedFields=d.masked_fields,
    )


@app.post("/v1/grounding/check")
def grounding_check(req: GroundingRequest) -> dict:
    return check_grounding(req.text, req.approvedSources)
