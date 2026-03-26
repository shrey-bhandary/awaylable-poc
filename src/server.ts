import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createVoicePipeline } from "./runtime/pipelineFactory.js";
import { checkLiveKitPluginAvailability } from "./integrations/livekitPlugins.js";
import { buildExotelRoomName, LiveKitService } from "./integrations/livekitService.js";
import { CallProvider, CallSession, CallSessionStore } from "./telephony/callSessionStore.js";
import { ExotelAdapter } from "./telephony/exotelAdapter.js";
import { ExotelMediaBridge } from "./telephony/exotelMediaBridge.js";

type RawBodyRequest = express.Request & { rawBody?: Buffer };

type RuntimeLogEntry = {
  id: string;
  at: string;
  component: string;
  action: string;
  status: "ok" | "error";
  details?: Record<string, unknown>;
};

const app = express();
app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      (req as RawBodyRequest).rawBody = Buffer.from(buf);
    }
  })
);

const runtimeLogs: RuntimeLogEntry[] = [];

function pushRuntimeLog(entry: Omit<RuntimeLogEntry, "id" | "at">): RuntimeLogEntry {
  const payload: RuntimeLogEntry = {
    id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    at: new Date().toISOString(),
    ...entry
  };

  runtimeLogs.push(payload);
  if (runtimeLogs.length > 300) {
    runtimeLogs.shift();
  }

  const event = `data: ${JSON.stringify({ type: "runtime-log", entry: payload })}\n\n`;
  for (const client of sseClients) {
    client.write(event);
  }

  return payload;
}

const { config, pipeline } = createVoicePipeline((entry) => {
  pushRuntimeLog(entry);
});
const callStore = new CallSessionStore({
  persistFilePath: path.join(process.cwd(), config.DATA_DIR, "calls.json")
});
const exotelEnabled = config.EXOTEL_ENABLED;
const exotelLiveOnlyMode = config.EXOTEL_LIVE_ONLY_MODE;
const liveKitService = new LiveKitService({
  apiKey: config.LIVEKIT_API_KEY,
  apiSecret: config.LIVEKIT_API_SECRET,
  roomPrefix: config.LIVEKIT_ROOM_PREFIX
});

if (exotelLiveOnlyMode && !exotelEnabled) {
  throw new Error("EXOTEL_LIVE_ONLY_MODE=true requires EXOTEL_ENABLED=true");
}

if (exotelLiveOnlyMode && !liveKitService.hasCredentials()) {
  throw new Error("EXOTEL_LIVE_ONLY_MODE=true requires LIVEKIT_API_KEY and LIVEKIT_API_SECRET");
}

const exotelAdapter = exotelEnabled
  ? new ExotelAdapter(
      {
        exotelWebhookSecret: config.EXOTEL_WEBHOOK_SECRET,
        enforceSignature: config.EXOTEL_ENFORCE_SIGNATURE,
        replayWindowSeconds: config.EXOTEL_REPLAY_WINDOW_SECONDS,
        maxFutureSkewSeconds: config.EXOTEL_MAX_FUTURE_SKEW_SECONDS
      },
      callStore
    )
  : null;
const exotelMediaBridge = exotelEnabled ? new ExotelMediaBridge(callStore, pipeline) : null;
const sseClients = new Set<express.Response>();

function exotelDisabledResponse(res: express.Response): express.Response {
  return res.status(404).json({
    ok: false,
    error: "Exotel integration is disabled for current phase. Set EXOTEL_ENABLED=true to enable."
  });
}

function liveOnlyModeResponse(res: express.Response): express.Response {
  return res.status(410).json({
    ok: false,
    error: "Web simulation endpoints are disabled. Use Exotel webhook/media flow in live-only mode."
  });
}

function broadcastEvent(event: {
  type: string;
  session: CallSession;
  provider: CallProvider;
  at: string;
  details?: Record<string, unknown>;
}): void {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "../public");

app.get("/api/health", async (_req, res) => {
  const plugins = await checkLiveKitPluginAvailability();
  res.json({
    ok: true,
    mode: config.APP_MODE,
    sarvamOnlyMode: config.SARVAM_ONLY_MODE,
    exotelLiveOnlyMode,
    exotel: {
      enabled: exotelEnabled,
      hasWebhookSecret: Boolean(config.EXOTEL_WEBHOOK_SECRET),
      enforceSignature: config.EXOTEL_ENFORCE_SIGNATURE,
      replayWindowSeconds: config.EXOTEL_REPLAY_WINDOW_SECONDS
    },
    livekit: {
      urlConfigured: Boolean(config.LIVEKIT_URL),
      hasApiKey: Boolean(config.LIVEKIT_API_KEY),
      hasApiSecret: Boolean(config.LIVEKIT_API_SECRET),
      roomPrefix: config.LIVEKIT_ROOM_PREFIX
    },
    plugins
  });
});

app.get("/api/logs", (_req, res) => {
  res.json({ count: runtimeLogs.length, logs: runtimeLogs });
});

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: "connected", at: new Date().toISOString() })}\n\n`);
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

app.get("/api/calls", (req, res) => {
  const providerParam = typeof req.query.provider === "string" ? req.query.provider : undefined;
  const provider = providerParam === "web" || providerParam === "exotel" ? providerParam : undefined;
  const sessions = callStore.listSessions(provider);
  res.json({ count: sessions.length, sessions });
});

app.post("/api/exotel/webhook", (req, res) => {
  if (!exotelEnabled || !exotelAdapter) {
    return exotelDisabledResponse(res);
  }

  try {
    const signatureHeader =
      (req.header("x-exotel-signature") ?? req.header("x-signature") ?? "").trim() || undefined;
    const rawBody = (req as RawBodyRequest).rawBody ?? Buffer.from(JSON.stringify(req.body));
    exotelAdapter.verifySignature(rawBody, signatureHeader);

    const result = exotelAdapter.handleWebhook(req.body as Record<string, unknown>);
    broadcastEvent({
      type: "provider-event",
      provider: "exotel",
      session: result.session,
      at: new Date().toISOString(),
      details: {
        duplicate: result.duplicate,
        eventType: result.event.eventType,
        status: result.event.status
      }
    });

    return res.status(200).json({
      ok: true,
      duplicate: result.duplicate,
      callId: result.session.callId,
      externalCallId: result.session.externalCallId,
      status: result.session.status
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook error";
    return res.status(400).json({ ok: false, error: message });
  }
});

app.get("/api/exotel/calls", (_req, res) => {
  if (!exotelEnabled) {
    return exotelDisabledResponse(res);
  }

  const sessions = callStore.listSessions("exotel");
  res.json({ count: sessions.length, sessions });
});

app.post("/api/exotel/media/turn", async (req, res) => {
  if (!exotelEnabled || !exotelMediaBridge) {
    return exotelDisabledResponse(res);
  }

  try {
    const callSid = typeof req.body?.callSid === "string" ? req.body.callSid : "";
    const from = typeof req.body?.from === "string" ? req.body.from : "unknown";
    const to = typeof req.body?.to === "string" ? req.body.to : "unknown";
    const transcriptionText =
      typeof req.body?.transcriptionText === "string" ? req.body.transcriptionText : "";

    const result = await exotelMediaBridge.processTurn({
      callSid,
      from,
      to,
      transcriptionText
    });

    const session = callStore.getSession(result.callId);
    if (session) {
      broadcastEvent({
        type: "provider-media-turn",
        provider: session.provider,
        session,
        at: new Date().toISOString()
      });
    }

    return res.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown media bridge error";
    return res.status(400).json({ ok: false, error: message });
  }
});

app.post("/api/livekit/token", async (req, res) => {
  try {
    const participantName =
      typeof req.body?.participantName === "string" && req.body.participantName.trim()
        ? req.body.participantName.trim()
        : "awaylable-operator";

    const explicitRoomName =
      typeof req.body?.roomName === "string" && req.body.roomName.trim() ? req.body.roomName.trim() : "";
    const exotelCallSid =
      typeof req.body?.exotelCallSid === "string" && req.body.exotelCallSid.trim() ? req.body.exotelCallSid.trim() : "";

    const roomName = explicitRoomName || (exotelCallSid ? buildExotelRoomName(config.LIVEKIT_ROOM_PREFIX, exotelCallSid) : "");
    if (!roomName) {
      return res.status(400).json({ error: "roomName or exotelCallSid is required" });
    }

    const token = await liveKitService.createToken({ participantName, roomName });
    pushRuntimeLog({
      component: "livekit",
      action: "create-token",
      status: "ok",
      details: { roomName, participantName }
    });
    return res.json({
      ok: true,
      token,
      roomName,
      url: config.LIVEKIT_URL
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown LiveKit token error";
    pushRuntimeLog({
      component: "livekit",
      action: "create-token",
      status: "error",
      details: { error: message }
    });
    return res.status(400).json({ error: message });
  }
});

app.post("/api/call/start", (req, res) => {
  if (exotelLiveOnlyMode) {
    return liveOnlyModeResponse(res);
  }

  const from = typeof req.body?.from === "string" && req.body.from.trim() ? req.body.from : config.MOCK_CALLER;
  const to = typeof req.body?.to === "string" && req.body.to.trim() ? req.body.to : config.MOCK_CALLEE;

  const session = callStore.createSession(from, to);
  pushRuntimeLog({
    component: "call",
    action: "start",
    status: "ok",
    details: { callId: session.callId }
  });
  broadcastEvent({
    type: "call-started",
    provider: session.provider,
    session,
    at: new Date().toISOString()
  });
  res.status(201).json({ session });
});

app.post("/api/call/:callId/turn", async (req, res) => {
  if (exotelLiveOnlyMode) {
    return liveOnlyModeResponse(res);
  }

  try {
    const callId = req.params.callId;
    const session = callStore.getSession(callId);
    if (!session) {
      return res.status(404).json({ error: "Call session not found" });
    }

    if (session.endedAt) {
      return res.status(409).json({ error: "Call already ended" });
    }

    const utterance = typeof req.body?.utterance === "string" ? req.body.utterance.trim() : "";
    if (!utterance) {
      return res.status(400).json({ error: "utterance is required" });
    }

    callStore.appendTranscript(callId, {
      speaker: "caller",
      text: utterance,
      timestamp: new Date().toISOString()
    });

    pushRuntimeLog({
      component: "call",
      action: "turn-request",
      status: "ok",
      details: { callId }
    });

    const output = await pipeline.processTurn({
      callerId: session.from,
      rawInput: utterance
    });

    const updatedSession = callStore.appendTranscript(callId, {
      speaker: "agent",
      text: output.answer,
      timestamp: new Date().toISOString()
    });

    pushRuntimeLog({
      component: "call",
      action: "turn-response",
      status: "ok",
      details: { callId }
    });

    broadcastEvent({
      type: "call-turn",
      provider: updatedSession.provider,
      session: updatedSession,
      at: new Date().toISOString()
    });

    return res.json({
      session: updatedSession,
      knowledgeContext: output.knowledgeContext,
      tts: output.tts
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    pushRuntimeLog({
      component: "call",
      action: "turn-response",
      status: "error",
      details: { error: message }
    });
    return res.status(500).json({ error: message });
  }
});

app.post("/api/call/:callId/end", (req, res) => {
  if (exotelLiveOnlyMode) {
    return liveOnlyModeResponse(res);
  }

  try {
    const session = callStore.endSession(req.params.callId);
    pushRuntimeLog({
      component: "call",
      action: "end",
      status: "ok",
      details: { callId: session.callId }
    });
    broadcastEvent({
      type: "call-ended",
      provider: session.provider,
      session,
      at: new Date().toISOString()
    });
    res.json({ session });
  } catch {
    res.status(404).json({ error: "Call session not found" });
  }
});

app.get("/api/call/:callId", (req, res) => {
  if (exotelLiveOnlyMode) {
    return liveOnlyModeResponse(res);
  }

  const session = callStore.getSession(req.params.callId);
  if (!session) {
    return res.status(404).json({ error: "Call session not found" });
  }
  return res.json({ session });
});

app.use(express.static(publicDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

const startPort = Number(config.WEB_PORT ?? 3000);

function listenWithFallback(port: number, attemptsLeft: number): void {
  const server = app.listen(port, () => {
    console.log(`Web call console ready on http://localhost:${port}`);
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 0) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is in use, retrying on ${nextPort}...`);
      listenWithFallback(nextPort, attemptsLeft - 1);
      return;
    }

    throw error;
  });
}

listenWithFallback(startPort, 5);
