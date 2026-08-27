# Real Estate Speed-to-Lead Agent

> **Vertical:** Real estate & property (developers, brokerages, property platforms, channel-partner networks)
> **Flagship outcome:** Sub-60-second first response to every inbound enquiry, automated site-visit booking, and clean channel-partner attribution — on one record.

---

## 1. The problem (industry-grade framing)

In Indian real estate, a lead is a perishable asset. Portals (99acres, Housing, MagicBricks), Meta/Google ads, and channel partners all dump enquiries into a fragmented mess of WhatsApp numbers, personal phones, and spreadsheets. Consequences:

- **Speed-to-lead failure:** the developer/broker who calls first usually wins; most respond in hours, not seconds.
- **Attribution chaos:** which channel partner or campaign produced the sale is contested, so payouts and ad spend are guesses.
- **Site-visit leakage:** booked visits are forgotten, double-booked, or lost when a salesperson leaves.
- **Portal cost waste:** expensive portal leads die because no one worked them.

## 2. The agent (what it does)

A vertical AI agent on the Abetworks spine that:

1. **Captures** every enquiry across WhatsApp, portal webhooks, call, web form, and Meta/Google lead ads into one record.
2. **Responds in seconds** — WhatsApp + voice callback, qualifying budget, location, configuration (2BHK/3BHK), possession timeline, and financing need.
3. **Scores in real time and explains why** (e.g., "84: ready-to-move budget match + site-visit intent + verified phone") so managers trust and correct it.
4. **Books site visits** directly into the sales team's calendar with reminders and reschedule handling.
5. **Attributes** the lead to the exact channel partner / campaign / portal, tracking it through to booking for accurate payouts and ROAS.
6. **Escalates** hot leads to a human with a summary; nurtures cold ones with drip sequences.

## 3. Domain data model

- **Record types:** Enquiry, Project, Unit/Inventory, Site Visit, Channel Partner, Booking.
- **Pipeline stages:** New → Contacted → Qualified → Site-Visit Booked → Visited → Negotiation → Booked → Registered.
- **Key fields:** budget band, configuration, possession preference, loan requirement, source/sub-source, RERA project ID, CP code.

## 4. Compliance profile

- Consent capture for marketing calls/messages (DND-aware).
- **RERA-aware** communications (no misleading claims; project registration references).
- Audit trail of every message and quote for dispute resolution with channel partners.
- Data residency in Mumbai (already an Abetworks capability).

## 5. Channel & language pack

- WhatsApp-first with approved templates; voice callback in **Hindi, Marathi, English** (extensible to regional languages).
- Site-visit confirmations, reminders, and post-visit feedback flows.

## 6. Benchmark metrics (publish medians, disclose weakest case)

| Metric | Target signal |
|--------|---------------|
| Median first-response time | < 60 seconds |
| Site-visit booking rate from qualified leads | +25–40% |
| CP/campaign attribution coverage | > 95% of bookings sourced |
| Portal-lead working rate | > 90% contacted within SLA |

## 7. Go-to-market

- **ICP:** mid-size developers (3–15 active projects) and brokerages with 20–200 agents, channel-partner-heavy.
- **Wedge:** "Never lose a portal lead again — sub-minute response, guaranteed." Tie to portal spend waste.
- **Proof:** reuse existing customer evidence (e.g., interiors/property testimonials) and run 3 design partners.
- **Pricing:** per-seat add-on + per-project inventory module; blueprint deployment fixed-fee for larger developers.

## 8. 12-week build plan

1. Weeks 1–2: 5 developer/brokerage design partners; capture portal + CP workflows.
2. Weeks 3–5: enquiry data model, portal webhook connectors, WhatsApp templates.
3. Weeks 6–8: speed-to-lead automation, explainable scoring, CP attribution engine, RERA/consent profile.
4. Weeks 9–10: pilots; measure response time + site-visit lift.
5. Weeks 11–12: SKU, pricing, landing page, sales enablement, launch.

## 9. Risks

| Risk | Mitigation |
|------|-----------|
| Portal API/webhook fragility | Multiple ingestion paths (webhook, email parse, manual) |
| Salespeople bypass to personal WhatsApp | Route all numbers through AbetConnect; log everything |
| CP payout disputes | Immutable audit trail as the single source of truth |
