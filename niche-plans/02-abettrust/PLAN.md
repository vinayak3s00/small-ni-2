# AbetTrust — Compliant AI Agents for Regulated Businesses

> **Product:** AbetTrust · trust.abetworks.in
> **Tier 1.2 · Highest fit** — The explainable, governed, audit-grade layer that lets AI agents operate inside regulated industries (fintech, lending, wealth, broking, insurance, healthcare).
> **Positioning:** "The AI agent that survives your audit."

---

## 1. The problem

Regulated firms want AI agents but can't deploy the shallow WhatsApp bots on the market because those tools:
- hallucinate and can't cite where an answer came from,
- have no field-level permissions (an agent sees everything),
- keep no audit trail of reads/exports,
- store data anywhere, breaking residency rules.

One bad answer or one un-loggable data export becomes a regulatory finding.

## 2. What AbetTrust is

A **governance and compliance layer** that any Abetworks agent (or an external agent via API) runs through. It enforces:

1. **Cited answers only** — responses are grounded in tenant-approved sources with inline citations; ungrounded output is blocked.
2. **Field-level permissions on automations** — the agent can only read/act on fields the role is permitted, enforced at query time.
3. **Immutable audit trail** — every read, write, and export is logged append-only (S3 Object Lock).
4. **Residency + retention** — data pinned to Mumbai; per-industry retention policies.
5. **KYC-aware workflows** — suitability records, disclosure trails, and consent captured as first-class objects.
6. **Explainable decisions** — every score/decision exposes reason codes for review.

## 3. Why Abetworks wins

This is literally the platform's architecture (one permission system, audit logs, residency, explainable AI) packaged and sold as a compliance product. WhatsApp-native competitors cannot match this depth.

## 4. Go-to-market

- **ICP:** NBFCs, lending fintechs, wealth/broking, insurance, diagnostics chains — India-first.
- **Wedge:** sell to the compliance/risk officer, not just sales. "Deploy AI without a regulatory finding."
- **Pricing:** platform fee + per-agent governance seat; enterprise tier with per-tenant KMS keys + dedicated schema.
- **Proof:** SOC 2 Type II roadmap + DPDP alignment attestation; publish the control catalogue.

## 5. Build phases

1. Governance policy engine (field-level + source-grounding enforcement).
2. Audit + evidence export (auditor-ready reports).
3. KYC/suitability object model + disclosure trails.
4. External-agent API (wrap non-Abet agents in the compliance layer).
5. Attestations (SOC 2, DPDP) + control catalogue publication.

## 6. Risks

| Risk | Mitigation |
|------|-----------|
| Regulatory scope creep across sub-industries | Ship policy packs per regulator; don't hand-code each tenant |
| "Compliance theatre" perception | Publish the control catalogue + independent attestation |
| Performance cost of enforcement | Policy decisions cached; enforcement at query layer, not per-field round-trips |
