# AbetVerticals — NFRs & Scale Math

Inherits [baseline SLOs](../../00-platform-baseline/README.md#6-non-functional-requirements-baseline-slos). Vertical-specific targets:

| Metric | Target |
|--------|--------|
| Speed-to-lead callback (AbetRealty) | < 60 s p95 |
| Chat first-response (all) | < 2 s p95 |
| Scoring freshness | ≤ 30 s |
| Booking double-book rate | 0 (optimistic lock + unique slot constraint) |
| Attribution completeness | > 95% of bookings sourced |

## Scale math (day-1 design point)

- Assume a large developer tenant: 50k portal + ad leads/month ≈ ~1.15/min average, bursty to ~50/min during campaign spikes.
- Ingestion designed for **10k msgs/min** aggregate across tenants → Kafka partitions sized 3× peak.
- Scoring-svc: ~50 ms per score; at 50/min burst per tenant a single pod suffices; autoscale on lag.
- Booking slots: unique constraint `(resource_id, slot_start)` + `version` optimistic lock guarantees zero double-book under concurrency.
