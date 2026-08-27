# AbetVoice — Architecture (production-grade)

> Built on the [Platform Baseline](../../00-platform-baseline/README.md). Real-time, low-latency voice path is the defining constraint.

## 1. Real-time media pipeline

```
PSTN / SIP trunk ─▶ media-gateway (LiveKit + SIP) ─▶ audio stream
                                                        │
                        ┌───────────────────────────────┼──────────────────┐
                        ▼                                ▼                   ▼
                    STT (streaming)              turn/barge-in mgr        VAD
                        │                                │
                        ▼                                ▼
                 voice-orchestrator (Py) ── RAG (cited) ── guardrails
                        │           │
                        │           └─▶ tool calls: booking-svc, core-crm, kyc-svc
                        ▼
                    TTS (streaming, multilingual) ─▶ back to caller
                        │
                        ▼
                 transcript + summary ─▶ core-crm (one record) + audit-log
```

## 2. Latency budget (target < 800 ms round-trip response)

| Stage | Budget |
|-------|--------|
| Streaming STT partials | ~150 ms |
| Orchestrator + RAG | ~300 ms |
| TTS first byte | ~200 ms |
| Network/media | ~150 ms |

Achieved via streaming everything, speculative TTS, and colocated media/AI pods in `ap-south-1`.

## 3. Scalability & reliability

- Media sessions are stateful → sticky routing to media-gateway pods; capacity planned per **concurrent lines**, autoscaled on active-session count.
- STT/TTS behind a model gateway with provider fallback.
- Every call transcribed + summarized async into the record; audio stored in S3 (residency Mumbai) with retention policy.
- Graceful human handoff when confidence low or caller requests.
