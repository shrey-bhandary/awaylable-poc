# Awaylable VA POC

Phone-calling user-agent POC split into 4 phases.

## Phase Status

- Phase 1 (implemented): TypeScript runtime, mock telephony flow, Gemini + Sarvam adapters, hardcoded KB.
- Phase 2 (in progress): minimal slick web frontend call console.
- Phase 3 (planned): quality, safety, observability.
- Phase 4 (planned): production-readiness and handoff.

## Tech Direction

- Orchestration: Google ADK-style agent module in Node.js.
- Model: Gemini 3.0 Flash (Google AI Studio key).
- Voice: Sarvam STT + TTS.
- LiveKit: primary media/session foundation with plugin compatibility checks.
- Telephony: browser/live-room POC first, Exotel deferred until provider checks/KYC completion.

## Quick Start

1. Install dependencies:
   npm install
2. Copy environment template:
   cp .env.example .env
3. Run web console:
   npm run dev:web
4. Open:
   http://localhost:3000

## CLI Demo (existing)

Run the original terminal mock flow:
   npm run demo

## Current Phase 2 Frontend Behavior

- Start and end call from browser UI.
- Send caller utterance turns from UI.
- See real-time transcript updates.
- Inspect knowledge context used for response generation.
- Inspect TTS payload from Sarvam wrapper.
- See live provider events via SSE.
- View persistent recent call history.

## Exotel vSIP Webhook Integration (Phase 2)

Status: deferred in active development scope. Endpoints remain feature-flagged and disabled by default.

- Feature flag: `EXOTEL_ENABLED=false` (default)
- To enable Exotel routes later: set `EXOTEL_ENABLED=true`

- Endpoint: `POST /api/exotel/webhook`
- Signature header accepted: `x-exotel-signature` (or `x-signature`)
- Signature verification: HMAC-SHA256 of raw body with `EXOTEL_WEBHOOK_SECRET` when `EXOTEL_ENFORCE_SIGNATURE=true`
- Event dedupe: store-backed idempotency by event ID
- Replay protection: timestamp validation with replay/future skew windows
- Session inspection: `GET /api/exotel/calls`
- Unified call listing: `GET /api/calls`
- Live event stream: `GET /api/events`
- Media-turn bridge scaffold: `POST /api/exotel/media/turn`

## Live Exotel + LiveKit Mode

You can now run the server in strict live mode where browser simulation endpoints are disabled.

- `EXOTEL_ENABLED=true`
- `EXOTEL_LIVE_ONLY_MODE=true`
- `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` must be set

When live-only mode is enabled:

- `/api/call/start`, `/api/call/:callId/turn`, `/api/call/:callId/end` return `410 Gone`
- Exotel webhook and media routes remain active
- LiveKit token endpoint is available: `POST /api/livekit/token`
   - Body can include `roomName` or `exotelCallSid`
   - Optional `participantName`

### Persistence

- Calls are persisted locally to `data/calls.json`.
- This enables call/event history across server restarts.

### Reliability Controls

- Stage-level timeout and retry controls are configurable through `.env`:
   - `STT_TIMEOUT_MS`
   - `LLM_TIMEOUT_MS`
   - `TTS_TIMEOUT_MS`
   - `STAGE_RETRY_COUNT`

### Quick local webhook test

Run server:
`npm run dev:web`

Send a sample webhook payload:
`node -e "fetch('http://localhost:3000/api/exotel/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({CallSid:'CA123',From:'+9198...',To:'+9111...',CallStatus:'ringing',EventType:'call_ringing',Timestamp:new Date().toISOString(),EventId:'evt-1'})}).then(r=>r.text()).then(console.log)"`

## Current Demo Behavior (Phase 1 CLI)

- Starts a mocked inbound call session.
- Accepts a text utterance as stand-in for incoming speech.
- Runs KB lookup + Gemini response generation.
- Synthesizes a mocked Sarvam TTS response payload.
- Logs transcript and ends call.

## Build Completion Checklist

- See `docs/full-build-requirements.md` for the complete pre-Phase-4 implementation and infrastructure requirements.
