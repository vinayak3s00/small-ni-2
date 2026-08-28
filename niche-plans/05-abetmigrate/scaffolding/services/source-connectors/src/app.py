# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""FastAPI app exposing AbetMigrate source-connector extraction."""
from __future__ import annotations

from connectors import extract
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="AbetMigrate Source Connectors", version="1.0.0")


class ExtractRequest(BaseModel):
    kind: str
    # CSV connectors take a string; structured ones take an object.
    csvText: str | None = None
    payload: dict | None = None


class StagingModel(BaseModel):
    sourceKind: str
    sourceId: str
    data: dict
    provenance: dict


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/extract", response_model=list[StagingModel])
def do_extract(req: ExtractRequest) -> list[StagingModel]:
    payload = req.csvText if req.kind == "csv" else (req.payload or {})
    try:
        records = extract(req.kind, payload)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return [
        StagingModel(
            sourceKind=r.source_kind, sourceId=r.source_id, data=r.data, provenance=r.provenance
        )
        for r in records
    ]
