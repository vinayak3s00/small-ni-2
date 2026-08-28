# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""AbetMigrate source connectors.

Each connector reads a source system's native record shape and emits a common
StagingRecord that the mapping-engine + reconciliation-svc consume. Every
staging record carries provenance (source_kind + source_id) so migrated data is
always traceable back to where it came from.
"""
from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class StagingRecord:
    source_kind: str
    source_id: str
    data: dict
    provenance: dict = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.provenance:
            self.provenance = {"source_kind": self.source_kind, "source_id": self.source_id}


class Connector(Protocol):
    kind: str

    def extract(self, payload) -> list[StagingRecord]: ...


class CsvConnector:
    """Reads CSV text. The id column names the natural id for each row."""

    kind = "csv"

    def __init__(self, id_column: str = "id") -> None:
        self.id_column = id_column

    def extract(self, payload: str) -> list[StagingRecord]:
        reader = csv.DictReader(io.StringIO(payload.strip()))
        out: list[StagingRecord] = []
        for i, row in enumerate(reader):
            source_id = row.get(self.id_column) or f"row-{i}"
            out.append(StagingRecord(self.kind, source_id, dict(row)))
        return out


class HubSpotConnector:
    """Reads HubSpot's contact export shape: {"results": [{"id", "properties": {...}}]}."""

    kind = "hubspot"

    def extract(self, payload: dict) -> list[StagingRecord]:
        out: list[StagingRecord] = []
        for contact in payload.get("results", []):
            source_id = str(contact.get("id", ""))
            props = dict(contact.get("properties", {}))
            out.append(StagingRecord(self.kind, source_id, props))
        return out


_REGISTRY: dict[str, Connector] = {
    "csv": CsvConnector(),
    "hubspot": HubSpotConnector(),
}


def get_connector(kind: str) -> Connector:
    conn = _REGISTRY.get(kind)
    if conn is None:
        raise ValueError(f"unsupported source kind: {kind}")
    return conn


def extract(kind: str, payload) -> list[StagingRecord]:
    return get_connector(kind).extract(payload)
