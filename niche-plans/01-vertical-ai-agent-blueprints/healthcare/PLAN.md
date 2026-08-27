# Healthcare Patient-Access Agent

> **Vertical:** Healthcare & life sciences (hospitals, multi-specialty clinics, diagnostics chains, healthtech)
> **Flagship outcome:** Automated, compliant patient access — appointment booking, intake, and referral follow-up — with an audit-grade trail behind every conversation.
> **Why now:** Healthcare voice/patient-access AI is one of the fastest-growing categories in 2026, and it is compliance-heavy — exactly where Abetworks' governance moat is decisive.

---

## 1. The problem

Patient access is where healthcare revenue leaks and patient experience breaks:

- Front desks and call centers miss calls; patients don't get callbacks; appointments go unbooked.
- Intake is manual, repetitive, and error-prone.
- Referral loops (GP → specialist → diagnostics) drop patients between providers.
- WhatsApp conversations live on a branch manager's or receptionist's personal phone — no logging, no SLA, no handover, and a compliance liability.

## 2. The agent (what it does)

1. **Answers patient enquiries 24/7** across WhatsApp, voice, and web, in the patient's language.
2. **Books, reschedules, and reminds** for appointments and diagnostics, checking real availability.
3. **Collects intake** (reason for visit, history flags, insurance/TPA details) into a structured record before the visit.
4. **Runs referral follow-up** — ensures the patient actually reaches the specialist/diagnostic step, closing the loop.
5. **Answers only from approved clinical/administrative sources and cites them** — no hallucinated medical claims; anything clinical is escalated to staff.
6. **Escalates** with a summary; every interaction is logged, SLA-tracked, and handed over cleanly.

> **Boundary:** This is a **patient-access and administrative** agent, not a diagnostic or clinical-advice tool. Clinical questions are routed to qualified staff by design.

## 3. Domain data model

- **Record types:** Patient, Appointment, Encounter/Intake, Referral, Provider, Diagnostic Order.
- **Journey stages:** Enquiry → Booked → Intake Complete → Visited → Referred/Follow-up → Closed.
- **Key fields:** specialty, provider, slot, TPA/insurer, consent flags, referral source/target, care-journey status.

## 4. Compliance profile (the moat)

- **Consent-first** messaging and explicit opt-in for health communications.
- **Audit-grade communication trails** — every read, export, and message logged (field-level permissions applied to automations too).
- **Data residency in Mumbai** and configurable retention aligned to Indian health-data expectations (e.g., DPDP Act obligations).
- Role-based access so front-desk, clinician, and admin see only what they're permitted to.
- Governance profile reviewed by domain counsel before GA.

## 5. Channel & language pack

- WhatsApp-first + inbound/outbound voice; multilingual (Hindi, Marathi, English, extensible).
- Appointment confirmations, prep instructions, reminders, and post-visit follow-up.

## 6. Benchmark metrics (publish medians, disclose weakest case)

| Metric | Target signal |
|--------|---------------|
| Enquiries resolved without staff | 60–70% (administrative tier-1) |
| First-response time | < 1 minute |
| No-show reduction | 15–30% via reminders + easy reschedule |
| Referral loop closure rate | measurable, previously untracked |

## 7. Go-to-market

- **ICP:** multi-specialty clinics and diagnostics chains (5–50 locations); healthtech platforms needing patient comms infra.
- **Wedge:** "Every patient conversation logged, SLA-tracked, and compliant — off personal phones."
- **Proof:** 3 design partners; publish resolution + no-show metrics.
- **Pricing:** per-location + per-seat; managed-agent retainer for chains without RevOps.

## 8. 12-week build plan

1. Weeks 1–2: 5 clinic/diagnostics design partners; map access + referral + intake flows and compliance needs.
2. Weeks 3–5: patient data model, scheduling integrations, consent + audit profile, approved-source knowledge base.
3. Weeks 6–8: booking/intake/referral automations, cited-answer agent, escalation + handover.
4. Weeks 9–10: pilots; measure resolution + no-show + loop closure.
5. Weeks 11–12: packaging, counsel review, launch.

## 9. Risks

| Risk | Mitigation |
|------|-----------|
| Clinical liability | Hard boundary: no clinical advice; escalate; cite approved sources only |
| Data-protection exposure (DPDP) | Consent-first, residency, retention, audit — reviewed by counsel |
| Scheduling system fragmentation | Adapter layer + manual fallback |
| Patient trust in AI | Transparent "you're talking to an assistant" + fast human escalation |
