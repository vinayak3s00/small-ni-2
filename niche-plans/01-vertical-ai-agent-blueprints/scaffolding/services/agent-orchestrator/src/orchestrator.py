# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""AbetVerticals agent orchestrator.

Enforces the non-negotiable platform AI standard:
  * Cited answers only — the agent may respond only from tenant-approved
    sources, and every answer carries citations. Ungrounded answers are blocked.
  * Guardrails — per-vertical hard boundaries (e.g. AbetCare must not give
    clinical advice) trigger escalation instead of an answer.
  * Human escalation — when the agent cannot ground an answer or hits a
    guarded intent, it escalates with a conversation summary; never a dead end.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Source:
    """An approved knowledge source the agent may cite."""

    id: str
    text: str


@dataclass(frozen=True)
class VerticalGuard:
    """Hard boundaries for a vertical. Any matched term forces escalation."""

    vertical: str
    escalate_terms: tuple[str, ...] = ()

    def is_guarded(self, query: str) -> str | None:
        q = query.lower()
        for term in self.escalate_terms:
            if term in q:
                return term
        return None


# Default guards per vertical (see docs/architecture.md — per-vertical guardrails).
GUARDS: dict[str, VerticalGuard] = {
    "care": VerticalGuard(
        "care",
        ("diagnos", "prescri", "dosage", "treatment plan", "medic"),
    ),
    "realty": VerticalGuard("realty", ()),
    "admit": VerticalGuard("admit", ()),
}


@dataclass
class AgentReply:
    reply: str
    citations: list[str] = field(default_factory=list)
    escalated: bool = False
    escalation_reason: str | None = None
    summary: str | None = None


# Common words that must not, on their own, ground an answer.
_STOPWORDS = frozenset(
    {
        "the", "and", "for", "are", "you", "your", "what", "which", "with",
        "have", "has", "about", "from", "this", "that", "there", "here",
        "can", "could", "would", "should", "will", "shall", "may", "of",
        "is", "in", "on", "at", "to", "do", "does", "did", "me", "my", "a",
        "an", "i", "we", "us", "it", "its", "be", "get", "give", "tell",
    }
)


def _retrieve(query: str, sources: list[Source], k: int = 3) -> list[Source]:
    """Tiny lexical retriever: rank sources by meaningful query-term overlap.
    Stands in for the vector search used in production; deterministic and
    testable. Stopwords are excluded so generic words never ground an answer."""
    terms = {
        t.strip("?.,!") for t in query.lower().split()
        if len(t) > 2 and t.strip("?.,!") not in _STOPWORDS
    }
    scored: list[tuple[int, Source]] = []
    for s in sources:
        overlap = sum(1 for t in terms if t in s.text.lower())
        if overlap > 0:
            scored.append((overlap, s))
    scored.sort(key=lambda kv: kv[0], reverse=True)
    return [s for _, s in scored[:k]]


def answer(
    vertical: str,
    query: str,
    sources: list[Source],
    conversation: list[str] | None = None,
) -> AgentReply:
    """Produce a grounded, cited reply or escalate."""
    conversation = conversation or []

    # 1. Guardrail check first — guarded intents never get a generated answer.
    guard = GUARDS.get(vertical)
    if guard is not None:
        hit = guard.is_guarded(query)
        if hit is not None:
            return AgentReply(
                reply="I'm connecting you with a specialist who can help with this.",
                escalated=True,
                escalation_reason=f"guarded intent for {vertical}: '{hit}'",
                summary=_summarize(conversation, query),
            )

    # 2. Grounding — retrieve approved sources; block if nothing grounds it.
    retrieved = _retrieve(query, sources)
    if not retrieved:
        return AgentReply(
            reply="I don't have an approved answer for that yet — let me hand you to a colleague.",
            escalated=True,
            escalation_reason="no approved source grounds the query",
            summary=_summarize(conversation, query),
        )

    # 3. Grounded answer with citations (answer composed only from sources).
    citations = [s.id for s in retrieved]
    body = " ".join(s.text for s in retrieved)
    reply = f"{body} " + "".join(f"[{cid}]" for cid in citations)
    return AgentReply(reply=reply.strip(), citations=citations, escalated=False)


def _summarize(conversation: list[str], query: str) -> str:
    turns = conversation[-3:]
    tail = " | ".join(turns)
    base = f"Latest: {query}"
    return f"{base}" if not tail else f"{tail} | {base}"
