# Abetworks Platform Baseline (Shared Foundation)

> **Applies to:** every Abetworks product in this repository.
> **Company:** Abetworks — abetworks.in
> **Principle:** *One data model, one permission system, one login.* Every product below is a module on this shared spine, not a standalone silo. Production-grade and horizontally scalable from day one.

---

## 1. Product family & naming

All products ship under the **Abet-** family brand, addressable at `*.abetworks.in`.

| # | Product name | Domain | One-line | Niche |
|---|--------------|--------|----------|-------|
| 01 | **AbetVerticals** (AbetRealty / AbetCare / AbetAdmit) | verticals.abetworks.in | Deep vertical AI agents for Real Estate, Healthcare, Education | Tier 1.1 |
| 02 | **AbetTrust** | trust.abetworks.in | Explainable, governed, audit-grade AI compliance layer | Tier 1.2 |
| 03 | **AbetConcierge** | concierge.abetworks.in | WhatsApp-first AI concierge for Indian SMBs | Tier 1.3 |
| 04 | **AbetVoice** | voice.abetworks.in | Multilingual AI voice + telephony agents | Tier 2.4 |
| 05 | **AbetMigrate** | migrate.abetworks.in | Consolidation-as-a-Service migration platform | Tier 2.5 |
| 06 | **AbetPartner** | partner.abetworks.in | White-label multi-tenant suite for agencies | Tier 2.6 |
| 07 | **AbetRetain** | retain.abetworks.in | Retention & CX AI for D2C / e-commerce | Tier 3.7 |
| 08 | **AbetField** | field.abetworks.in | Offline-first field-sales capture for FMCG/distribution | Tier 3.8 |

> Sub-brands for the three verticals: **AbetRealty**, **AbetCare**, **AbetAdmit**.

---

## 2. Reference architecture (all products inherit)

```
                         ┌──────────────────────────────────────────────┐
   Channels              │              Abetworks Cloud (AWS ap-south-1) │
 ┌──────────┐            │                                              │
 │ WhatsApp │───┐        │  ┌────────────┐   ┌───────────────────────┐  │
 │ Voice    │───┤        │  │ API Gateway│──▶│  Identity & RBAC (IAM)│  │
 │ Email    │───┼──▶ Ingress ─▶│  (Kong / │   │  field-level perms    │  │
 │ Web/Chat │───┘        │  │  ALB)      │   └───────────────────────┘  │
 └──────────┘            │  └─────┬──────┘                              │
                         │        ▼                                     │
                         │  ┌──────────────── Service mesh (EKS) ─────┐ │
                         │  │ core-crm │ outreach │ agent-orchestrator│ │
                         │  │ inbox    │ automation(flow) │ analytics │ │
                         │  │ scoring  │ channel-gw │ audit-log       │ │
                         │  └────┬─────────┬──────────────┬───────────┘ │
                         │       │ events  │              │             │
                         │  ┌────▼─────────▼──────────────▼──────────┐  │
                         │  │  Event bus (Kafka / MSK)  ── async work │  │
                         │  └────┬───────────────┬──────────┬────────┘  │
                         │       ▼               ▼          ▼           │
                         │  ┌─────────┐   ┌────────────┐ ┌───────────┐  │
                         │  │Postgres │   │ Vector DB  │ │  Redis    │  │
                         │  │(RLS,    │   │ (RAG /     │ │ (scoring  │  │
                         │  │ tenant  │   │  citations)│ │  cache,   │  │
                         │  │ isolat.)│   │            │ │  queues)  │  │
                         │  └─────────┘   └────────────┘ └───────────┘  │
                         │       │  S3 (objects, exports, audit cold)   │
                         └───────┼──────────────────────────────────────┘
                                 ▼
                        LLM providers + self-hosted models (guardrailed, cited)
```

**Style:** modular services on a shared data model, event-driven for agent/automation work, multi-tenant with strict isolation.

---

## 3. Canonical tech stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Cloud / region | **AWS `ap-south-1` (Mumbai)** | Data residency in Mumbai is a core promise |
| Compute | **EKS (Kubernetes)** + Fargate for bursty jobs | Horizontal autoscaling from day one |
| API services | **TypeScript / Node.js (NestJS)** | Consistent, typed, fast to staff |
| AI / agents | **Python (FastAPI)** — RAG, scoring, eval harness | Ecosystem for ML + orchestration |
| Primary DB | **PostgreSQL 16** with **Row-Level Security** | One data model + tenant isolation |
| Vector store | **pgvector** (start) → dedicated (Qdrant/OpenSearch) at scale | Citations / approved-source RAG |
| Cache / queue | **Redis** (ElastiCache) | 30-sec scoring refresh, rate limiting |
| Event bus | **Kafka (MSK)** | Async agent + AbetFlow workloads |
| Object store | **S3 (Mumbai)** | Exports, media, cold audit logs |
| Search | **OpenSearch** | Inbox / analytics search |
| IaC | **Terraform** | Reproducible, reviewable infra |
| CI/CD | **GitHub Actions** → EKS (Helm), blue-green/canary | Safe, frequent releases |
| Observability | **OpenTelemetry** → Prometheus/Grafana + Loki + Tempo | Traces, metrics, logs |

---

## 4. Multi-tenancy (from day one)

- **Isolation model:** shared schema + **PostgreSQL Row-Level Security** keyed on `tenant_id`; every table carries `tenant_id`; every query runs under a tenant-scoped role. Enterprise tenants can be promoted to a dedicated schema/DB.
- **Tenant context** is derived from the authenticated principal at the gateway and propagated as a signed context through every service and event.
- **Noisy-neighbour protection:** per-tenant rate limits, quotas, and queue partitions.
- **Data residency:** all tenant data stays in `ap-south-1`; residency is a tenant attribute.

---

## 5. AI governance standard (non-negotiable, inherited by all)

1. **Cited answers only** — agents respond strictly from tenant-approved sources and attach citations; ungrounded generation is blocked.
2. **Explainable scoring** — lead/intent scores refresh in ~30s and expose their reasoning; humans can correct and the model learns.
3. **Guardrails + eval harness** — every agent has input/output guardrails and a regression eval suite gating releases.
4. **Human escalation** — every agent can escalate with a conversation summary; no dead ends.
5. **Governance survives review** — field-level permissions apply to automations too; audit logs cover reads and exports; deprecations get 12 months' notice.

---

## 6. Non-functional requirements (baseline SLOs)

| NFR | Target |
|-----|--------|
| Availability | **99.9%** (core), 99.95% for enterprise tier |
| API latency | p95 < 300 ms (read), < 800 ms (write) |
| Agent first-response | < 2 s (chat), < 60 s (speed-to-lead callback) |
| Scoring freshness | ≤ 30 s |
| Horizontal scale | Stateless services autoscale on CPU/RPS; DB read replicas + partitioning |
| Durability | RPO ≤ 5 min, RTO ≤ 60 min; PITR backups |
| Throughput target (day-1 design) | 10k msgs/min ingest, 1k concurrent agent sessions per tenant tier |

---

## 7. Security & compliance (DPDP-aligned)

- **AuthN/Z:** OIDC SSO + SCIM; RBAC with field-level permissions; short-lived tokens; per-tenant API keys.
- **Encryption:** TLS 1.2+ in transit; AES-256 at rest (KMS, Mumbai); per-tenant key option for enterprise.
- **Audit:** append-only audit log of reads, writes, exports; immutable retention in S3 Object Lock.
- **Data protection:** consent capture, configurable retention, data-subject request tooling — aligned to India's **DPDP Act**.
- **Secrets:** AWS Secrets Manager; no secrets in code or images.
- **Supply chain:** signed images, SBOM, dependency scanning in CI.

---

## 8. Repository / package convention (every product folder)

```
NN-<product>/
├── README.md            # product overview + this baseline reference
├── PLAN.md              # business + GTM plan
├── docs/
│   ├── architecture.md  # product-specific architecture on the baseline
│   ├── data-model.md    # entities, ERD, RLS notes
│   ├── nfr-slo.md        # product SLOs + scale math
│   └── security.md      # product compliance profile
├── api/openapi.yaml     # API contract
└── scaffolding/         # service skeleton, Helm/Terraform stubs, env
```

Each product's docs **reference this baseline** rather than repeating it, and only document deltas.
