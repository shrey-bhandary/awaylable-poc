import { AdkVoiceAgent } from "../agent/adkAgent.js";
import { SarvamClient, SarvamTtsResult } from "../integrations/sarvamClient.js";

type PipelineOptions = {
  sttTimeoutMs: number;
  llmTimeoutMs: number;
  ttsTimeoutMs: number;
  retryCount: number;
};

export type PipelineInput = {
  callerId: string;
  rawInput: string;
};

export type PipelineOutput = {
  transcription: string;
  answer: string;
  tts: SarvamTtsResult;
  knowledgeContext: string;
};

export class VoicePipeline {
  constructor(
    private readonly sarvam: SarvamClient,
    private readonly agent: AdkVoiceAgent,
    private readonly options: PipelineOptions
  ) {}

  private async withTimeout<T>(task: Promise<T>, timeoutMs: number, stage: string): Promise<T> {
    const timeoutPromise = new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${stage} timeout after ${timeoutMs}ms`)), timeoutMs);
    });
    return Promise.race([task, timeoutPromise]);
  }

  private async withRetry<T>(fn: () => Promise<T>, stage: string): Promise<T> {
    let lastError: unknown;
    const attempts = this.options.retryCount + 1;
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
      }
    }
    const message = lastError instanceof Error ? lastError.message : "unknown error";
    throw new Error(`${stage} failed after ${attempts} attempt(s): ${message}`);
  }

  async processTurn(input: PipelineInput): Promise<PipelineOutput> {
    const transcription = await this.withRetry(
      () => this.withTimeout(this.sarvam.transcribe(input.rawInput), this.options.sttTimeoutMs, "STT"),
      "STT"
    );

    const agentResult = await this.withRetry(
      () =>
        this.withTimeout(
          this.agent.respond({
            callerId: input.callerId,
            utterance: transcription
          }),
          this.options.llmTimeoutMs,
          "LLM"
        ),
      "LLM"
    );

    const tts = await this.withRetry(
      () => this.withTimeout(this.sarvam.synthesize(agentResult.answer), this.options.ttsTimeoutMs, "TTS"),
      "TTS"
    );

    return {
      transcription,
      answer: agentResult.answer,
      tts,
      knowledgeContext: agentResult.knowledgeContext
    };
  }
}
