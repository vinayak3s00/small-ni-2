# AbetMigrate — Architecture (production-grade)

> Built on the [Platform Baseline](../../00-platform-baseline/README.md).

## 1. Pipeline

```
Source tools ─▶ source-connectors ─▶ staging (raw, per-source schema, S3 + Postgres)
                                          │
                                          ▼
                                mapping-engine (source schema -> one data model)
                                          │  + validation rules
                                          ▼
                                reconciliation-svc (dual-run compare) ──▶ diff reports
                                          │  operator approves
                                          ▼
                                cutover-svc (batched upsert into core-crm) 
                                          │
                                          ▼
                                rollback-journal (reversible, audited)
```

## 2. Services

| Service | Lang | Role |
|---------|------|------|
| source-connectors | NestJS | Salesforce/HubSpot/Pipedrive/Zapier/helpdesk/CSV extractors |
| mapping-engine | Python | Schema mapping, transforms, validation |
| reconciliation-svc | Python | Dual-run compare, completeness/accuracy reports |
| cutover-svc | NestJS | Idempotent batched upsert, rate-limited |
| savings-report-svc | NestJS | Consolidation cost model + report |

## 3. Reliability

- Every migration is **idempotent** (upsert by natural key) and re-runnable.
- Full **rollback journal**: each write records its inverse; cutover is reversible.
- Reconciliation must pass thresholds before cutover is allowed (gated by operator approval).
- All migrated records carry provenance (source system + source id) in the audit log.
