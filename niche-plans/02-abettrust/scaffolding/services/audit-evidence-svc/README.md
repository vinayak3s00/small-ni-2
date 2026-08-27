<!--
Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
Abetworks Proprietary and Confidential.
-->
# audit-evidence-svc (AbetTrust)

A durable, **tamper-evident WORM audit log**: every read/write/export is an
append-only, hash-chained event in PostgreSQL, isolated per tenant with
**Row-Level Security**. Auditor **evidence packs** (Merkle root + pack hash)
are generated on demand. This is the compliance record regulated buyers require.

## Run it (Postgres + service)

From the **repository root**:

```bash
docker compose -f niche-plans/02-abettrust/scaffolding/services/audit-evidence-svc/docker-compose.yaml up --build
```

Migrates on boot, listens on `:3002`. Without `DATABASE_URL` it uses the
in-memory chain (dev/tests only).

## Try it

```bash
TOKEN=$(node -e "console.log(require('jsonwebtoken').sign({sub:'officer',tenant_id:'11111111-1111-1111-1111-111111111111',roles:['compliance_officer']},'dev-secret-change-me'))")

# Append events, verify the chain, generate an auditor evidence pack.
curl -s localhost:3002/v1/audit/events -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"action":"export","entity":"kyc_record","entityId":"k-1","fields":["pan"]}'
curl -s localhost:3002/v1/audit/verify -H "Authorization: Bearer $TOKEN"          # {"intact":true}
curl -s localhost:3002/v1/evidence/packs -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"period":"2026-Q2"}'
```

## Why it's audit-grade (WORM)

- Each `audit_event` folds the **previous event's hash** into its own
  (`prev_hash` → `hash`), forming a per-tenant chain. Any edit or deletion of an
  earlier event makes `/v1/audit/verify` return `false`.
- A database trigger **blocks UPDATE and DELETE** on the log and on evidence
  packs — the record is write-once even to an operator.
- Appends are serialized per tenant with a transaction advisory lock so the
  chain stays consistent under concurrency; **RLS** isolates each tenant's chain.
- Query and pack generation require the `compliance_officer` role.

## Tests

```bash
npm test                                 # in-memory unit tests
DATABASE_URL=postgres://... npm test     # + Postgres integration (WORM, RLS, append-only, packs)
```
