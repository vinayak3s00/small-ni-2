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
| AbetTrust | `policy-engine` | Py/FastAPI | PDP: export role checks, field masking, citation-grounding gate | 7 |
| AbetTrust | `audit-evidence-svc` | TS/Fastify | tamper-evident hash-chained audit + evidence packs | 4 |
| AbetConcierge | `quoting-svc` | TS/Fastify | GST-aware multi-currency quotes (minor units) + WhatsApp opt-in guard | 8 |
| AbetVoice | `telephony-svc` | TS/Fastify | DND gate, ungrounded-call escalation, PII-redacted transcripts | 5 |
| AbetMigrate | `mapping-engine` | Py/FastAPI | field mapping, idempotent cutover, reversible rollback journal | 6 |
| AbetPartner | `partner-admin-svc` | TS/Fastify | hierarchical tenancy, scoped grants, billing rollup + margin | 5 |
| AbetRetain | `retention-svc` | Py/FastAPI | idempotent order ingest, explainable LTV/churn, frequency caps | 6 |
| AbetField | `sync-gateway` | TS/Fastify | offline idempotent replay + per-entity conflict resolution | 4 |

**Total: 11 services, 58 tests, all green.**

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
