# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""AbetMigrate mapping + idempotent cutover + rollback journal.

Reliability guarantees from the plan:
  * Cutover is *idempotent* (upsert by natural key) and re-runnable.
  * Every write records its inverse in a rollback journal, so cutover is
    fully reversible.
  * Records carry provenance (source system + source id).
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

# Built-in field transforms available to a mapping rule.
TRANSFORMS: dict[str, Callable[[Any], Any]] = {
    "identity": lambda v: v,
    "lower": lambda v: v.lower() if isinstance(v, str) else v,
    "upper": lambda v: v.upper() if isinstance(v, str) else v,
    "strip": lambda v: v.strip() if isinstance(v, str) else v,
    "to_minor": lambda v: int(round(float(v) * 100)),  # rupees -> paise
}


@dataclass
class FieldMap:
    source_path: str
    target_path: str
    transform: str = "identity"

    def apply(self, source: dict) -> tuple[str, Any]:
        raw = source.get(self.source_path)
        fn = TRANSFORMS.get(self.transform, TRANSFORMS["identity"])
        return self.target_path, fn(raw)


@dataclass
class MappingSpec:
    natural_key: str  # target field that uniquely identifies a record
    field_maps: list[FieldMap]

    def map_record(self, source: dict) -> dict:
        out: dict[str, Any] = {}
        for fm in self.field_maps:
            key, value = fm.apply(source)
            out[key] = value
        if self.natural_key not in out:
            raise ValueError(f"mapped record missing natural key '{self.natural_key}'")
        return out


@dataclass
class RollbackEntry:
    target_id: str
    inverse: dict | None  # previous state; None means the row was newly created


@dataclass
class CutoverResult:
    inserted: int
    updated: int
    rollback: list[RollbackEntry] = field(default_factory=list)


class TargetStore:
    """Emulates core-crm target table keyed by natural key, with provenance."""

    def __init__(self) -> None:
        self.rows: dict[str, dict] = {}

    def upsert(self, natural_key: str, record: dict, provenance: dict) -> tuple[str, dict | None]:
        key = record[natural_key]
        prev = self.rows.get(key)
        stored = {**record, "_provenance": provenance}
        self.rows[key] = stored
        return key, prev


def cutover(
    store: TargetStore,
    spec: MappingSpec,
    source_kind: str,
    source_records: list[dict],
) -> CutoverResult:
    """Idempotent cutover: mapping the same source twice yields the same target
    state and never duplicates rows (upsert by natural key)."""
    inserted = updated = 0
    rollback: list[RollbackEntry] = []

    for src in source_records:
        mapped = spec.map_record(src)
        provenance = {"source_kind": source_kind, "source_id": src.get("id")}
        key, prev = store.upsert(spec.natural_key, mapped, provenance)
        if prev is None:
            inserted += 1
        else:
            updated += 1
        rollback.append(RollbackEntry(target_id=key, inverse=prev))

    return CutoverResult(inserted=inserted, updated=updated, rollback=rollback)


def rollback(store: TargetStore, entries: list[RollbackEntry]) -> int:
    """Reverse a cutover using the rollback journal. Applied in reverse order."""
    restored = 0
    for entry in reversed(entries):
        if entry.inverse is None:
            store.rows.pop(entry.target_id, None)  # was newly created -> delete
        else:
            store.rows[entry.target_id] = entry.inverse  # restore prior state
        restored += 1
    return restored
