# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

import pytest
from app import app
from fastapi.testclient import TestClient
from turn import InvalidTransition, TurnMachine, TurnState

client = TestClient(app)


def test_happy_path_full_turn():
    m = TurnMachine()
    assert m.state == TurnState.LISTENING
    m.on_final_transcript()
    assert m.state == TurnState.THINKING
    m.on_reply_ready()
    assert m.state == TurnState.SPEAKING
    m.on_speech_end()
    assert m.state == TurnState.LISTENING
    assert m.turns_completed == 1


def test_barge_in_stops_speech_and_returns_to_listening():
    m = TurnMachine()
    m.on_final_transcript()
    m.on_reply_ready()  # now SPEAKING
    m.on_barge_in()
    assert m.state == TurnState.LISTENING
    assert m.interruptions == 1
    assert any("stop_tts" in e for e in m.events)


def test_barge_in_is_noop_while_listening():
    m = TurnMachine()
    m.on_barge_in()  # nothing to interrupt
    assert m.state == TurnState.LISTENING
    assert m.interruptions == 0


def test_invalid_transition_raises():
    m = TurnMachine()
    with pytest.raises(InvalidTransition):
        m.on_reply_ready()  # can't reply before thinking


def test_hang_up_ends_session():
    m = TurnMachine()
    m.hang_up()
    assert m.state == TurnState.ENDED


def test_api_flow_with_barge_in():
    client.post("/v1/calls/call-1/start")
    client.post("/v1/events", json={"callId": "call-1", "event": "stt_final"})
    client.post("/v1/events", json={"callId": "call-1", "event": "reply_ready"})
    r = client.post("/v1/events", json={"callId": "call-1", "event": "barge_in"})
    body = r.json()
    assert body["state"] == "listening"
    assert body["interruptions"] == 1


def test_api_unknown_session_404():
    r = client.post("/v1/events", json={"callId": "nope", "event": "stt_final"})
    assert r.status_code == 404


def test_api_invalid_transition_409():
    client.post("/v1/calls/call-2/start")
    r = client.post("/v1/events", json={"callId": "call-2", "event": "reply_ready"})
    assert r.status_code == 409
