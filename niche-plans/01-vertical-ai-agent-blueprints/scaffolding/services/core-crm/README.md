<!--
Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
Abetworks Proprietary and Confidential.
-->
# core-crm (AbetVerticals)

The record-of-truth service: records, explainable scores, and no-double-book
bookings — persisted in **PostgreSQL with Row-Level Security** for hard
tenant isolation.

## Run it (self-contained, Postgres + service)

From the **repository root**:

```bash
docker compose -f niche-plans/01-vertical-ai-agent-blueprints/scaffolding/services/core-crm/docker-compose.yaml up --build
```

The service migrates the schema on boot and listens on `:3001`.

## Run locally against your own Postgres

```bash
cp .env.example .env            # set DATABASE_URL
npm install
npm run build
npm run migrate                 # apply migrations
npm start                       # boots on :3001 using Postgres
```

Without `DATABASE_URL` the service falls back to the in-memory repository
(handy for local experiments and unit tests).

## Try the API

```bash
# A dev JWT (tenant_id + roles) — replace with your IdP token in production.
TOKEN=$(node -e "console.log(require('jsonwebtoken').sign({sub:'u1',tenant_id:'11111111-1111-1111-1111-111111111111',roles:['sales']},'dev-secret-change-me'))")

curl -s localhost:3001/v1/records -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"vertical":"realty","source":"portal","party":{"name":"Asha"}}'

curl -s localhost:3001/v1/records -H "Authorization: Bearer $TOKEN"
```

## How isolation works

- Every table has `tenant_id` and RLS policies keyed on
  `current_setting('app.tenant_id')`.
- The service never filters by tenant in SQL. Instead each operation runs in
  `withTenantScope()` (from `@abetworks/core`), which opens a transaction and
  sets `app.tenant_id` — so Postgres enforces isolation, not application code.
- No-double-book is a **database** guarantee: a partial unique index on
  `(tenant_id, resource_id, slot_start) WHERE status = 'booked'`.

## Tests

```bash
npm test                        # unit tests (in-memory repo)
DATABASE_URL=postgres://... npm test   # also runs Postgres integration tests
```

Integration tests skip automatically when `DATABASE_URL` is not set.
