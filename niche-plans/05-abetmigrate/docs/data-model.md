# AbetMigrate — Data Model

> PostgreSQL 16, RLS by `tenant_id`. Migration is a first-class, auditable object.

```
migration(id, tenant_id, sources jsonb, status[audit|mapping|dual_run|cutover|done|rolled_back], created_at)
source_connection(id, tenant_id, migration_id, kind[salesforce|hubspot|pipedrive|zapier|helpdesk|csv], credentials_ref)
staging_record(id, tenant_id, migration_id, source_kind, source_id, raw jsonb)
field_map(id, tenant_id, migration_id, source_path, target_path, transform, validation)
reconciliation(id, tenant_id, migration_id, metric, source_count, target_count, mismatch jsonb, passed bool)
cutover_batch(id, tenant_id, migration_id, batch_no, upserted int, status)
rollback_entry(id, tenant_id, migration_id, target_entity, target_id, inverse jsonb)  -- reversibility
savings_report(id, tenant_id, migration_id, current_cost_minor, abet_cost_minor, breakdown jsonb)
```

Provenance: every cutover write stores `(source_kind, source_id)` and emits an `audit_event`.
