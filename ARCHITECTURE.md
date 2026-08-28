<!--
Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
Abetworks Proprietary and Confidential.
-->
# Abetworks Platform — Architecture & Onboarding

This is the map a new engineer needs to be productive in a day: what exists, how
a request flows, the conventions every service shares, and how to run, test, and
ship. Deep detail lives in each area's own README; this ties them together.

## 1. What this repo is

A portfolio of Abetworks products delivered as **independent services on one
shared platform**. Nine niche products are documented under `niche-plans/`; the
ones that need durable state are implemented as production-grade services, and
`platform/` provides the cross-cutting deploy / SLA / billing / API layer.

```
small-ni-2/
├── niche-plans/
│   ├── 00-platform-baseline/packages/core   # @abetworks/core — shared library
│   ├── 01-vertical-ai-agent-blueprints/…    # AbetVerticals (core-crm, scoring, agent, attribution)
│   ├── 02-abettrust/…                        # AbetTrust (kyc, audit-evidence, policy-engine)
│   ├── 03-abetconcierge/… 04-abetvoice/…     # AbetConcierge, AbetVoice
│   ├── 05-abetmigrate/… 06-abetpartner/…     # AbetMigrate, AbetPartner
│   └── 07-abetretain/… 08-abetfield/…        # AbetRetain, AbetField
├── platform/
│   ├── helm/         # abet-service (per service) + abet-gateway (ingress)
│   ├── api/          # aggregated OpenAPI contract for the public API
│   ├── api-tools/    # OpenAPI validator + gateway drift guard
│   ├── sla/          # SLOs, Prometheus alert rules, published SLA
│   └── billing/      # @abetworks/billing — plans, metering, invoicing
├── demo/             # one-command Postgres + all services + smoke test
└── scripts/          # header check, test runner, license tooling
```

## 2. System at a glance

```
                          ┌──────────────────────────┐
   client ── HTTPS ──▶    │  abet-gateway (Ingress)  │  api.abetworks.in
                          │  TLS · rate limit · routes│  X-Request-Id
                          └────────────┬─────────────┘
             ┌───────────────┬─────────┼─────────┬───────────────┐
             ▼               ▼         ▼         ▼               ▼
        core-crm       audit-evidence kyc-svc  order-svc   partner-admin-svc …
        (+ scoring,     attribution                sync-gateway
         agent AI)
             │  each service:                     │
             │   • verifies tenant JWT            │
             │   • runs in tenant context (RLS)   │
             ▼                                     ▼
        PostgreSQL (per service, Row-Level Security)   ── isolates every tenant
             │
             └── emits meter events ─▶ @abetworks/billing ─▶ invoices
```

- **7 DB-backed services** persist to their own PostgreSQL database with
  Row-Level Security. **5 AI services** (scoring, agent-orchestrator,
  concierge-agent, policy-engine, voice-orchestrator) are stateless.
- Auth is enforced **in each service** (tenant JWT), not only at the edge —
  defense in depth, so a compromised gateway can't bypass tenant isolation.

## 3. The shared library — `@abetworks/core`

Every TypeScript service builds on it; the Python services mirror the relevant
pieces (`abet_meter.py`). What it provides:

| Module | Purpose |
|--------|---------|
| `tenant-context` | `runWithPrincipal` / `getPrincipal` — async-local tenant propagation |
| `rls` | `withTenantScope` — opens a tx, sets `app.tenant_id`, drops to a non-superuser role so **Postgres RLS is actually enforced** |
| `auth` | `verifyToken` / `parseBearer` — tenant JWT verification |
| `logger` | structured JSON logs, auto tenant/actor correlation, never throws |
| `http` | `AppError` + `toErrorResponse` (one error shape, hides internals), `requestIdFrom`, `readiness` |
| `audit` | append-only audit event logging |
| `metering` | `MeterEmitter` — tenant-stamped, idempotent, billable-usage events |

## 4. Conventions every service follows

1. **Multi-tenant isolation** is the DB's job. Services never filter by tenant
   in SQL; they run each operation in `withTenantScope`, and RLS policies keyed
   on `current_setting('app.tenant_id')` do the isolation. (See any
   `migrations/0001_init.sql`.)
2. **One error shape** everywhere: `{ error: { code, message, details, requestId } }`.
   Throw an `AppError`; the central error handler maps it. Unknown errors become
   a generic 500 — internal details go to logs, never to clients.
3. **Health**: `/healthz` = liveness; `/readyz` = a real dependency ping
   (returns 503 when degraded). Kubernetes probes use both.
4. **Correlation**: a request id is bound per request (from `X-Request-Id` or
   minted), echoed in the response header, and stamped on every log line.
5. **Billing**: any billable action calls `meter.count(...)`; only successful,
   tenant-scoped, non-duplicate actions are counted (idempotent by `eventId`).
6. **Storeable services** expose an in-memory store (tests/dev) and a Postgres
   store behind one interface; `DATABASE_URL` selects the backend at boot.
7. **Every source file carries the proprietary header** (enforced in CI).

## 5. Request lifecycle (a create, end to end)

1. Client → gateway (`POST /v1/records`). Edge applies TLS, rate limit, sets `X-Request-Id`.
2. Gateway routes by path prefix to `core-crm`.
3. `onRequest` hook: verify JWT → `Principal`; bind a child logger with the request id.
4. Handler runs inside `runWithPrincipal` → `withTenantScope` opens a tx, sets
   `app.tenant_id`, `SET LOCAL ROLE app_rls`.
5. The insert is RLS-scoped; an audit event is appended; a `records` meter event
   is emitted (idempotent on the new row id).
6. `onResponse` hook logs method/url/status/latency with the request id.
7. Errors anywhere → central handler → the one error shape + correct status.

## 6. Run it

```bash
# Full sales demo: Postgres + all services + end-to-end smoke test
docker compose -f demo/docker-compose.yaml up --build
bash demo/smoke.sh

# One TypeScript service (build shared lib once, then the service)
cd niche-plans/00-platform-baseline/packages/core && npm i && npm run build
cd ../../../../01-vertical-ai-agent-blueprints/scaffolding/services/core-crm
npm i && npm run build && npm start           # in-memory unless DATABASE_URL set

# One Python service
cd niche-plans/01-vertical-ai-agent-blueprints/scaffolding/services/scoring-svc
uv venv && uv pip install -e ".[dev]" && uv run uvicorn app:app --app-dir src
```

## 7. Test it

```bash
bash scripts/run_all_tests.sh          # core lib + every service + platform package (26 suites)
bash scripts/check_license_headers.sh  # proprietary header enforcement
node platform/api-tools/dist/check.js  # OpenAPI valid + covers all gateway routes
```

## 8. Ship it

```bash
# Per service (values hold image/scale; secrets hold DATABASE_URL + JWT)
helm upgrade --install core-crm platform/helm/abet-service \
  -f platform/helm/values/core-crm.yaml -n abetworks
# The single API front door
helm upgrade --install abet-gateway platform/helm/abet-gateway \
  -f platform/helm/abet-gateway/values.yaml -n abetworks
```

## 9. CI (gates every PR)

`.github/workflows/ci.yml` runs: proprietary-header check · full test suite ·
per-service **Postgres integration** (matrix) · **helm-lint** (renders every
chart) · **OpenAPI** spec + gateway-drift check. A PR merges only when all are
green.

## 10. Where to go deeper

- Product plans & the runnable-implementation table → [`niche-plans/README.md`](./niche-plans/README.md)
- Deploy / SLA / billing → [`platform/README.md`](./platform/README.md)
- The public API contract → [`platform/api/openapi.yaml`](./platform/api/openapi.yaml)
- Any service's own `README.md` for its specifics (guarantees, endpoints, tests).
