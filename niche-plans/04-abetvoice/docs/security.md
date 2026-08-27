# AbetVoice — Security & Compliance

Inherits [baseline security](../../00-platform-baseline/README.md#7-security--compliance-dpdp-aligned). Deltas:

- **DND/consent** check before every outbound call (TRAI-aligned); licensed SIP providers only.
- **Call recording consent** disclosed at call start; recordings encrypted, residency Mumbai, retention configurable.
- **PII redaction** in transcripts (card/Aadhaar-like patterns masked).
- Same field-level RBAC + audit as suite — a voice agent cannot read fields its role can't.
