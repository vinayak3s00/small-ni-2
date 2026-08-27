<!--
Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
Abetworks Proprietary and Confidential.
-->
# kyc-svc (AbetTrust)

KYC / suitability lifecycle with a **database-enforced append-only audit trail**,
isolated per tenant with **PostgreSQL Row-Level Security** — the compliance
backbone regulated buyers ask for.

## Run it (Postgres + service)

From the **repository root**:

```bash
docker compose -f niche-plans/02-abettrust/scaffolding/services/kyc-svc/docker-compose.yaml up --build
```

Migrates on boot, listens on `:3007`.

## Local run against your own Postgres

```bash
cp .env.example .env
npm install && npm run build
npm run migrate
npm start
```

Without `DATABASE_URL` it falls back to the in-memory store (dev/tests only).

## Try it

```bash
TOKEN=$(node -e "console.log(require('jsonwebtoken').sign({sub:'officer',tenant_id:'11111111-1111-1111-1111-111111111111',roles:['compliance_officer']},'dev-secret-change-me'))")

# Create -> submit -> verify -> disclose -> check suitability
ID=$(curl -s localhost:3007/v1/kyc -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"partyId":"party-1"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
curl -s localhost:3007/v1/kyc/$ID/transition -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"to":"submitted"}' >/dev/null
curl -s localhost:3007/v1/kyc/$ID/transition -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"to":"verified"}' >/dev/null
curl -s localhost:3007/v1/kyc/$ID/disclosures -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"disclosure":"Risk disclosure v1"}' >/dev/null
curl -s localhost:3007/v1/kyc/$ID/suitability -H "Authorization: Bearer $TOKEN"   # {"complete":true}
```

## Why it's audit-grade

- **RLS** isolates every KYC record + trail row by the connection's tenant.
- The **`kyc_trail` table is append-only** — a DB trigger rejects any UPDATE or
  DELETE, so the disclosure/status history is tamper-evident even to an operator.
- Every operation runs inside `withTenantScope()` (from `@abetworks/core`), which
  sets `app.tenant_id` per transaction so Postgres — not app code — enforces isolation.

## Tests

```bash
npm test                                 # in-memory unit tests
DATABASE_URL=postgres://... npm test     # + Postgres integration (RLS, append-only trail)
```
