# AbetVerticals — Data Model

> On PostgreSQL 16 with Row-Level Security (`tenant_id` on every table). Shared core entities + a vertical overlay.

## Core (shared across all verticals)

```
tenant(id, name, residency, tier)
party(id, tenant_id, kind[lead|patient|applicant|partner], name, phones[], emails[], languages[], consent jsonb, created_at)
record(id, tenant_id, party_id, pipeline_id, stage, owner_id, score int, score_reasons jsonb, source, sub_source, created_at, updated_at)
pipeline(id, tenant_id, vertical, stages jsonb)
conversation(id, tenant_id, record_id, channel, status, sla_due_at, assigned_to)
message(id, tenant_id, conversation_id, direction, body, citations jsonb, created_at)
booking(id, tenant_id, record_id, resource_id, slot_start, slot_end, status, version int)   -- optimistic lock
attribution_event(id, tenant_id, record_id, source, campaign, partner_code, weight, occurred_at)  -- append-only
audit_log(id, tenant_id, actor, action[read|write|export], entity, entity_id, at)  -- append-only, Object-Lock cold copy
```

RLS example:

```sql
ALTER TABLE record ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON record
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

## Vertical overlays (added via pack, not schema forks)

| Vertical | Extra entities / fields |
|----------|-------------------------|
| **AbetRealty** | `project`, `unit_inventory`, `channel_partner(code)`; record fields: budget_band, config, possession_pref, loan_need, rera_id |
| **AbetCare** | `provider`, `encounter/intake`, `referral(source→target, status)`, `diagnostic_order`; fields: specialty, tpa/insurer, consent flags |
| **AbetAdmit** | `parent_guardian`, `program`, `counselling_session`, `cohort`; fields: eligibility, financing_need, counsellor_owner |

Overlays are stored as typed JSONB projected into materialized views per vertical for query performance.
