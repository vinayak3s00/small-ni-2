# AbetField — Data Model

> PostgreSQL 16, RLS by `tenant_id`. Mirrored subset in on-device SQLite for offline.

```
outlet(id, tenant_id, name, geo point, beat_id, kyc jsonb)
beat_plan(id, tenant_id, rep_id, outlets uuid[], scheduled_date)
visit(id, tenant_id, rep_id, outlet_id, check_in_at, check_out_at, geo point, notes, offline_captured_at)  -- append-only
field_order(id, tenant_id, visit_id, lines jsonb, total_minor, gst_minor, currency, status, client_mutation_id)  -- idempotent
stock_position(id, tenant_id, outlet_id, sku, qty, counted_at)   -- server-authoritative on conflict
sync_cursor(id, tenant_id, rep_id, last_synced_at, last_op_id)
```

`client_mutation_id` guarantees idempotent replay of offline-captured writes.
