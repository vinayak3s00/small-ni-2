<!--
Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
Abetworks Proprietary and Confidential.
-->
# partner-admin-svc (AbetPartner)

Hierarchical multi-tenancy for agencies: a **partner (agency) is the tenant
boundary**, owning many isolated client workspaces. **PostgreSQL Row-Level
Security** guarantees one agency can never see another's workspaces, grants, or
usage — enforced by the database, not application code.

## Run it (Postgres + service)

From the **repository root**:

```bash
docker compose -f niche-plans/06-abetpartner/scaffolding/services/partner-admin-svc/docker-compose.yaml up --build
```

Migrates on boot, listens on `:3006`. Without `DATABASE_URL` it uses the
in-memory store (dev/tests only).

## Try it

```bash
# The JWT's tenant_id IS the partner (agency) id.
TOKEN=$(node -e "console.log(require('jsonwebtoken').sign({sub:'owner',tenant_id:'11111111-1111-1111-1111-111111111111',roles:['owner']},'dev-secret-change-me'))")

# Provision a client workspace, grant reports scope, record usage, roll up billing.
WS=$(curl -s localhost:3006/v1/workspaces -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"clientName":"Acme Retail"}')
ID=$(echo "$WS" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
curl -s localhost:3006/v1/workspaces/$ID/grant -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"scopes":["reports:read"]}'
curl -s localhost:3006/v1/workspaces/$ID/usage -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"units":1000}'
curl -s "localhost:3006/v1/billing/rollup?wholesale=5&retail=12" -H "Authorization: Bearer $TOKEN"
```

## Why isolation holds

- Every row carries `partner_id`; RLS policies key on
  `current_setting('app.tenant_id')` which `withTenantScope()` sets to the
  partner id per transaction. A partner's query simply cannot return another
  partner's rows.
- `UNIQUE(partner_id, client_name)` prevents duplicate client workspaces.
- Grants are scoped; `canAccess` returns true only for a granted scope on a
  workspace the partner owns.

## Tests

```bash
npm test                                 # in-memory unit tests
DATABASE_URL=postgres://... npm test     # + Postgres integration (RLS, grants, rollup)
```
