# AbetTrust — Data Model

> PostgreSQL 16, RLS by `tenant_id`. Governance objects are first-class.

```
policy_pack(id, tenant_id, industry, version, rego_bundle_ref, effective_from)
policy_decision(id, tenant_id, actor, action, resource, entity_id, decision[allow|deny], reasons jsonb, at)  -- append-only
audit_event(id, tenant_id, actor, action[read|write|export], entity, entity_id, fields text[], at)  -- append-only, WORM mirror
grounding_check(id, tenant_id, message_id, claims jsonb, citations jsonb, passed bool, at)
kyc_record(id, tenant_id, party_id, status, documents jsonb, verified_at, verified_by)
suitability_record(id, tenant_id, party_id, product, assessment jsonb, disclosures jsonb, at)
consent(id, tenant_id, party_id, purpose, channel, granted bool, granted_at, revoked_at)
evidence_pack(id, tenant_id, period, generated_at, s3_ref, hash)  -- auditor export bundle
```

Key guarantees:
- `audit_event` and `policy_decision` are **append-only** (no update/delete grants) and mirrored to S3 Object Lock.
- `evidence_pack.hash` chains packs for tamper-evidence.
- Field-level permission checks reference the `fields` array so exports are auditable at column granularity.
