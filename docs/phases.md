# Implementation Phases

## Phase 1 (implemented)

- Node.js + TypeScript project scaffold.
- Hardcoded knowledge base (FAQ, working hours, pricing).
- ADK-style agent orchestrator with Gemini client wrapper.
- Sarvam STT/TTS client wrapper with fallback mode.
- Mock telephony end-to-end session flow.
- LiveKit plugin availability checker.

## Phase 2 (in progress)

- Implemented: minimal web call console frontend (start/end call, turn-by-turn transcript, knowledge context and TTS payload view).
- Implemented: Exotel integration scaffold is present but feature-flagged off by default (`EXOTEL_ENABLED=false`) while provider checks/KYC are pending.
- Implemented: persistent call/event storage (`data/calls.json`) and stricter call-state transition checks.
- Implemented: replay-window validation and store-backed webhook dedupe checks.
- Implemented: live provider/event updates to frontend via SSE (`/api/events`) and call history panel.
- Implemented: media-turn bridge scaffold endpoint (`/api/exotel/media/turn`) for provider-driven turn handling (disabled until flag enabled).
- Next (deferred): Exotel integration in depth for RTP media bridge and true vSIP bidirectional audio path.
- Next (deferred): real media flow from Exotel transport into the voice pipeline with live audio frames/codec handling.

## Phase 3 (planned)

- Guardrails and safety policies.
- Retries, fallback responses, graceful terminations.
- Metrics and latency tracing.

## Phase 4 (planned)

- Deployment and CI.
- Operational runbook.
- UAT checklist and handoff.
