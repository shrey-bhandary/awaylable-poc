import { VoicePipeline } from "../voice/pipeline.js";

export type MockCallSession = {
  callId: string;
  from: string;
  to: string;
  startedAt: string;
  endedAt?: string;
  transcript: Array<{ speaker: "caller" | "agent"; text: string }>;
};

export async function runMockInboundCall(args: {
  from: string;
  to: string;
  pipeline: VoicePipeline;
  callerUtterance: string;
}): Promise<MockCallSession> {
  const callId = `mock-${Date.now()}`;
  const session: MockCallSession = {
    callId,
    from: args.from,
    to: args.to,
    startedAt: new Date().toISOString(),
    transcript: []
  };

  session.transcript.push({ speaker: "caller", text: args.callerUtterance });

  const output = await args.pipeline.processTurn({
    callerId: args.from,
    rawInput: args.callerUtterance
  });

  session.transcript.push({ speaker: "agent", text: output.answer });
  session.endedAt = new Date().toISOString();

  console.log("--- MOCK CALL SESSION ---");
  console.log(JSON.stringify(session, null, 2));
  console.log("--- KNOWLEDGE USED ---");
  console.log(output.knowledgeContext);
  console.log("--- TTS PAYLOAD ---");
  console.log(JSON.stringify(output.tts, null, 2));

  return session;
}
