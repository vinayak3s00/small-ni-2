<!--
Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
Abetworks Proprietary and Confidential.
-->
# Abetworks Platform — Day-1 Launch Kit

Everything needed to take the niche products **live, under SLA, and earning**
from day one. Three layers, each independently usable:

| Layer | Path | Makes it… |
|-------|------|-----------|
| **Deployment** | [`helm/`](./helm) | deployment-ready |
| **SLA / SLO** | [`sla/`](./sla) | reliability-ready (SLA-backed) |
| **Billing** | [`billing/`](./billing) | revenue-ready |

## 1. Deployment-ready (Helm)

One reusable chart (`helm/abet-service`) deploys any service via a small
per-service values file (`helm/values/<service>.yaml`). Each release ships a
Deployment, ClusterIP Service, CPU HorizontalPodAutoscaler, and a
PodDisruptionBudget, with liveness (`/healthz`) and readiness (`/readyz`)
probes wired to the endpoints every service exposes.

```bash
# Render / install a service (secrets hold DATABASE_URL + JWT_SECRET, never values)
helm template core-crm helm/abet-service -f helm/values/core-crm.yaml
helm upgrade --install core-crm helm/abet-service -f helm/values/core-crm.yaml -n abetworks
```

Covered services: core-crm, audit-evidence-svc, kyc-svc, attribution-svc,
order-svc, partner-admin-svc, sync-gateway.

### One API front door — `helm/abet-gateway`

A single ingress on **`api.abetworks.in`** terminates TLS and routes each
product's path prefix to its backend Service, with edge rate limiting, body-size
caps, and security headers. Clients get one API; auth stays in each service
(defense in depth). See [`helm/abet-gateway/README.md`](./helm/abet-gateway/README.md)
for the route table.

```bash
helm upgrade --install abet-gateway helm/abet-gateway -f helm/abet-gateway/values.yaml -n abetworks
```

### One documented API contract — `api/openapi.yaml`

[`platform/api/openapi.yaml`](./api/openapi.yaml) is the authoritative,
machine-readable OpenAPI 3.0 spec for the public API served through the gateway
(all 17 endpoints, the shared error shape, bearer auth, health probes). It's
client-SDK-generatable and kept honest by `@abetworks/api-tools`, which
validates the spec **and asserts it covers every gateway route** (drift guard) —
run in CI so the docs can't rot:

```bash
node platform/api-tools/dist/check.js   # OK: OpenAPI valid and covers all gateway routes.
```

## 2. SLA-ready (SLO + alerting)

- [`sla/slo.yaml`](./sla/slo.yaml) — per-service objectives (availability,
  latency p95, freshness) by criticality tier.
- [`sla/alerts.rules.yaml`](./sla/alerts.rules.yaml) — Prometheus multi-window
  burn-rate + latency + readiness alerts (page vs ticket).
- [`sla/SLA.md`](./sla/SLA.md) — the customer-facing commitment (99.9% / 99.95%)
  and service-credit schedule.

Readiness gating (`/readyz` does a real DB ping → 503 when degraded) + the PDB
mean rollouts and dependency blips don't silently burn the error budget.

## 3. Revenue-ready (metering + billing)

`@abetworks/billing` turns usage into invoices, deterministically and in integer
minor units (paise):

- **Plans** (`pricing.ts`): Free / Growth / Scale / Enterprise — per-seat fee +
  metered dimensions (records, messages, voice minutes, AI actions) each with an
  included allowance and overage rate.
- **Metering** (`metering.ts`): services emit `MeterEvent`s; the aggregator rolls
  them up per tenant, **idempotent by eventId** (at-least-once safe).
- **Invoicing** (`invoice.ts`): `calculateInvoice()` = seat fee + overage + GST;
  `serviceCreditMinor()` applies the SLA credit schedule.

```ts
import { MeterAggregator, calculateInvoice } from '@abetworks/billing';

const agg = new MeterAggregator();
agg.ingest({ eventId: 'e1', tenantId: 't1', meter: 'records', quantity: 12000, at: now });
const invoice = calculateInvoice({ planId: 'growth', seats: 5, usage: agg.usageFor('t1'), gstRate: 0.18 });
```

## Day-1 launch sequence

1. **Provision** per-service Postgres + secrets (`<svc>-db`, `platform-jwt`).
2. **Deploy** each service with its Helm values file; readiness gates traffic.
3. **Wire monitoring**: import `sla/alerts.rules.yaml`; publish `sla/SLA.md`.
4. **Turn on revenue**: services emit meter events; run `calculateInvoice`
   monthly per tenant; apply SLA credits automatically on breach.

Result: every niche is shippable, measurable against a published SLA, and
billing customers — from day one.
