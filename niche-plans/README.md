# Abetworks — New Product Portfolio (Niche Expansion)

> **Company:** Abetworks · [abetworks.in](https://abetworks.in)
> Eight new products expanding the Abetworks AI business suite into defensible niches — each **production-grade and horizontally scalable from day one**, built on one shared platform: *one data model, one permission system, one login.*

---

## The portfolio

| # | Product | What it is | Tier | Domain |
|---|---------|-----------|------|--------|
| [00](./00-platform-baseline/README.md) | **Platform Baseline** | Shared architecture, naming, tech stack, NFRs, security | — | — |
| [01](./01-vertical-ai-agent-blueprints/README.md) | **AbetVerticals** (AbetRealty · AbetCare · AbetAdmit) | Deep vertical AI agents for Real Estate, Healthcare, Education | 1 | verticals.abetworks.in |
| [02](./02-abettrust/README.md) | **AbetTrust** | Explainable, governed, audit-grade AI compliance layer | 1 | trust.abetworks.in |
| [03](./03-abetconcierge/README.md) | **AbetConcierge** | WhatsApp-first AI concierge for Indian SMBs (graduation path) | 1 | concierge.abetworks.in |
| [04](./04-abetvoice/README.md) | **AbetVoice** | Multilingual AI voice & telephony agents | 2 | voice.abetworks.in |
| [05](./05-abetmigrate/README.md) | **AbetMigrate** | Consolidation-as-a-Service migration platform | 2 | migrate.abetworks.in |
| [06](./06-abetpartner/README.md) | **AbetPartner** | White-label multi-tenant suite for agencies | 2 | partner.abetworks.in |
| [07](./07-abetretain/README.md) | **AbetRetain** | Retention & CX AI for D2C / e-commerce | 3 | retain.abetworks.in |
| [08](./08-abetfield/README.md) | **AbetField** | Offline-first field-sales capture for FMCG/distribution | 3 | field.abetworks.in |

---

## Why these, and why now

- **Vertical AI wins in 2026** — industry-specific agents beat horizontal tools on margin, retention, and defensibility. → AbetVerticals.
- **Governance is the moat regulated buyers pay for** — cited answers, field-level permissions, audit trails, Mumbai residency. → AbetTrust.
- **WhatsApp is the Indian entry point, but the market's tools are shallow** — Meta/Wati/AiSensy own the top of funnel; a real revenue engine underneath is the differentiator. → AbetConcierge.
- **Voice is the hottest AI infra lane** and the one category the suite lacks. → AbetVoice.
- **Switching cost is the #1 objection to consolidation** — turn it into a paid on-ramp. → AbetMigrate.
- **Agencies are distribution** — white-label to multiply reach. → AbetPartner.
- **Emerging-market-native capabilities** (retention on WhatsApp, offline field capture) are hard for global CRMs to copy. → AbetRetain, AbetField.

---

## Shared engineering principles (every product inherits)

1. **One data model** — every product is a module on the shared spine, not a silo.
2. **Multi-tenant from day one** — PostgreSQL Row-Level Security, per-tenant quotas, Mumbai residency.
3. **Governed, explainable AI** — cited answers only, ~30s explainable scoring, guardrails + eval gates, human escalation.
4. **Scalable by design** — stateless services on EKS, event-driven (Kafka), autoscaling, 99.9%+ SLOs.
5. **DPDP-aligned security** — field-level RBAC, append-only audit (WORM), encryption, consent + retention.

See [`00-platform-baseline`](./00-platform-baseline/README.md) for the full shared foundation. Each product folder contains:

```
NN-<product>/
├── README.md        # overview
├── PLAN.md          # business + GTM
├── docs/            # architecture, data-model, nfr-slo, security
├── api/openapi.yaml # API contract
└── scaffolding/     # service skeletons, IaC + Helm stubs
```

---

## Suggested build sequence

1. **AbetVerticals — AbetRealty first** (proven speed-to-lead ROI, existing niche claim).
2. **AbetTrust** (unlocks regulated verticals incl. AbetCare).
3. **AbetVoice** (multiplies AbetRealty + AbetCare value).
4. **AbetConcierge** (top-of-funnel land-and-expand).
5. **AbetMigrate** (removes the switching objection for all of the above).
6. **AbetPartner**, then **AbetRetain** / **AbetField** as demand warrants.


---

## Runnable reference implementation

Beyond the design docs, each product ships **runnable, tested service code** under its `scaffolding/services/` folder, all built on the shared `@abetworks/core` library (`00-platform-baseline/packages/core`).

| Product | Service | Stack | What it demonstrates | Tests |
|---------|---------|-------|----------------------|-------|
| baseline | `@abetworks/core` | TS lib | tenant context (AsyncLocalStorage), RLS scope helper, JWT auth, append-only audit | 5 |
| AbetVerticals | `core-crm` | TS/Fastify | auth + tenant isolation + no-double-book optimistic lock | 3 |
| AbetVerticals | `scoring-svc` | Py/FastAPI | explainable scoring with ordered reason codes, per-vertical packs | 5 |
| AbetVerticals | `agent-orchestrator` | Py/FastAPI | guardrail-first + RAG cited answers + escalation-with-summary | 6 |
| AbetVerticals | `attribution-svc` | TS/Fastify | append-only attribution ledger, first/last/linear models | 6 |
| AbetTrust | `policy-engine` | Py/FastAPI | PDP: export role checks, field masking, citation-grounding gate | 7 |
| AbetTrust | `audit-evidence-svc` | TS/Fastify | tamper-evident hash-chained audit + evidence packs | 4 |
| AbetTrust | `kyc-svc` | TS/Fastify | KYC/suitability state machine + append-only disclosure trail | 6 |
| AbetConcierge | `quoting-svc` | TS/Fastify | GST-aware multi-currency quotes (minor units) + WhatsApp opt-in guard | 8 |
| AbetConcierge | `concierge-agent` | Py/FastAPI | cross-channel identity unification + commerce intent routing | 8 |
| AbetConcierge | `channel-gw` | TS/Fastify | WhatsApp verify handshake + HMAC signature + inbound normalize | 7 |
| AbetVoice | `telephony-svc` | TS/Fastify | DND gate, ungrounded-call escalation, PII-redacted transcripts | 5 |
| AbetVoice | `voice-orchestrator` | Py/FastAPI | turn-taking state machine with barge-in handling | 8 |
| AbetMigrate | `mapping-engine` | Py/FastAPI | field mapping, idempotent cutover, reversible rollback journal | 6 |
| AbetMigrate | `reconciliation-svc` | Py/FastAPI | dual-run compare + hard/soft metrics + cutover gate | 5 |
| AbetMigrate | `source-connectors` | Py/FastAPI | CSV/HubSpot extractors → staging records with provenance | 7 |
| AbetPartner | `partner-admin-svc` | TS/Fastify | hierarchical tenancy, scoped grants, billing rollup + margin | 5 |
| AbetPartner | `reporting-svc` | TS/Fastify | grant-gated, white-labelled report generation | 3 |
| AbetRetain | `retention-svc` | Py/FastAPI | idempotent order ingest, explainable LTV/churn, frequency caps | 6 |
| AbetRetain | `journey-engine` | Py/FastAPI | event-driven post-purchase cadence, idempotent + capped | 6 |
| AbetRetain | `support-agent` | Py/FastAPI | WISMO/returns cited resolution + confidence-gated escalation | 8 |
| AbetField | `sync-gateway` | TS/Fastify | offline idempotent replay + per-entity conflict resolution | 4 |
| AbetField | `route-svc` | TS/Fastify | beat plans + haversine geo-verified check-in | 6 |
| AbetField | `order-svc` | TS/Fastify | GST-aware field orders + all-or-nothing stock allocation | 5 |

**Total: 24 services, 141 tests, all green.** All source files carry the Abetworks proprietary header (see `LICENSE`).

### Production-grade, sales-ready services

Seven services are backed by **real PostgreSQL with per-tenant Row-Level Security**,
SQL migrations, Docker Compose, and DB integration tests — not in-memory demos:

| Service | Port | Production guarantee (DB-enforced) |
|---------|------|-------------------------------------|
| `core-crm` | 3001 | RLS tenant isolation + no-double-book unique index |
| `audit-evidence-svc` | 3002 | Tamper-evident WORM hash chain (trigger blocks UPDATE/DELETE) |
| `attribution-svc` | 3011 | Append-only ledger (trigger blocks UPDATE/DELETE) |
| `kyc-svc` | 3007 | KYC state machine + append-only disclosure trail |
| `order-svc` | 3013 | Atomic stock allocation — overselling impossible |
| `partner-admin-svc` | 3006 | Hierarchical tenancy — partner is the RLS boundary |
| `sync-gateway` | 3008 | Durable append-only op-log — idempotent replay survives restarts |

Run the whole thing as a **one-command sales demo** (see [`demo/`](../demo/README.md)):

```bash
docker compose -f demo/docker-compose.yaml up --build
bash demo/smoke.sh    # 7 end-to-end checks: lead -> attribution -> KYC -> order -> isolation
```

### Continuous integration

`.github/workflows/ci.yml` runs on every push and PR:
- **`license-headers`** — `scripts/check_license_headers.sh` fails the build if any source file is missing the proprietary header.
- **`tests`** — `scripts/run_all_tests.sh` builds `@abetworks/core` then runs every TS (vitest) and Python (pytest) suite; the job fails if any suite fails.
- **`db-integration`** — a matrix job spins up Postgres and runs the real integration tests for `core-crm`, `audit-evidence-svc`, `attribution-svc`, `kyc-svc`, `order-svc`, `partner-admin-svc`, and `sync-gateway`.

Run the same checks locally:
```bash
bash scripts/check_license_headers.sh   # header enforcement
bash scripts/run_all_tests.sh           # all service suites
```

### Running a service locally

TypeScript service (Node 22 via nvm):
```bash
# build the shared lib once
cd niche-plans/00-platform-baseline/packages/core && npm install && npm run build
# then any TS service
cd ../../../../01-vertical-ai-agent-blueprints/scaffolding/services/core-crm
npm install && npm run build && npm test && npm start
```

Python service (uv):
```bash
cd niche-plans/01-vertical-ai-agent-blueprints/scaffolding/services/scoring-svc
uv venv && uv pip install -e ".[dev]"
uv run pytest -q
uv run uvicorn app:app --app-dir src --reload
```
