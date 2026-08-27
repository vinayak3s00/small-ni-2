# AbetPartner — Security & Compliance

Inherits [baseline security](../../00-platform-baseline/README.md#7-security--compliance-dpdp-aligned). Deltas:

- **Client-data walls:** partner users cannot read raw client PII unless the client grants scope (`workspace_grant`); all cross-workspace access audited.
- **Sender-identity isolation** prevents cross-client reputation/deliverability bleed.
- **Sub-processor transparency:** partners get a data-processing addendum reflecting the agency→client relationship (DPDP-aligned).
- Per-workspace encryption keys optional for sensitive clients.
