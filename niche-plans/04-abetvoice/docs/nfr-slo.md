# AbetVoice — NFRs & SLOs

Inherits [baseline SLOs](../../00-platform-baseline/README.md#6-non-functional-requirements-baseline-slos).

| Metric | Target |
|--------|--------|
| Voice response round-trip | p95 < 800 ms |
| Outbound speed-to-lead call | placed < 60 s of lead creation |
| Concurrent lines per tenant tier | reserved + autoscaled |
| STT accuracy (Hindi/Marathi/English) | tracked; human fallback below threshold |
| Recording durability | S3 Mumbai, RPO ~0 post-call |

Scale: capacity modeled on **concurrent active calls**, not requests/sec. Media pods sized for peak concurrency × 1.5 headroom; provider fallback for STT/TTS.
