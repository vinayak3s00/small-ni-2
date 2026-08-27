# AbetMigrate — NFRs & SLOs

Inherits [baseline SLOs](../../00-platform-baseline/README.md#6-non-functional-requirements-baseline-slos).

| Metric | Target |
|--------|--------|
| Migration idempotency | 100% (re-runnable, upsert by natural key) |
| Reconciliation accuracy gate | must pass before cutover (operator-approved) |
| Rollback | full reversibility via rollback journal |
| Throughput | 1M+ records per migration, batched, rate-limited to source API limits |
| Data provenance | 100% migrated records carry source system + id |
