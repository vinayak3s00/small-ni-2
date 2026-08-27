# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""AbetMigrate dual-run reconciliation + cutover gate.

Runs the old system and the new (Abetworks) system in parallel, compares them,
and only permits cutover when reconciliation passes agreed thresholds. This is
the safety gate from the plan: "Reconciliation must pass thresholds before
cutover is allowed."

Two comparisons per record set:
  * count parity  — same number of records on both sides.
  * field parity  — for records present on both sides (matched by natural key),
    the mapped field values agree.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class MetricResult:
    name: str
    source_count: int
    target_count: int
    mismatches: list[str] = field(default_factory=list)
    # Hard metrics (e.g. record_count) must have zero mismatches to pass.
    # Soft metrics (e.g. field_parity) are governed by the accuracy threshold.
    hard: bool = True

    @property
    def passed(self) -> bool:
        if not self.hard:
            return True  # soft metric pass/fail is decided by report accuracy
        return self.source_count == self.target_count and not self.mismatches


@dataclass
class ReconciliationReport:
    metrics: list[MetricResult]
    accuracy: float  # 0.0 - 1.0 across matched records
    threshold: float

    @property
    def passed(self) -> bool:
        return all(m.passed for m in self.metrics) and self.accuracy >= self.threshold


def reconcile(
    source: dict[str, dict],
    target: dict[str, dict],
    compare_fields: list[str],
    threshold: float = 1.0,
) -> ReconciliationReport:
    """Compare two keyed record sets. `source`/`target` map natural_key -> record."""
    count_metric = MetricResult(
        name="record_count",
        source_count=len(source),
        target_count=len(target),
    )

    # Records missing on either side are count/coverage mismatches.
    missing_in_target = [k for k in source if k not in target]
    missing_in_source = [k for k in target if k not in source]
    for k in missing_in_target:
        count_metric.mismatches.append(f"missing in target: {k}")
    for k in missing_in_source:
        count_metric.mismatches.append(f"unexpected in target: {k}")

    # Field-level comparison on the intersection. Soft metric: whether it
    # ultimately blocks cutover is decided by the report-level accuracy threshold.
    field_metric = MetricResult(
        name="field_parity",
        source_count=0,
        target_count=0,
        hard=False,
    )
    matched = [k for k in source if k in target]
    field_metric.source_count = len(matched)
    field_metric.target_count = len(matched)

    correct = 0
    total = 0
    for k in matched:
        for f in compare_fields:
            total += 1
            if source[k].get(f) == target[k].get(f):
                correct += 1
            else:
                field_metric.mismatches.append(
                    f"{k}.{f}: {source[k].get(f)!r} != {target[k].get(f)!r}"
                )

    accuracy = 1.0 if total == 0 else correct / total

    return ReconciliationReport(
        metrics=[count_metric, field_metric],
        accuracy=accuracy,
        threshold=threshold,
    )


class CutoverBlocked(Exception):
    pass


def assert_cutover_allowed(report: ReconciliationReport) -> None:
    """Gate: raise unless reconciliation passed. Callers must invoke this before
    permitting a cutover."""
    if not report.passed:
        reasons = [m.name for m in report.metrics if not m.passed]
        if report.accuracy < report.threshold:
            reasons.append(f"accuracy {report.accuracy:.3f} < threshold {report.threshold}")
        raise CutoverBlocked("cutover blocked: " + ", ".join(reasons))
