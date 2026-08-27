# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""FastAPI app for AbetMigrate reconciliation + cutover gate."""
from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

from reconcile import CutoverBlocked, assert_cutover_allowed, reconcile

app = FastAPI(title="AbetMigrate Reconciliation", version="1.0.0")


class ReconcileRequest(BaseModel):
    source: dict[str, dict]
    target: dict[str, dict]
    compareFields: list[str]
    threshold: float = 1.0


class MetricModel(BaseModel):
    name: str
    sourceCount: int
    targetCount: int
    mismatches: list[str]
    passed: bool


class ReconcileResponse(BaseModel):
    passed: bool
    accuracy: float
    threshold: float
    cutoverAllowed: bool
    blockReason: str | None
    metrics: list[MetricModel]


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/reconcile", response_model=ReconcileResponse)
def do_reconcile(req: ReconcileRequest) -> ReconcileResponse:
    report = reconcile(req.source, req.target, req.compareFields, req.threshold)
    block_reason: str | None = None
    cutover_allowed = True
    try:
        assert_cutover_allowed(report)
    except CutoverBlocked as e:
        cutover_allowed = False
        block_reason = str(e)
    return ReconcileResponse(
        passed=report.passed,
        accuracy=report.accuracy,
        threshold=report.threshold,
        cutoverAllowed=cutover_allowed,
        blockReason=block_reason,
        metrics=[
            MetricModel(
                name=m.name,
                sourceCount=m.source_count,
                targetCount=m.target_count,
                mismatches=m.mismatches,
                passed=m.passed,
            )
            for m in report.metrics
        ],
    )
