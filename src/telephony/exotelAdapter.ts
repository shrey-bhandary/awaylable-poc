import crypto from "node:crypto";
import { CallSession, CallSessionStore, CallStatus } from "./callSessionStore.js";

export type ExotelPhase2Config = {
  exotelWebhookSecret?: string;
  enforceSignature: boolean;
  replayWindowSeconds: number;
  maxFutureSkewSeconds: number;
};

export type ExotelWebhookEvent = {
  eventId: string;
  eventType: string;
  callSid: string;
  timestamp: string;
  from: string;
  to: string;
  status: CallStatus;
  payload: Record<string, unknown>;
};

export type WebhookHandleResult = {
  accepted: boolean;
  duplicate: boolean;
  session: CallSession;
  event: ExotelWebhookEvent;
};

function getStringValue(payload: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function mapExotelStatus(raw: string, eventType: string): CallStatus {
  const value = `${raw} ${eventType}`.toLowerCase();

  if (value.includes("ring")) {
    return "ringing";
  }
  if (value.includes("answer") || value.includes("in-progress") || value.includes("connected")) {
    return "in-progress";
  }
  if (value.includes("busy")) {
    return "busy";
  }
  if (value.includes("no-answer") || value.includes("no answer")) {
    return "no-answer";
  }
  if (value.includes("cancel")) {
    return "canceled";
  }
  if (value.includes("fail") || value.includes("error")) {
    return "failed";
  }
  if (value.includes("complete") || value.includes("end") || value.includes("hangup")) {
    return "completed";
  }
  if (value.includes("init") || value.includes("start") || value.includes("new")) {
    return "initiated";
  }
  return "initiated";
}

function safeEqualsHexSignature(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

export class ExotelAdapter {
  private readonly processedEventIds = new Set<string>();

  constructor(
    private readonly config: ExotelPhase2Config,
    private readonly callStore: CallSessionStore
  ) {}

  verifySignature(rawBody: Buffer, signatureHeader?: string): void {
    if (!this.config.enforceSignature) {
      return;
    }

    if (!this.config.exotelWebhookSecret) {
      throw new Error("Missing EXOTEL_WEBHOOK_SECRET while signature enforcement is enabled");
    }

    if (!signatureHeader) {
      throw new Error("Missing Exotel signature header");
    }

    const computed = crypto.createHmac("sha256", this.config.exotelWebhookSecret).update(rawBody).digest("hex");

    const received = signatureHeader.replace(/^sha256=/i, "").trim();
    if (!received || !safeEqualsHexSignature(computed, received)) {
      throw new Error("Invalid Exotel webhook signature");
    }
  }

  private verifyReplayWindow(timestamp: string): void {
    const eventTime = Date.parse(timestamp);
    if (Number.isNaN(eventTime)) {
      throw new Error("Invalid webhook timestamp");
    }

    const now = Date.now();
    const ageSeconds = Math.floor((now - eventTime) / 1000);
    if (ageSeconds > this.config.replayWindowSeconds) {
      throw new Error("Webhook rejected: outside replay window");
    }

    if (ageSeconds < -this.config.maxFutureSkewSeconds) {
      throw new Error("Webhook rejected: timestamp too far in the future");
    }
  }

  handleWebhook(payload: Record<string, unknown>): WebhookHandleResult {
    const callSid = getStringValue(payload, ["CallSid", "call_sid", "callSid"]);
    if (!callSid) {
      throw new Error("Exotel webhook payload missing CallSid");
    }

    const from = getStringValue(payload, ["From", "from", "Caller", "caller"], "unknown");
    const to = getStringValue(payload, ["To", "to", "Callee", "callee"], "unknown");
    const eventType = getStringValue(payload, ["EventType", "event_type", "eventType"], "status-update");
    const rawStatus = getStringValue(payload, ["CallStatus", "call_status", "status"], "initiated");
    const timestamp = getStringValue(payload, ["Timestamp", "timestamp", "EventTime"], new Date().toISOString());
    this.verifyReplayWindow(timestamp);

    const status = mapExotelStatus(rawStatus, eventType);
    const eventId = getStringValue(payload, ["EventId", "event_id", "Sid"], `${callSid}:${eventType}:${rawStatus}:${timestamp}`);

    const session = this.callStore.getOrCreateProviderSession({
      provider: "exotel",
      externalCallId: callSid,
      from,
      to
    });

    if (this.processedEventIds.has(eventId) || this.callStore.hasProviderEvent(eventId)) {
      return {
        accepted: true,
        duplicate: true,
        session,
        event: {
          eventId,
          eventType,
          callSid,
          timestamp,
          from,
          to,
          status,
          payload
        }
      };
    }

    this.processedEventIds.add(eventId);
    const updatedSession = this.callStore.updateStatus(session.callId, status);
    this.callStore.appendProviderEvent(updatedSession.callId, {
      eventId,
      eventType,
      status,
      timestamp,
      raw: payload
    });

    return {
      accepted: true,
      duplicate: false,
      session: updatedSession,
      event: {
        eventId,
        eventType,
        callSid,
        timestamp,
        from,
        to,
        status,
        payload
      }
    };
  }
}
