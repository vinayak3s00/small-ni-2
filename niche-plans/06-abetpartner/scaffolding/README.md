# AbetPartner — Scaffolding

```
scaffolding/
├── services/
│   ├── partner-admin-svc/    # NestJS — provision workspaces, roles, quotas
│   ├── branding-svc/         # NestJS — white-label theme + custom domain
│   ├── billing-rollup-svc/   # NestJS — usage metering + margin
│   └── reporting-svc/        # NestJS — white-labelled reports
└── deploy/
    ├── helm/values.yaml
    └── terraform/main.tf     # ACM custom-domain automation
```

Each provisioned workspace is a fully RLS-isolated tenant with its own sender identities.
