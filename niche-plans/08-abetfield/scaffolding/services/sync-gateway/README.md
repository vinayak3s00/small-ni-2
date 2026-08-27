<!--
Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
Abetworks Proprietary and Confidential.
-->
# sync-gateway (AbetField)

Offline-first sync for field reps, backed by a **durable, append-only op-log**
in PostgreSQL. Idempotent replay survives process restarts, per-entity conflict
resolution is deterministic, and every tenant's data is isolated by
**Row-Level Security**.

## Run it (Postgres + service)

From the **repository root**:

```bash
docker compose -f niche-plans/08-abetfield/scaffolding/services/sync-gateway/docker-compose.yaml up --build
```

Migrates on boot, listens on `:3008`. Without `DATABASE_URL` it uses the
in-memory engine (dev/tests only).

## Try it

```bash
TOKEN=$(node -e "console.log(require('jsonwebtoken').sign({sub:'rep',tenant_id:'11111111-1111-1111-1111-111111111111',roles:['field_rep']},'dev-secret-change-me'))")

# Push a batch of offline-captured mutations; replaying the same batch is a no-op.
curl -s localhost:3008/v1/sync -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{
  "mutations":[
    {"clientMutationId":"m1","entity":"field_order","op":"update","payload":{"id":"o1","updatedAt":"2026-06-01T10:00:00Z","totalMinor":5000}},
    {"clientMutationId":"m2","entity":"visit","op":"create","payload":{"id":"outlet-1"}}
  ]}'
# Re-send -> both reported as duplicates (idempotent).
```

## Conflict resolution (deterministic, per entity)

| Entity | Policy |
|--------|--------|
| `visit` | **append-only** — every check-in is kept (keyed by client mutation id) |
| `stock_position` | **server-authoritative** — the server value wins on conflict |
| `field_order` | **last-writer-wins** by client timestamp |

## Why replay is safe across restarts

- `sync_mutation` is a durable, **append-only op-log** with a
  `UNIQUE(tenant_id, client_mutation_id)`. A replayed mutation hits
  `ON CONFLICT DO NOTHING` and is reported as a duplicate — even after a crash.
- A trigger blocks UPDATE/DELETE on the op-log, so the history is tamper-evident.
- Current state lives in `synced_row`; each sync runs in one tenant-scoped
  transaction so RLS isolates tenants and the log + state stay consistent.

## Tests

```bash
npm test                                 # in-memory unit tests
DATABASE_URL=postgres://... npm test     # + Postgres integration (durable replay, LWW, RLS, append-only)
```
