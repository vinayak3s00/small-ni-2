# AbetTrust — Architecture (production-grade)

> Built on the [Platform Baseline](../../00-platform-baseline/README.md). AbetTrust is a **policy-enforcement + evidence** layer that sits in the request path of every agent action.

## 1. Enforcement path (PEP/PDP model)

```
Agent action / API call
      │
      ▼
 [PEP] policy-enforcement-point (in gateway + service sidecar)
      │  asks
      ▼
 [PDP] policy-decision-point (OPA/Rego, per-tenant policy packs)
      │  decision + reasons
      ├── deny ──▶ blocked + audit event
      └── allow ─▶ action proceeds
                     │
   grounding-check ──┤  (RAG: is every claim cited to an approved source?)
                     │      no ──▶ block/rewrite
                     ▼
              audit-log-svc (append-only) ──▶ S3 Object Lock (WORM)
```

- **PDP:** Open Policy Agent (Rego) evaluating per-tenant, per-industry **policy packs** (lending, insurance, health…). Decisions cached in Redis with short TTL.
- **Grounding-check:** intercepts agent output; every factual claim must map to a citation from an approved source or it is blocked/rewritten. Reuses the baseline RAG-svc.
- **Evidence store:** append-only audit in Postgres, mirrored to S3 Object Lock (WORM) for immutability.

## 2. Components

| Service | Lang | Role |
|---------|------|------|
| policy-engine (PDP) | Go/OPA | Evaluate Rego policy packs |
| pep-sidecar | Go | Inline enforcement in each service/gateway |
| grounding-svc | Python | Citation/source-grounding check |
| audit-evidence-svc | NestJS | Append-only audit + auditor export packs |
| kyc-svc | NestJS | KYC/suitability/disclosure objects |
| agent-wrap API | NestJS | Wrap external (non-Abet) agents in the layer |

## 3. Scalability & reliability

- PDP is stateless + horizontally scaled; policy bundles distributed via OCI registry, hot-reloaded.
- Decision cache keeps p95 enforcement overhead < 15 ms.
- Audit writes are async (Kafka) with a synchronous durability ack for high-sensitivity actions (exports).
- WORM audit copy guarantees tamper-evidence for regulators.
