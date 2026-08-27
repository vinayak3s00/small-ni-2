# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""FastAPI app for the AbetVerticals agent orchestrator."""
from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

from orchestrator import Source, answer

app = FastAPI(title="AbetVerticals Agent Orchestrator", version="1.0.0")


class SourceModel(BaseModel):
    id: str
    text: str


class AnswerRequest(BaseModel):
    vertical: str
    query: str
    sources: list[SourceModel] = []
    conversation: list[str] = []


class AnswerResponse(BaseModel):
    reply: str
    citations: list[str]
    escalated: bool
    escalationReason: str | None = None
    summary: str | None = None


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/agent/answer", response_model=AnswerResponse)
def agent_answer(req: AnswerRequest) -> AnswerResponse:
    result = answer(
        req.vertical,
        req.query,
        [Source(s.id, s.text) for s in req.sources],
        req.conversation,
    )
    return AnswerResponse(
        reply=result.reply,
        citations=result.citations,
        escalated=result.escalated,
        escalationReason=result.escalation_reason,
        summary=result.summary,
    )
