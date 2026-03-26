import fs from "node:fs";
import path from "node:path";

export type TranscriptLine = {
  speaker: "caller" | "agent";
  text: string;
  timestamp: string;
};

export type CallProvider = "web" | "exotel";

export type CallStatus =
  | "created"
  | "initiated"
  | "ringing"
  | "in-progress"
  | "completed"
  | "failed"
  | "busy"
  | "no-answer"
  | "canceled";

export type ProviderEvent = {
  eventId: string;
  eventType: string;
  status: CallStatus;
  timestamp: string;
  raw: Record<string, unknown>;
};

export type CallSession = {
  callId: string;
  provider: CallProvider;
  externalCallId?: string;
  from: string;
  to: string;
  status: CallStatus;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  transcript: TranscriptLine[];
  providerEvents: ProviderEvent[];
};

type CallStoreOptions = {
  persistFilePath?: string;
};

const terminalStatuses: CallStatus[] = ["completed", "failed", "busy", "no-answer", "canceled"];

const transitionAllowlist: Record<CallStatus, CallStatus[]> = {
  created: ["initiated", "ringing", "in-progress", "failed", "canceled", "completed"],
  initiated: ["ringing", "in-progress", "failed", "busy", "no-answer", "canceled", "completed"],
  ringing: ["in-progress", "failed", "busy", "no-answer", "canceled", "completed"],
  "in-progress": ["completed", "failed", "canceled"],
  completed: [],
  failed: [],
  busy: [],
  "no-answer": [],
  canceled: []
};

export class CallSessionStore {
  private readonly sessions = new Map<string, CallSession>();
  private readonly externalIndex = new Map<string, string>();
  private readonly providerEventIds = new Set<string>();
  private readonly persistFilePath?: string;

  constructor(options?: CallStoreOptions) {
    this.persistFilePath = options?.persistFilePath;
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (!this.persistFilePath || !fs.existsSync(this.persistFilePath)) {
      return;
    }

    try {
      const raw = fs.readFileSync(this.persistFilePath, "utf8");
      const parsed = JSON.parse(raw) as { sessions?: CallSession[] };
      const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];

      for (const session of sessions) {
        this.sessions.set(session.callId, session);
        if (session.externalCallId) {
          const indexKey = `${session.provider}:${session.externalCallId}`;
          this.externalIndex.set(indexKey, session.callId);
        }
        for (const event of session.providerEvents) {
          this.providerEventIds.add(event.eventId);
        }
      }
    } catch {
      // Keep startup resilient for malformed local files in POC mode.
    }
  }

  private saveToDisk(): void {
    if (!this.persistFilePath) {
      return;
    }

    const dir = path.dirname(this.persistFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const payload = JSON.stringify({ sessions: Array.from(this.sessions.values()) }, null, 2);
    fs.writeFileSync(this.persistFilePath, payload, "utf8");
  }

  createSession(from: string, to: string): CallSession {
    const callId = `web-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();
    const session: CallSession = {
      callId,
      provider: "web",
      from,
      to,
      status: "created",
      startedAt: now,
      updatedAt: now,
      transcript: [],
      providerEvents: []
    };

    this.sessions.set(callId, session);
    this.saveToDisk();
    return session;
  }

  getOrCreateProviderSession(args: {
    provider: CallProvider;
    externalCallId: string;
    from: string;
    to: string;
  }): CallSession {
    const indexKey = `${args.provider}:${args.externalCallId}`;
    const existingId = this.externalIndex.get(indexKey);
    if (existingId) {
      const existing = this.sessions.get(existingId);
      if (existing) {
        return existing;
      }
    }

    const callId = `${args.provider}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();
    const session: CallSession = {
      callId,
      provider: args.provider,
      externalCallId: args.externalCallId,
      from: args.from,
      to: args.to,
      status: "created",
      startedAt: now,
      updatedAt: now,
      transcript: [],
      providerEvents: []
    };

    this.sessions.set(callId, session);
    this.externalIndex.set(indexKey, callId);
    this.saveToDisk();
    return session;
  }

  getSession(callId: string): CallSession | undefined {
    return this.sessions.get(callId);
  }

  listSessions(provider?: CallProvider): CallSession[] {
    const all = Array.from(this.sessions.values());
    if (!provider) {
      return all;
    }
    return all.filter((session) => session.provider === provider);
  }

  appendTranscript(callId: string, line: TranscriptLine): CallSession {
    const session = this.sessions.get(callId);
    if (!session) {
      throw new Error("Session not found");
    }

    session.transcript.push(line);
    session.updatedAt = new Date().toISOString();
    this.saveToDisk();
    return session;
  }

  updateStatus(callId: string, status: CallStatus): CallSession {
    const session = this.sessions.get(callId);
    if (!session) {
      throw new Error("Session not found");
    }

    if (session.status !== status) {
      const allowedNext = transitionAllowlist[session.status];
      if (!allowedNext.includes(status)) {
        throw new Error(`Invalid call status transition: ${session.status} -> ${status}`);
      }
    }

    session.status = status;
    session.updatedAt = new Date().toISOString();
    if (terminalStatuses.includes(status)) {
      session.endedAt = session.endedAt ?? new Date().toISOString();
    }

    this.saveToDisk();
    return session;
  }

  appendProviderEvent(callId: string, event: ProviderEvent): CallSession {
    const session = this.sessions.get(callId);
    if (!session) {
      throw new Error("Session not found");
    }

    if (this.providerEventIds.has(event.eventId)) {
      return session;
    }

    session.providerEvents.push(event);
    this.providerEventIds.add(event.eventId);
    session.updatedAt = new Date().toISOString();
    this.saveToDisk();
    return session;
  }

  hasProviderEvent(eventId: string): boolean {
    return this.providerEventIds.has(eventId);
  }

  endSession(callId: string): CallSession {
    const session = this.sessions.get(callId);
    if (!session) {
      throw new Error("Session not found");
    }

    session.status = "completed";
    session.updatedAt = new Date().toISOString();
    session.endedAt = new Date().toISOString();
    this.saveToDisk();
    return session;
  }
}
