<!--
Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
Abetworks Proprietary and Confidential.
-->
# order-svc (AbetField)

GST-aware field-order capture with **database-enforced stock allocation** —
concurrent field reps can never oversell — isolated per tenant with
**PostgreSQL Row-Level Security**.

## Run it (Postgres + service)

From the **repository root**:

```bash
docker compose -f niche-plans/08-abetfield/scaffolding/services/order-svc/docker-compose.yaml up --build
```

Migrates on boot, listens on `:3013`.

## Local run against your own Postgres

```bash
cp .env.example .env
npm install && npm run build
npm run migrate
npm start
```

Without `DATABASE_URL` it uses the in-memory store (dev/tests only).

## Try it

```bash
TOKEN=$(node -e "console.log(require('jsonwebtoken').sign({sub:'rep',tenant_id:'11111111-1111-1111-1111-111111111111',roles:['field_rep']},'dev-secret-change-me'))")

# Seed a SKU with 10 units, then order 2.
curl -s localhost:3013/v1/catalog -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"sku":"A","name":"Cooking Oil 1L","priceMinor":12000,"gstRate":0.05,"stock":10}'
curl -s localhost:3013/v1/orders -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"clientOrderId":"c1","outletId":"outlet-1","currency":"INR","lines":[{"sku":"A","qty":2}]}'
curl -s localhost:3013/v1/stock/A -H "Authorization: Bearer $TOKEN"   # {"sku":"A","qty":8}
```

## Why overselling is impossible

Stock is decremented with an atomic conditional UPDATE:

```sql
UPDATE stock_position SET qty = qty - $qty
WHERE sku = $sku AND qty >= $qty RETURNING qty;
```

If it affects no row, stock was insufficient and the **whole order transaction
rolls back** (all-or-nothing). Under concurrency, only one of two racing reps
can win the last unit. A `qty >= 0` CHECK is the backstop. Offline replay is
idempotent via `UNIQUE(tenant_id, client_order_id)`.

## Tests

```bash
npm test                                 # in-memory unit tests
DATABASE_URL=postgres://... npm test     # + Postgres integration (allocation, rollback, RLS)
```
