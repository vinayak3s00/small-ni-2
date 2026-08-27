# AbetVoice — Scaffolding

```
scaffolding/
├── services/
│   ├── media-gateway/        # LiveKit + SIP, sticky sessions
│   ├── voice-orchestrator/   # Python — STT->RAG->TTS, barge-in, tools
│   └── telephony-svc/        # NestJS — call records, DND, provider fallback
└── deploy/
    ├── helm/values.yaml      # concurrency-based HPA
    └── terraform/main.tf
```

Capacity is planned on **concurrent lines**; the HPA scales media-gateway on active-session count, not RPS.
