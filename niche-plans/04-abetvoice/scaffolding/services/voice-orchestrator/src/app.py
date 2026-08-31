# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""FastAPI app driving the AbetVoice turn state machine per call session."""
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from turn import InvalidTransition, TurnMachine, TurnState

app = FastAPI(title="AbetVoice Orchestrator", version="1.0.0")

# call_id -> live turn machine (Redis-backed + sticky-routed in production).
_SESSIONS: dict[str, TurnMachine] = {}


class EventRequest(BaseModel):
    callId: str
    event: str  # stt_final | reply_ready | speech_end | barge_in | hang_up


class StateResponse(BaseModel):
    callId: str
    state: str
    interruptions: int
    turnsCompleted: int


_HANDLERS = {
    "stt_final": lambda m: m.on_final_transcript(),
    "reply_ready": lambda m: m.on_reply_ready(),
    "speech_end": lambda m: m.on_speech_end(),
    "barge_in": lambda m: m.on_barge_in(),
    "hang_up": lambda m: m.hang_up(),
}


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/calls/{call_id}/start", response_model=StateResponse)
def start(call_id: str) -> StateResponse:
    machine = TurnMachine()
    _SESSIONS[call_id] = machine
    return _snapshot(call_id, machine)


@app.post("/v1/events", response_model=StateResponse)
def event(req: EventRequest) -> StateResponse:
    machine = _SESSIONS.get(req.callId)
    if machine is None:
        raise HTTPException(status_code=404, detail="unknown call session")
    handler = _HANDLERS.get(req.event)
    if handler is None:
        raise HTTPException(status_code=400, detail=f"unknown event: {req.event}")
    try:
        handler(machine)
    except InvalidTransition as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    if machine.state == TurnState.ENDED:
        _SESSIONS.pop(req.callId, None)
    return _snapshot(req.callId, machine)


def _snapshot(call_id: str, m: TurnMachine) -> StateResponse:
    return StateResponse(
        callId=call_id,
        state=m.state.value,
        interruptions=m.interruptions,
        turnsCompleted=m.turns_completed,
    )
