# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""AbetTrust Policy Decision Point (PDP).

A lightweight, dependency-free evaluator that mirrors the Rego policy shipped in
`scaffolding/policies/lending.rego`. In production the PDP delegates to OPA with
distributed Rego bundles; this Python implementation keeps the service runnable
and testable standalone while enforcing the same rules:

  1. Exports of sensitive resources require the `compliance_officer` role.
  2. Field-level masking removes fields the actor's role may not read.
"""
from __future__ import annotations

from dataclasses import dataclass, field

# Resources that may only be exported by a compliance officer.
SENSITIVE_EXPORT_RESOURCES = {"kyc_record", "suitability_record"}

# field -> role required to read it (field-level permissions).
FIELD_ROLE_REQUIREMENTS: dict[str, str] = {
    "internal_risk_notes": "advisor",
    "aadhaar_number": "compliance_officer",
    "pan_number": "compliance_officer",
}


@dataclass
class Actor:
    sub: str
    roles: list[str] = field(default_factory=list)

    def has_role(self, role: str) -> bool:
        return role in self.roles


@dataclass
class Decision:
    allow: bool
    reasons: list[str]
    masked_fields: list[str]


def evaluate(actor: Actor, action: str, resource: str, fields: list[str] | None = None) -> Decision:
    """Evaluate an action against tenant policy. Returns allow/deny + reasons +
    the set of fields that must be masked from the response."""
    fields = fields or []
    reasons: list[str] = []
    allow = True

    if action == "export" and resource in SENSITIVE_EXPORT_RESOURCES:
        if not actor.has_role("compliance_officer"):
            allow = False
            reasons.append(
                f"export of {resource} requires role 'compliance_officer'"
            )
        else:
            reasons.append("export permitted for compliance_officer")

    masked = [
        f
        for f in fields
        if f in FIELD_ROLE_REQUIREMENTS
        and not actor.has_role(FIELD_ROLE_REQUIREMENTS[f])
    ]
    if masked:
        reasons.append(f"masked {len(masked)} field(s) lacking required role")

    if allow and not reasons:
        reasons.append("no policy restricts this action")

    return Decision(allow=allow, reasons=reasons, masked_fields=masked)


def check_grounding(text: str, approved_sources: list[str]) -> dict:
    """Grounding gate: agent output must cite at least one approved source.

    Baseline rule: 'answers only from approved sources and cite them'. We treat
    output as grounded only if it references an approved source id and that
    source is in the tenant's approved set. Ungrounded output is blocked.
    """
    cited = [s for s in approved_sources if f"[{s}]" in text]
    passed = len(cited) > 0
    return {"passed": passed, "citations": cited}
