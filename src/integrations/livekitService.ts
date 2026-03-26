import { AccessToken } from "livekit-server-sdk";

export type LiveKitServiceConfig = {
  apiKey?: string;
  apiSecret?: string;
  roomPrefix: string;
};

export type LiveKitTokenInput = {
  participantName: string;
  roomName: string;
};

export function buildExotelRoomName(roomPrefix: string, callSid: string): string {
  const safe = callSid.trim().replace(/[^a-zA-Z0-9_-]/g, "-");
  return `${roomPrefix}-exotel-${safe}`;
}

export class LiveKitService {
  constructor(private readonly config: LiveKitServiceConfig) {}

  hasCredentials(): boolean {
    return Boolean(this.config.apiKey && this.config.apiSecret);
  }

  async createToken(input: LiveKitTokenInput): Promise<string> {
    if (!this.config.apiKey || !this.config.apiSecret) {
      throw new Error("LiveKit credentials are missing");
    }

    const at = new AccessToken(this.config.apiKey, this.config.apiSecret, {
      identity: input.participantName,
      name: input.participantName,
      ttl: "1h"
    });

    at.addGrant({
      roomJoin: true,
      room: input.roomName,
      canPublish: true,
      canSubscribe: true
    });

    return at.toJwt();
  }
}
