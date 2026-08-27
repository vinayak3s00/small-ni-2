# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""Cross-channel identity unification for AbetConcierge.

The same person on WhatsApp, Instagram, a phone call, and email must resolve to
ONE party record (the "one data model" promise). We unify on normalized
channel handles: a phone-based handle (WhatsApp/voice) is normalized to E.164,
an email handle is lowercased, an Instagram handle is lowercased without '@'.
When a new channel identity shares a party with an existing one, they merge.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from uuid import uuid4


def normalize_handle(channel: str, handle: str) -> str:
    ch = channel.lower()
    h = handle.strip()
    if ch in ("whatsapp", "voice", "sms"):
        digits = re.sub(r"[^\d+]", "", h)
        if not digits.startswith("+"):
            # Default to India country code when a bare 10-digit number is given.
            digits = "+91" + digits[-10:]
        return digits
    if ch == "email":
        return h.lower()
    if ch in ("instagram", "ig"):
        return h.lower().lstrip("@")
    return h.lower()


@dataclass
class ChannelIdentity:
    channel: str
    handle: str  # normalized


@dataclass
class Party:
    id: str
    identities: list[ChannelIdentity] = field(default_factory=list)


class IdentityGraph:
    """Resolves/merges channel identities into unified parties per tenant."""

    def __init__(self) -> None:
        # (tenant, channel, normalized_handle) -> party_id
        self._index: dict[tuple[str, str, str], str] = {}
        self._parties: dict[str, Party] = {}

    def resolve(self, tenant_id: str, channel: str, handle: str) -> Party:
        norm = normalize_handle(channel, handle)
        key = (tenant_id, channel, norm)
        pid = self._index.get(key)
        if pid is not None:
            return self._parties[pid]

        pid = str(uuid4())
        party = Party(id=pid, identities=[ChannelIdentity(channel, norm)])
        self._parties[pid] = party
        self._index[key] = pid
        return party

    def link(self, tenant_id: str, party: Party, channel: str, handle: str) -> Party:
        """Attach another channel identity to an existing party (unification)."""
        norm = normalize_handle(channel, handle)
        key = (tenant_id, channel, norm)
        existing_pid = self._index.get(key)

        if existing_pid is not None and existing_pid != party.id:
            # Merge the other party's identities into this one.
            other = self._parties[existing_pid]
            for ident in other.identities:
                self._reindex(tenant_id, party, ident)
            del self._parties[existing_pid]
            return party

        self._index[key] = party.id
        if not any(i.channel == channel and i.handle == norm for i in party.identities):
            party.identities.append(ChannelIdentity(channel, norm))
        return party

    def _reindex(self, tenant_id: str, party: Party, ident: ChannelIdentity) -> None:
        self._index[(tenant_id, ident.channel, ident.handle)] = party.id
        if not any(i.channel == ident.channel and i.handle == ident.handle for i in party.identities):
            party.identities.append(ident)

    def party_count(self) -> int:
        return len(self._parties)
