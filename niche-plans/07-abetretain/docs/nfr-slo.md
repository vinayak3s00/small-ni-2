# AbetRetain — NFRs & SLOs

Inherits [baseline SLOs](../../00-platform-baseline/README.md#6-non-functional-requirements-baseline-slos).

| Metric | Target |
|--------|--------|
| Order webhook ingest | 10k events/min, buffered, zero loss |
| Journey idempotency | 100% (dedupe on order id + event) |
| Support first-response | p95 < 2 s |
| Frequency-cap compliance | 0 over-send violations |
| Scoring freshness | ≤ 30 s on new order signals |
