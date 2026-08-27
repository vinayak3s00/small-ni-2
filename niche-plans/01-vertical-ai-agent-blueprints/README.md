# 01 — Vertical AI Agent Blueprints (Productized)

> **Tier 1 · Highest fit** — Turn Abetworks' 16 industry blueprints from CRM presets into **deep, standalone vertical AI-agent products**. Vertical AI is where 2026 margins, retention, and defensibility live, and Abetworks already has the two things most competitors lack: **one data model** and **governed, explainable AI**.

---

## 1. Strategic thesis

Horizontal AI (generic CRM, generic outreach, generic chatbot) is commoditized. In 2026 the durable business is **vertical AI agents** — software that encodes the pipeline stages, compliance rules, integrations, and language of one industry so deeply that switching feels like firing a trained employee.

Abetworks already ships industry blueprints. The gap: today they are configuration presets. The opportunity: package the **top 3** into full agent products with their own onboarding, pricing, SLAs, and go-to-market — each sold as an outcome, not a feature list.

**Selected top 3 (by demand × Abetworks moat fit):**

| Rank | Vertical | Flagship agent | Why this one |
|------|----------|----------------|--------------|
| 1 | Real Estate & Property | **Speed-to-Lead Agent** | Abetworks already claims this niche; speed-to-lead is a proven, quantifiable ROI story |
| 2 | Healthcare & Life Sciences | **Patient-Access Agent** | Fast-growing, compliance-heavy — governance/audit moat matters most here |
| 3 | Education & EdTech | **Admissions Agent** | Hindi/Marathi + parent comms plays to emerging-market moat |

Each vertical has its own folder:
- [`real-estate/`](./real-estate/PLAN.md)
- [`healthcare/`](./healthcare/PLAN.md)
- [`education/`](./education/PLAN.md)

---

## 2. Shared architecture (what makes these "deep", not presets)

Every vertical agent is built on the same Abetworks spine but ships with a **vertical intelligence pack**:

1. **Pre-trained intent + entity models** for the vertical (e.g., "site visit", "EMI", "referral", "counselling slot").
2. **Domain data model** — pipeline stages, fields, and record types specific to the industry, on the one shared data model.
3. **Compliance profile** — the governance rules that industry requires (audit logs, consent capture, residency).
4. **Channel pack** — WhatsApp-first + voice + email templates approved for the vertical.
5. **Playbook automations** — the AbetFlow flows that turn a lead/patient/applicant into a closed outcome.
6. **Vertical benchmarks** — the 3–4 metrics that industry cares about, published transparently.

> **Design rule:** Agents answer **only from approved sources and cite them**, scores refresh in near-real-time and **show their reasoning**, and field-level permissions apply to automations too. This is the non-negotiable Abetworks standard applied per vertical.

---

## 3. Productization model

Each vertical agent is sold in three commercial motions:

| Motion | What it is | Who buys | Price shape |
|--------|-----------|----------|-------------|
| **Self-serve SKU** | The agent as an add-on to NuCRM/AbetConnect | SMBs already on the suite | Per-seat + usage |
| **Blueprint deployment** | Fixed-fee sprint to configure + train + go live | Mid-market entering the vertical | Fixed-fee (services team) |
| **Managed agent** | Abetworks runs the agent + optimization | Enterprises without RevOps depth | Retainer + outcome bonus |

---

## 4. Build sequence (shared, 12 weeks per vertical, parallelizable)

- **Weeks 1–2:** Vertical discovery — interview 5–8 design-partner customers, capture the exact pipeline + compliance + language needs.
- **Weeks 3–5:** Data model + intent/entity packs + channel templates.
- **Weeks 6–8:** Playbook automations, explainable scoring tuned to vertical signals, audit/governance profile.
- **Weeks 9–10:** Design-partner pilots (3 customers), measure against the vertical's benchmark metrics.
- **Weeks 11–12:** Packaging (SKU, pricing, landing page, sales enablement), public launch.

---

## 5. Success metrics (portfolio level)

- 3 design partners live per vertical within one quarter.
- Published median benchmark per vertical (with weakest-case disclosure — consistent with Abetworks' methodology).
- Attach rate: % of existing suite customers adding at least one vertical agent.
- Gross margin per motion (self-serve should exceed 80%; managed 45–55%).

---

## 6. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Verticals dilute focus | Ship **one at a time**; real estate first, gate the next on pilot proof |
| "Preset, not product" perception | Lead every pitch with the vertical benchmark + a live cited-answer demo |
| Compliance liability (esp. healthcare) | Governance profile reviewed by domain counsel before GA |
| Channel dependency (WhatsApp policy) | Multi-channel fallback built into every playbook |

See each vertical's `PLAN.md` for the full industry-grade detail.
