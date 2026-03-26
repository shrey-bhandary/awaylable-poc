import { VoicePipeline } from "../voice/pipeline.js";
import { CallSessionStore } from "./callSessionStore.js";

export type ExotelMediaTurnRequest = {
  callSid: string;
  from: string;
  to: string;
  transcriptionText: string;
};

export type ExotelMediaTurnResult = {
  callId: string;
  answer: string;
  knowledgeContext: string;
  tts: {
    provider: "sarvam";
    voice: string;
    text: string;
    audioBase64?: string;
  };
};

export class ExotelMediaBridge {
  constructor(
    private readonly callStore: CallSessionStore,
    private readonly pipeline: VoicePipeline
  ) {}

  async processTurn(input: ExotelMediaTurnRequest): Promise<ExotelMediaTurnResult> {
    if (!input.callSid.trim()) {
      throw new Error("callSid is required");
    }
    if (!input.transcriptionText.trim()) {
      throw new Error("transcriptionText is required");
    }

    const session = this.callStore.getOrCreateProviderSession({
      provider: "exotel",
      externalCallId: input.callSid,
      from: input.from || "unknown",
      to: input.to || "unknown"
    });

    this.callStore.updateStatus(session.callId, "in-progress");
    this.callStore.appendTranscript(session.callId, {
      speaker: "caller",
      text: input.transcriptionText,
      timestamp: new Date().toISOString()
    });

    const output = await this.pipeline.processTurn({
      callerId: input.from,
      rawInput: input.transcriptionText
    });

    const updated = this.callStore.appendTranscript(session.callId, {
      speaker: "agent",
      text: output.answer,
      timestamp: new Date().toISOString()
    });

    return {
      callId: updated.callId,
      answer: output.answer,
      knowledgeContext: output.knowledgeContext,
      tts: output.tts
    };
  }
}
