<!--
Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
Abetworks Proprietary and Confidential.
-->
# attribution-svc (AbetVerticals)

An **immutable, append-only attribution ledger** — the uncontestable source of
truth for "who produced this booking", so channel-partner payouts and ad ROAS
stop being arguments. Isolated per tenant with **PostgreSQL Row-Level Security**;
append-only enforced by a database trigger.

## Run it (Postgres + service)

From the **repository root**:

```bash
docker compose -f niche-plans/01-vertical-ai-agent-blueprints/scaffolding/services/attribution-svc/docker-compose.yaml up --build
```

Migrates on boot, listens on `:3011`.

## Try it

```bash
TOKEN=$(node -e "console.log(require('jsonwebtoken').sign({sub:'u',tenant_id:'11111111-1111-1111-1111-111111111111',roles:['sales']},'dev-secret-change-me'))")

# Record three touches for a lead, then resolve attribution.
curl -s localhost:3011/v1/attribution/events -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"recordId":"r1","source":"portal:99acres","occurredAt":"2026-06-01T09:00:00Z"}'
curl -s localhost:3011/v1/attribution/events -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"recordId":"r1","source":"cp","partnerCode":"CP-042","occurredAt":"2026-06-03T09:00:00Z"}'
curl -s "localhost:3011/v1/attribution/r1?model=last_touch" -H "Authorization: Bearer $TOKEN"
```

## Why the ledger is trustworthy

- **RLS** isolates every touch by tenant.
- The `attribution_event` table is **append-only** — a trigger rejects UPDATE
  and DELETE, so recorded touches cannot be altered after the fact.
- Attribution models (`first_touch`, `last_touch`, `linear`) are computed over
  the immutable touches; weights always sum to 1.

## Tests

```bash
npm test                                 # in-memory unit tests
DATABASE_URL=postgres://... npm test     # + Postgres integration (RLS, append-only, models)
```
