# AbetVoice — Data Model

> PostgreSQL 16, RLS by `tenant_id`. Calls unify into the platform `record`.

```
call(id, tenant_id, record_id, direction[inbound|outbound], from_e164, to_e164, language, started_at, ended_at, outcome, recording_s3_ref)
transcript(id, tenant_id, call_id, segments jsonb, redactions jsonb)
call_summary(id, tenant_id, call_id, summary, intents jsonb, citations jsonb, escalated bool)
voice_line(id, tenant_id, sip_uri, concurrency_limit, language_default)
dnd_check(id, tenant_id, e164, status, checked_at)   -- outbound compliance
```

Recordings are stored encrypted in S3 (Mumbai) with per-tenant retention; transcripts carry PII redaction metadata.
