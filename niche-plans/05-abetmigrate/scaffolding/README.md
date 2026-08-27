# AbetMigrate — Scaffolding

```
scaffolding/
├── services/
│   ├── source-connectors/    # NestJS — SF/HubSpot/Pipedrive/Zapier/helpdesk/CSV
│   ├── mapping-engine/       # Python — schema map + validation
│   ├── reconciliation-svc/   # Python — dual-run compare
│   └── cutover-svc/          # NestJS — idempotent upsert + rollback journal
└── deploy/
    ├── helm/values.yaml
    └── terraform/main.tf
```

Cutover is idempotent (upsert by natural key) and fully reversible via the rollback journal.
