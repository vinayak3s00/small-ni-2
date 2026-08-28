# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""AbetVoice turn-taking state machine with barge-in.

Models the real-time conversation loop that governs a live call:

    LISTENING --(final STT transcript)--> THINKING --(reply ready)--> SPEAKING
       ^                                                                 |
       |------------------- (agent finishes speaking) -------------------|

Barge-in: if the caller starts speaking while the agent is SPEAKING, the agent
must stop its TTS immediately and return to LISTENING. This keeps the call
natural and hits the sub-800ms responsiveness target from the NFRs.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class TurnState(StrEnum):
    LISTENING = "listening"
    THINKING = "thinking"
    SPEAKING = "speaking"
    ENDED = "ended"


class InvalidTransition(Exception):
    pass


@dataclass
class TurnMachine:
    state: TurnState = TurnState.LISTENING
    interruptions: int = 0
    turns_completed: int = 0
    events: list[str] = field(default_factory=list)

    def _log(self, msg: str) -> None:
        self.events.append(msg)

    def on_final_transcript(self) -> TurnState:
        """Caller finished an utterance; begin reasoning."""
        if self.state != TurnState.LISTENING:
            raise InvalidTransition(f"final_transcript not allowed in {self.state}")
        self.state = TurnState.THINKING
        self._log("stt_final -> thinking")
        return self.state

    def on_reply_ready(self) -> TurnState:
        """Agent produced a reply; start speaking it."""
        if self.state != TurnState.THINKING:
            raise InvalidTransition(f"reply_ready not allowed in {self.state}")
        self.state = TurnState.SPEAKING
        self._log("reply_ready -> speaking")
        return self.state

    def on_speech_end(self) -> TurnState:
        """Agent finished its TTS; hand the floor back to the caller."""
        if self.state != TurnState.SPEAKING:
            raise InvalidTransition(f"speech_end not allowed in {self.state}")
        self.state = TurnState.LISTENING
        self.turns_completed += 1
        self._log("speech_end -> listening")
        return self.state

    def on_barge_in(self) -> TurnState:
        """Caller interrupts. Only meaningful while the agent is SPEAKING:
        stop TTS immediately and return to LISTENING."""
        if self.state == TurnState.SPEAKING:
            self.state = TurnState.LISTENING
            self.interruptions += 1
            self._log("barge_in -> stop_tts -> listening")
        else:
            # Speech energy while already listening/thinking is a no-op.
            self._log(f"barge_in ignored in {self.state}")
        return self.state

    def hang_up(self) -> TurnState:
        self.state = TurnState.ENDED
        self._log("hang_up -> ended")
        return self.state
