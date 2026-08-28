<!--
Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
Abetworks Proprietary and Confidential.
-->
# Abetworks Platform

Nine niche products on one shared platform — deployment-, SLA-, and
revenue-ready. Services are multi-tenant (PostgreSQL Row-Level Security),
observable, metered for billing, deployed via Helm behind a single API gateway,
and gated by CI on every change.

## Start here

- **New to the codebase?** Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) — the
  system map, request lifecycle, shared conventions, and run/test/deploy guide.
- **Products & runnable services** → [`niche-plans/`](./niche-plans/README.md)
- **Deploy / SLA / billing / API** → [`platform/`](./platform/README.md)
- **Try it in one command** → [`demo/`](./demo/README.md)

## Quick verify

```bash
bash scripts/run_all_tests.sh          # 25 test suites (services + platform)
bash scripts/check_license_headers.sh  # proprietary header enforcement
```

## At a glance

- **12 TypeScript + 11 Python services**; 7 are production-grade on Postgres+RLS.
- Shared library **`@abetworks/core`** (tenant context, RLS, auth, logging,
  errors, metering) — mirrored in Python where needed.
- **`platform/`**: Helm charts + API gateway, SLO/alerts + published SLA, the
  `@abetworks/billing` engine, and an OpenAPI contract with a drift guard.
- CI: header check · full test suite · per-service Postgres integration ·
  helm-lint · OpenAPI drift check.

All source is Abetworks proprietary — see [`LICENSE`](./LICENSE).
