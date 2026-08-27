# AbetRetain — Architecture (production-grade)

> Built on the [Platform Baseline](../../00-platform-baseline/README.md).

## 1. Flow

```
Shopify/WooCommerce/Marketplace webhooks ─▶ commerce-connector ─▶ Kafka: orders.events
                                                                      │
                        ┌──────────────────────────────────────────────┼───────────────┐
                        ▼                                                ▼               ▼
                journey-engine (AbetFlow)                        ltv-churn-scoring   support-agent (Py)
                  post-purchase cadence                          (explainable)        WISMO/returns, cited
                        │                                                │
                        ▼                                                ▼
                 channel-gw (WhatsApp) ◀───────────────────────── one customer record (core-crm)
```

## 2. Services (deltas)

| Service | Lang | Role |
|---------|------|------|
| commerce-connector | NestJS | Shopify/Woo/marketplace order + fulfilment events |
| journey-engine | (AbetFlow) | Post-purchase + retention cadences |
| support-agent | Python | WISMO/returns/exchanges, cited, escalation |
| ltv-churn-svc | Python | Explainable LTV/churn scoring |

## 3. Reliability & scale

- Order webhooks buffered in Kafka; journeys are event-driven and idempotent (dedupe on order id + event type).
- Frequency caps enforced centrally to prevent WhatsApp fatigue/throttling.
- Support-agent confidence-gated; low confidence → human with summary.
