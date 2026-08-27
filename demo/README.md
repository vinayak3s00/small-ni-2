<!--
Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
Abetworks Proprietary and Confidential.
-->
# Abetworks Sales Demo

A one-command, end-to-end demo of the four production-grade Abetworks services
running together on PostgreSQL with per-tenant Row-Level Security. Designed to
show a prospect the platform's guarantees **live**, not on slides.

## What it proves (the buyer's questions, answered on screen)

| Question a buyer asks | Service | What the demo shows |
|-----------------------|---------|---------------------|
| "Will leads actually land in one place?" | **core-crm** (:3001) | A portal lead becomes a CRM record on the shared data model |
| "Can we trust channel-partner payouts?" | **attribution-svc** (:3011) | Multi-touch history → an immutable, append-only attribution ledger |
| "Is it compliant / audit-ready?" | **kyc-svc** (:3007) | KYC lifecycle with a tamper-proof, append-only disclosure trail |
| "Can field reps oversell stock?" | **order-svc** (:3013) | Stock allocation is atomic; overselling is rejected (HTTP 409) |
| "Is our data isolated from other tenants?" | all | Tenant B literally cannot read Tenant A's rows (enforced by the DB) |

## Run it

From the repository root:

```bash
# 1. Bring up Postgres + all four services (each migrates on boot)
docker compose -f demo/docker-compose.yaml up --build

# 2. In another terminal, run the end-to-end scenario
bash demo/smoke.sh
```

Expected tail:

```
DEMO SMOKE: pass=7 fail=0
ALL DEMO CHECKS PASSED
```

## The scenario the smoke test walks through

1. **Lead capture** — a `realty` lead ("Asha Kulkarni", from 99acres) is created in core-crm.
2. **Attribution** — two touches (portal, then channel partner CP-042) are recorded; last-touch resolves the payout to CP-042.
3. **Compliance** — a KYC record goes `pending → submitted → verified`, a risk disclosure is filed, and suitability turns complete. The trail cannot be edited.
4. **Field sales** — a SKU is stocked at 10 units; an order for 2 succeeds (₹252.00 incl. 5% GST), an order for 100 is **rejected**, and stock stays correct at 8.
5. **Isolation** — a second tenant queries core-crm and sees none of the first tenant's data.

## Notes for the demo driver

- All services share one Postgres instance but separate databases; isolation is
  by RLS within each, keyed on the JWT's `tenant_id`.
- The demo JWT secret is `demo-secret` (see compose). Never use demo secrets in
  a real environment.
- Each service can also be run standalone — see its own `README.md`.
