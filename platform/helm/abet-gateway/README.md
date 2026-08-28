<!--
Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
Abetworks Proprietary and Confidential.
-->
# abet-gateway — the single API front door

One ingress on **`api.abetworks.in`** that TLS-terminates, applies edge
protections, and routes each product's path prefix to its backend Service.
Clients see one API; internally it fans out to the 7 services.

## Deploy

From the repo root (services already deployed via `abet-service`):

```bash
helm upgrade --install abet-gateway platform/helm/abet-gateway \
  -f platform/helm/abet-gateway/values.yaml -n abetworks
```

Assumes an `ingress-nginx` controller and a TLS secret `abet-api-tls`
(cert-manager or uploaded cert).

## Route table

| Path prefix | Service | Product |
|-------------|---------|---------|
| `/v1/records`, `/v1/bookings` | core-crm | AbetVerticals |
| `/v1/attribution` | attribution-svc | AbetVerticals |
| `/v1/audit`, `/v1/evidence` | audit-evidence-svc | AbetTrust |
| `/v1/kyc` | kyc-svc | AbetTrust |
| `/v1/orders`, `/v1/catalog`, `/v1/stock` | order-svc | AbetField |
| `/v1/sync`, `/v1/visits` | sync-gateway | AbetField |
| `/v1/workspaces`, `/v1/billing` | partner-admin-svc | AbetPartner |

## Edge policy (applied to every route)

- **TLS** termination + HTTP→HTTPS redirect; **HSTS** and standard security
  headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`).
- **Rate limiting** per client IP (default 50 rps, burst ×5) — protects the
  platform from abuse before requests reach a service.
- **Body size cap** (default 2m) — guards ingestion endpoints.
- **Correlation**: an `X-Request-Id` is set at the edge and propagated to
  backends, where each service's logger stamps it (see `@abetworks/core`).

Auth stays in the services (each verifies the tenant JWT), so a compromised
edge cannot bypass tenant isolation — defense in depth.

## Adding a route

Append to `routes:` in `values.yaml` (`path` + `service`). Longest-prefix wins
in ingress-nginx, so keep prefixes specific. `helm template` verifies rendering
in CI (`helm-lint` job).
