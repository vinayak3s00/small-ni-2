# AbetPartner — Data Model

> PostgreSQL 16, RLS. Introduces hierarchy above `tenant`.

```
partner(id, name, custom_domain, branding jsonb, billing_plan)
workspace(id, partner_id, tenant_id, client_name, status)   -- each maps to an isolated tenant
partner_user(id, partner_id, email, role[owner|manager|analyst])
workspace_grant(id, partner_id, workspace_id, scope jsonb)   -- what the partner may see per client
sender_identity(id, tenant_id, channel[email|whatsapp], domain_or_number, reputation)
usage_rollup(id, partner_id, workspace_id, period, metered jsonb, cost_minor, margin_minor)
report_template(id, partner_id, name, branding jsonb, layout jsonb)
```

Cross-workspace reads by partner users are constrained by `workspace_grant.scope` and always audited.
