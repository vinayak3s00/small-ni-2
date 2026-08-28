<!--
Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
Abetworks Proprietary and Confidential.
-->
# Abetworks Service Level Agreement (SLA)

The commitments below are what Abetworks operates to and publishes to customers.
Objectives are defined machine-readably in [`slo.yaml`](./slo.yaml); breaches
page/ticket via [`alerts.rules.yaml`](./alerts.rules.yaml).

## Availability commitment (monthly)

| Plan | Uptime | Monthly error budget | Support response |
|------|--------|----------------------|------------------|
| Growth | 99.9% | ~43m 50s | next business day |
| Scale | 99.95% | ~21m 55s | 4 business hours |
| Enterprise | 99.95% + credits | ~21m 55s | 1 hour, 24×7 |

"Availability" = the ratio of successful (non-5xx) requests over the calendar
month, measured at the platform gateway.

## Latency objectives

- Read APIs: **p95 < 300 ms**.
- Write APIs: **p95 < 800 ms** (audit ingest < 500 ms).
- Attribution reflects a new touch within **30 s** (freshness SLO).

## How it's enforced operationally

1. Every service exposes `/healthz` (liveness) and `/readyz` (dependency
   readiness — a real DB ping). Kubernetes only routes to ready pods, and the
   PodDisruptionBudget keeps capacity during rollouts.
2. Error-budget alerting uses multi-window burn rates: a **fast-burn** page at
   14.4× budget over 5m and a **slow-burn** ticket at 3× over 1h.
3. Latency and readiness alerts (see `alerts.rules.yaml`) catch regressions
   before they exhaust the budget.

## Service criticality

Critical-tier services (core-crm, audit-evidence-svc, kyc-svc, order-svc,
sync-gateway) carry the tightest budgets; standard-tier (attribution-svc,
partner-admin-svc) inherit the 99.9% default. See `slo.yaml` for per-service
targets.

## Service credits (Scale / Enterprise)

| Monthly uptime | Credit (% of monthly fee) |
|----------------|---------------------------|
| < 99.95% and ≥ 99.9% | 10% |
| < 99.9% and ≥ 99.0% | 25% |
| < 99.0% | 50% |
