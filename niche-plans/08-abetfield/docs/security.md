# AbetField — Security & Compliance

Inherits [baseline security](../../00-platform-baseline/README.md#7-security--compliance-dpdp-aligned). Deltas:

- **On-device encryption** of the local SQLite store; remote wipe on device loss.
- **Geo-verified check-in** to prevent fraudulent visits; server-side validation.
- Media (KYC photos/signatures) encrypted, residency Mumbai, retention policy.
- Offline captures are timestamped locally and audited on sync with provenance.
