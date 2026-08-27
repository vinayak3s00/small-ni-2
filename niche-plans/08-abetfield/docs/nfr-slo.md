# AbetField — NFRs & SLOs

Inherits [baseline SLOs](../../00-platform-baseline/README.md#6-non-functional-requirements-baseline-slos).

| Metric | Target |
|--------|--------|
| Offline capability | 100% core actions work with zero connectivity |
| Sync idempotency | 100% (client mutation id) |
| Sync payload | delta-only, compressed, resilient on 2G/3G |
| Conflict resolution | deterministic per-entity policy |
| Concurrent reps | thousands per tenant, batched sync |
| Data durability | on-device WAL + server RPO ≤ 5 min post-sync |
