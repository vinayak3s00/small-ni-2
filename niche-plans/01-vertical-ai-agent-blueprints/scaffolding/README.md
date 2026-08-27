# AbetVerticals — Scaffolding

Production-shaped skeleton. Node/NestJS for API services, Python/FastAPI for AI services, Helm + Terraform stubs. Mirrors the [platform baseline](../../00-platform-baseline/README.md) stack.

```
scaffolding/
├── services/
│   ├── core-crm/                 # NestJS — records, pipelines, RLS
│   ├── scoring-svc/              # FastAPI — explainable scoring
│   ├── agent-orchestrator/       # FastAPI — RAG + guardrails + escalation
│   └── booking-svc/              # NestJS — optimistic-locked slots
├── packs/
│   ├── realty/manifest.yaml
│   ├── care/manifest.yaml
│   └── admit/manifest.yaml
├── deploy/
│   ├── helm/values.yaml
│   └── terraform/main.tf
└── docker-compose.dev.yaml       # local: postgres+pgvector, redis, kafka
```

## Quick start (local dev)

```bash
docker compose -f docker-compose.dev.yaml up -d   # postgres(pgvector), redis, kafka
# core-crm
cd services/core-crm && npm i && npm run start:dev
# scoring
cd ../scoring-svc && uv sync && uv run uvicorn app:app --reload
```

See each `manifest.yaml` for the Vertical Intelligence Pack contract.
