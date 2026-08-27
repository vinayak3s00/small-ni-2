# AbetVerticals — Security & Compliance Profile

Inherits [baseline security](../../00-platform-baseline/README.md#7-security--compliance-dpdp-aligned). Vertical deltas:

- **AbetCare:** consent-first health messaging; DPDP + health-data retention; audit-grade trails; governance profile reviewed by domain counsel before GA; no clinical advice by design.
- **AbetRealty:** DND registry check before outbound; RERA-compliant claims; immutable attribution audit for channel-partner payout disputes.
- **AbetAdmit:** minor-safe (parent/guardian primary contact); logged fee/scholarship commitments to prevent misselling disputes.

All three: field-level RBAC applied to automations, append-only audit with S3 Object Lock, residency pinned to `ap-south-1`.
