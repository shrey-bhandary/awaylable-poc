# Full Build Requirements (Pre-Phase 4)

This checklist captures what is still required to move from current POC implementation to a fully operational Exotel vSIP voice-agent system.

## 1) External Accounts and Credentials

- Exotel account with vSIP enabled and inbound/outbound number configured.
- Exotel webhook signing secret shared with backend (`EXOTEL_WEBHOOK_SECRET`).
- Gemini API key with quota for call concurrency target.
- Sarvam API credentials for production STT/TTS usage.
- LiveKit project credentials if media/session backbone is used in final transport architecture.

## 2) Telephony and Network Setup

- Public HTTPS endpoint reachable by Exotel webhook service.
- TLS certificate for webhook host.
- SIP trunk registration details from Exotel (domain, auth parameters, codecs).
- Firewall rules and IP allow-listing for provider callbacks where supported.
- NTP-synced server clock to support webhook replay-window checks.

## 3) Media Path Completion

- Replace text-only `/api/exotel/media/turn` simulation with true RTP/media stream handling.
- Real-time STT ingestion from call audio.
- TTS audio playback injection back into active call leg.
- Barge-in/interruption handling and silence detection policy.
- Codec/sample-rate conversion policy and QA matrix.

## 4) Persistence and Data Policy

- Move from local file persistence (`data/calls.json`) to managed persistence (Postgres/Redis).
- Durable idempotency store for webhook events.
- Call and event retention policy (PII and compliance aware).
- Transcript encryption at rest and access control.

## 5) Reliability and Safety

- Final retry and timeout values tuned under load.
- Safe fallback prompts for STT/LLM/TTS failures.
- Circuit-breaker behavior for provider outages.
- Prompt and response guardrails for policy-sensitive queries.
- Log redaction and PII handling standards.

## 6) Observability

- Structured logs with call correlation IDs.
- Metrics for call success, drop reason, STT/LLM/TTS latency, response rate.
- Alerting thresholds and incident runbook.
- Dashboard for live call health and provider error rates.

## 7) Frontend Operational Features

- Live Exotel status rendering already connected via SSE; extend to call filtering and session drill-down.
- Audio playback controls for synthesized responses.
- Operator panel for active-call monitoring and override controls.
- Pagination/search for call history at scale.

## 8) Testing and Validation

- Exotel sandbox E2E tests for happy path and edge cases.
- Duplicate webhook and replay-window tests.
- Mid-call disconnect, no-answer, busy, and timeout scenarios.
- Concurrency/load tests matching expected peak calls.
- Regression tests for KB grounding and policy-safe responses.

## 9) Deployment Readiness

- Containerization and immutable deploy artifact.
- Secrets management in deployment platform.
- CI pipeline for lint, typecheck, tests, smoke integration.
- Staging environment mirroring production network and provider settings.

## 10) Phase-4 Gate Criteria

- Real SIP/media path proven in staging.
- Observability + alerting verified.
- Security review and key rotation process documented.
- UAT checklist signed off for business scenarios.
- Rollback plan validated.
