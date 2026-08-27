# AbetRetain — Data Model

> PostgreSQL 16, RLS by `tenant_id`. Reuses platform `party`/`record`/`conversation`.

```
order(id, tenant_id, party_id, external_id, platform, status, total_minor, currency, placed_at)
fulfilment(id, tenant_id, order_id, carrier, tracking, status, updated_at)
journey_run(id, tenant_id, party_id, journey_id, step, next_at, status)  -- idempotent per order/event
retention_score(id, tenant_id, party_id, ltv_minor, churn_risk, reasons jsonb, refreshed_at)
support_ticket(id, tenant_id, order_id, type[wismo|return|exchange], status, resolution, cited bool)
frequency_ledger(id, tenant_id, party_id, channel, window, count)   -- fatigue caps
```
