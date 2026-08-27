# AbetConcierge — NFRs & SLOs

Inherits [baseline SLOs](../../00-platform-baseline/README.md#6-non-functional-requirements-baseline-slos).

| Metric | Target |
|--------|--------|
| Chat first-response | p95 < 2 s |
| WhatsApp webhook ingest | 10k msgs/min, no drop (Kafka buffered) |
| Quote generation | p95 < 500 ms |
| Template throttle compliance | 0 quality-rating downgrades from over-send |
| Free-tier fairness | per-tenant rate caps, no noisy-neighbour impact |
