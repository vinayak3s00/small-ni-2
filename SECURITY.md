<!--
Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
Abetworks Proprietary and Confidential.
-->
# Abetworks Platform — Security & Deployment Invariants

The platform is multi-tenant and internet-reachable, so a handful of deployment
invariants are non-negotiable. This document records the ones that keep secrets
out of source and force every deployed tier to fail closed rather than fall back
to insecure defaults. Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) for how the
system fits together; this covers the security guarantees and how they are
enforced.

## 1. Secret management

Every auth/signing secret — `JWT_SECRET`, WhatsApp's `WA_VERIFY_TOKEN` and
`WA_APP_SECRET`, and any secret added in future — is resolved through
`requireSecret(name, opts?)` exported by `@abetworks/core`. Services never read
a secret directly off `process.env` with a hardcoded default.

- Secrets **must** be injected via environment variables in every deployed
  environment (typically from a Kubernetes Secret; see the Helm values notes in
  [`ARCHITECTURE.md`](./ARCHITECTURE.md)).
- `requireSecret` accepts an insecure `devDefault` (e.g.
  `requireSecret('JWT_SECRET', { devDefault: 'dev-secret-change-me' })`). That
  default is used **only** when `NODE_ENV` is `development`, `test`, or
  unset/empty. In any other environment a missing secret is a hard error.

## 2. The `NODE_ENV` invariant

This is the invariant to get right. `requireSecret` fails **closed**: when a
required secret is absent, it returns the `devDefault` only for dev/test, and
otherwise throws, so the service refuses to start.

- **Any internet-reachable or shared tier — production, staging, pre-prod, QA —
  MUST set `NODE_ENV=production`** (or any value that is not `development` /
  `test` and is not unset/empty). With `NODE_ENV` so set, a missing secret makes
  the service fail to boot instead of silently running on a known dev default.
- **Leaving `NODE_ENV` unset (or `development`/`test`) on a deployed tier is a
  misconfiguration.** It re-enables the insecure `devDefault` fallback on a tier
  that should never use it — treat it as a deployment defect, not a convenience.

In short: dev and test may fall back to a well-known default for convenience;
every real environment must supply the secret and set `NODE_ENV` so that a
missing secret is fatal.

## 3. The CI guard

`scripts/check_secret_fallbacks.sh` (the **Secret fallback guard** job in
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) blocks reintroduction
of hardcoded secret fallbacks. It greps tracked non-test TypeScript source for a
secret-bearing env var (name containing `SECRET`, `TOKEN`, `KEY`, `PASSWORD`,
`PASS`, or `CREDENTIAL`) read off `process.env` with a `??` or `||` quoted
string-literal default, and fails the build with a pointer to `requireSecret`.

Scope and limits:

- It intentionally ignores non-secret env defaults such as
  `process.env.PORT ?? 3011`, `process.env.APP_RLS_ROLE ?? 'app_rls'`, and
  `process.env.LOG_LEVEL ?? 'info'`, which are legitimate.
- It skips `*.test.ts` files.
- It is a single-line grep, so a fallback deliberately split across two physical
  lines is not detected. It is a guardrail against regressions, not a substitute
  for using `requireSecret` and code review.
