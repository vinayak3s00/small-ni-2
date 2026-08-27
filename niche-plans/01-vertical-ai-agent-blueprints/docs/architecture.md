# AbetVerticals — Architecture (production-grade)

> Products: **AbetRealty**, **AbetCare**, **AbetAdmit**. Built on the [Platform Baseline](../../00-platform-baseline/README.md). This document records only the deltas specific to vertical agents.

## 1. Component view

```
Channels (WhatsApp / Voice / Web / Portal webhooks / Ad-lead forms)
        │
        ▼
 channel-gw ──▶ ingestion-normalizer ──▶ Kafka topic: leads.raw
                                             │
        ┌────────────────────────────────────┼───────────────────────┐
        ▼                                     ▼                        ▼
 vertical-intent-svc (Py)         scoring-svc (Py, explainable)   dedupe/identity-svc
   intent + entity packs            30s refresh, reason codes       (one record)
        │                                     │
        ▼                                     ▼
 agent-orchestrator (Py) ──uses──▶ RAG-svc (approved sources + citations)
        │           │
        │           └──▶ guardrails + eval gate
        ▼
 flow-engine (AbetFlow) ──▶ booking-svc (calendar/slots) ──▶ attribution-svc
        │                                                        (real estate CP / campaign)
        ▼
 core-crm (record of truth, Postgres RLS) ──▶ audit-log-svc (append-only)
```

Each vertical loads a **Vertical Intelligence Pack** (config + models + templates + flows) into the same services; the code path is shared, the pack differs.

## 2. Vertical Intelligence Pack (the productization unit)

A versioned bundle, resolved per tenant at runtime:

```
pack/
  manifest.yaml          # vertical id, version, compat range
  intents.yaml           # intents + entities (e.g. site_visit, referral, counselling_slot)
  data-model.overlay.yaml# extra fields/stages layered on core-crm
  templates/             # WhatsApp/voice/email templates (approved, per-language)
  flows/                 # AbetFlow definitions
  scoring.yaml           # signal weights + reason-code catalogue
  knowledge/             # approved-source connectors for RAG
  compliance.yaml        # consent, retention, audit profile for the vertical
  benchmarks.yaml        # the 3–4 published metrics
```

## 3. Scalability & reliability deltas

- **Ingestion** is Kafka-backed; speed-to-lead path is a **low-latency lane** (dedicated partition + Redis) to hit the <60s callback SLO independent of bulk load.
- **Scoring-svc** is stateless and autoscales on queue depth; reason codes are cached in Redis for 30s freshness.
- **Booking-svc** uses optimistic locking on slots to prevent double-booking under concurrency.
- **Attribution-svc** writes immutable attribution events (real-estate CP payout disputes need this).

## 4. Per-vertical guardrails

| Vertical | Hard boundary |
|----------|---------------|
| AbetCare | No clinical advice; clinical intents auto-escalate; cited approved sources only |
| AbetRealty | RERA-aware claims; DND/consent enforced before outbound |
| AbetAdmit | Parent-primary contact for minors; log every fee/scholarship commitment |
