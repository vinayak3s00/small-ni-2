# AbetField — Architecture (production-grade)

> Built on the [Platform Baseline](../../00-platform-baseline/README.md). **Offline-first** is the defining constraint.

## 1. Offline-first sync model

```
Mobile app (Android-first)
  ├── local store (SQLite) — orders, visits, stock, KYC photos
  ├── outbox queue — mutations captured offline
  └── sync-engine (CRDT/LWW + op log)
            │  when online
            ▼
   sync-gateway (NestJS) ── conflict resolution ── core-crm (Postgres RLS)
            │
            ▼
   media pipeline (S3 Mumbai) for photos/signatures
```

- **Conflict strategy:** per-entity — last-writer-wins for simple fields, server-authoritative for stock/inventory, append-only for visit logs.
- **Idempotent sync:** every mutation carries a client-generated id; replays are safe.
- **Delta sync:** only changed rows since last cursor, to survive low-bandwidth rural networks.

## 2. Services (deltas)

| Service | Lang | Role |
|---------|------|------|
| sync-gateway | NestJS | Offline mutation intake, conflict resolution, delta sync |
| route-svc | NestJS | Beat plans, geo check-in, territory |
| order-svc | NestJS | Field orders, GST-aware, stock allocation |
| media-svc | NestJS | Photo/signature capture → S3 |

## 3. Reliability & scale

- Designed for **thousands of field reps** syncing intermittently; sync is batched + compressed.
- Geo check-in verified server-side; offline captures timestamped locally and reconciled on sync.
- Backpressure + retry with exponential backoff on the mobile outbox.
