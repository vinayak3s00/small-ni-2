# AbetField — Scaffolding

```
scaffolding/
├── mobile/                   # Android-first (Kotlin/Flutter) offline-first shell
│   ├── local-store/          # SQLite schema + WAL
│   └── sync-engine/          # outbox, delta pull, conflict handling
├── services/
│   ├── sync-gateway/         # NestJS — idempotent sync + conflict resolution
│   ├── route-svc/            # NestJS — beats, geo check-in
│   └── order-svc/            # NestJS — GST-aware field orders, stock
└── deploy/
    ├── helm/values.yaml
    └── terraform/main.tf
```

Core actions are fully functional offline; `sync-gateway` applies mutations idempotently via `clientMutationId` and returns deltas + conflicts.
