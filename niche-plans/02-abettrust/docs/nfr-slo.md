# AbetTrust — NFRs & SLOs

Inherits [baseline SLOs](../../00-platform-baseline/README.md#6-non-functional-requirements-baseline-slos).

| Metric | Target |
|--------|--------|
| Policy decision overhead | p95 < 15 ms (cached), < 60 ms (cold) |
| Grounding-check latency | p95 < 400 ms |
| Audit durability | synchronous ack for exports; RPO 0 for audit events |
| Evidence-pack generation | on-demand, < 5 min for a quarter |
| Availability | 99.95% (enforcement is in the critical path) |

Scale math: enforcement is stateless; a decision cache hit is O(1). Sized for 10k decisions/sec/tenant-tier via horizontal PDP replicas + local caches.
