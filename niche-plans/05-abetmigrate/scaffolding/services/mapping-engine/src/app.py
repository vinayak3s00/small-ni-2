"""FastAPI app for AbetMigrate: mapping preview + idempotent cutover + rollback."""
from __future__ import annotations

from uuid import uuid4

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from mapping import CutoverResult, FieldMap, MappingSpec, TargetStore, cutover, rollback

app = FastAPI(title="AbetMigrate Mapping Engine", version="1.0.0")

# In-memory migration registry (per-tenant + durable in production).
_STORES: dict[str, TargetStore] = {}
_JOURNALS: dict[str, list] = {}


class FieldMapModel(BaseModel):
    sourcePath: str
    targetPath: str
    transform: str = "identity"


class CutoverRequest(BaseModel):
    naturalKey: str
    sourceKind: str
    fieldMaps: list[FieldMapModel]
    records: list[dict]


class CutoverResponse(BaseModel):
    migrationId: str
    inserted: int
    updated: int
    rows: int


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/migrations/cutover", response_model=CutoverResponse)
def do_cutover(req: CutoverRequest) -> CutoverResponse:
    spec = MappingSpec(
        natural_key=req.naturalKey,
        field_maps=[FieldMap(f.sourcePath, f.targetPath, f.transform) for f in req.fieldMaps],
    )
    store = TargetStore()
    try:
        result: CutoverResult = cutover(store, spec, req.sourceKind, req.records)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    migration_id = str(uuid4())
    _STORES[migration_id] = store
    _JOURNALS[migration_id] = result.rollback
    return CutoverResponse(
        migrationId=migration_id,
        inserted=result.inserted,
        updated=result.updated,
        rows=len(store.rows),
    )


@app.post("/v1/migrations/{migration_id}/rollback")
def do_rollback(migration_id: str) -> dict:
    store = _STORES.get(migration_id)
    journal = _JOURNALS.get(migration_id)
    if store is None or journal is None:
        raise HTTPException(status_code=404, detail="migration not found")
    restored = rollback(store, journal)
    return {"restored": restored, "rows": len(store.rows)}
