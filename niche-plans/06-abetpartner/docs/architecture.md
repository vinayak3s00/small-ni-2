# AbetPartner — Architecture (production-grade)

> Built on the [Platform Baseline](../../00-platform-baseline/README.md). Adds a **hierarchical tenancy** layer (partner → client workspaces).

## 1. Tenancy hierarchy

```
partner (agency)
  ├── workspace (client A)   <- isolated tenant, RLS
  ├── workspace (client B)
  └── workspace (client C)
partner-level: branding, billing rollup, cross-workspace reporting (permission-gated)
```

- Each client workspace is a full tenant (RLS-isolated). The partner is a **super-tenant** with scoped, permissioned visibility across its workspaces — never into raw client PII unless the client grants it.
- **Sending-domain isolation:** each client gets isolated email/WhatsApp sender identities so one client's reputation can't harm another's.

## 2. Services (deltas)

| Service | Lang | Role |
|---------|------|------|
| partner-admin-svc | NestJS | Provision workspaces, roles, quotas |
| branding-svc | NestJS | White-label theme, domain, logo, email templates |
| billing-rollup-svc | NestJS | Per-workspace usage → partner invoice + margin |
| reporting-svc | NestJS | White-labelled cross-client reports |

## 3. Reliability & isolation

- Hard tenant isolation between client workspaces (RLS + per-workspace rate limits + separate sender identities).
- Partner-level actions are audited at both partner and workspace scope.
- Branding served via CDN with per-partner custom domains (ACM certs).
