# AbetField — Offline-First Field-Sales Capture

> **Product:** AbetField · field.abetworks.in
> **Tier 3.8 · Opportunistic** — Offline field capture for FMCG/distribution: a rare, valuable capability in emerging markets where connectivity is unreliable.
> **Positioning:** "Every visit, every order, captured — signal or no signal."

---

## 1. The opportunity

FMCG and distribution run on field reps visiting thousands of outlets, often in low/no-connectivity areas. Existing tools fail offline or sync badly, losing orders and visit data. Abetworks already lists "offline field capture" as a differentiator — AbetField makes it a product.

## 2. What AbetField does

1. **Offline-first mobile app** — capture visits, orders, stock, and KYC photos with zero connectivity.
2. **Reliable sync** — idempotent, delta, conflict-resolved sync when back online.
3. **Beat/route planning** — territory, beat plans, geo-verified check-in.
4. **Field orders** — GST-aware order capture with stock allocation, into the one data model.
5. **Governed** — same permissions/audit; every offline capture reconciled with provenance.

## 3. Why Abetworks wins

Emerging-market-first architecture (offline capture, WhatsApp, GST, multi-language) is already an Abetworks moat. Few global CRMs handle true offline distribution workflows.

## 4. Go-to-market

- **ICP:** FMCG brands, distributors, and field-heavy manufacturers with 50–5,000 reps.
- **Wedge:** "Never lose a field order to a dead zone."
- **Pricing:** per-rep seat + order-volume tier.

## 5. Build phases

1. Offline-first mobile app (Android-first) + on-device store.
2. Sync engine (idempotent, delta, conflict resolution).
3. Beat planning + geo check-in.
4. Field order + stock capture (GST-aware).
5. Distributor/territory reporting.

## 6. Risks

| Risk | Mitigation |
|------|-----------|
| Sync conflicts / data loss | Deterministic per-entity conflict policy + idempotent replay |
| Device fragmentation (low-end Android) | Android-first, lightweight, tested on low-end devices |
| Fraudulent check-ins | Server-verified geo + timestamps |
