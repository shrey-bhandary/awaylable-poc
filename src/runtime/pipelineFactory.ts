import { loadConfig } from "../config.js";
import { AdkVoiceAgent } from "../agent/adkAgent.js";
import { GeminiClient } from "../integrations/geminiClient.js";
import { SarvamClient } from "../integrations/sarvamClient.js";
import { VoicePipeline } from "../voice/pipeline.js";

type RuntimeLogger = (entry: {
  component: string;
  action: string;
  status: "ok" | "error";
  details?: Record<string, unknown>;
}) => void;

export function createVoicePipeline(runtimeLogger?: RuntimeLogger) {
  const config = loadConfig();

  const gemini = new GeminiClient({
    apiKey: config.GEMINI_API_KEY,
    model: config.GEMINI_MODEL,
    onLog: runtimeLogger
  });

  const sarvam = new SarvamClient({
    apiKey: config.SARVAM_API_KEY,
    baseUrl: config.SARVAM_BASE_URL,
    sttPath: config.SARVAM_STT_PATH,
    ttsPath: config.SARVAM_TTS_PATH,
    voice: config.SARVAM_VOICE,
    sarvamOnlyMode: config.SARVAM_ONLY_MODE,
    onLog: runtimeLogger
  });

  const agent = new AdkVoiceAgent(gemini);
  const pipeline = new VoicePipeline(sarvam, agent, {
    sttTimeoutMs: config.STT_TIMEOUT_MS,
    llmTimeoutMs: config.LLM_TIMEOUT_MS,
    ttsTimeoutMs: config.TTS_TIMEOUT_MS,
    retryCount: config.STAGE_RETRY_COUNT
  });

  return { config, pipeline };
}
