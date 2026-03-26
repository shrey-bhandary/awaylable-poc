import "dotenv/config";
import { z } from "zod";

const envBoolean = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n", "off", ""].includes(normalized)) {
      return false;
    }
  }
  return value;
}, z.boolean());

const envSchema = z.object({
  APP_MODE: z.enum(["mock", "web", "exotel"]).default("mock"),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  DATA_DIR: z.string().default("data"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.0-flash"),
  STT_TIMEOUT_MS: z.coerce.number().int().positive().default(6000),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
  TTS_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  STAGE_RETRY_COUNT: z.coerce.number().int().min(0).max(3).default(1),
  SARVAM_API_KEY: z.string().optional(),
  SARVAM_BASE_URL: z.string().url().default("https://api.sarvam.ai"),
  SARVAM_STT_PATH: z.string().default("/v1/speech-to-text"),
  SARVAM_TTS_PATH: z.string().default("/text-to-speech"),
  SARVAM_VOICE: z.string().default("en-IN-anushka"),
  SARVAM_ONLY_MODE: envBoolean.default(true),
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  LIVEKIT_ROOM_PREFIX: z.string().default("awaylable-live"),
  EXOTEL_ENABLED: envBoolean.default(false),
  EXOTEL_LIVE_ONLY_MODE: envBoolean.default(false),
  EXOTEL_SUBDOMAIN: z.string().optional(),
  EXOTEL_SIP_DOMAIN: z.string().optional(),
  EXOTEL_WEBHOOK_SECRET: z.string().optional(),
  EXOTEL_ENFORCE_SIGNATURE: envBoolean.default(false),
  EXOTEL_REPLAY_WINDOW_SECONDS: z.coerce.number().int().positive().default(300),
  EXOTEL_MAX_FUTURE_SKEW_SECONDS: z.coerce.number().int().positive().default(120),
  MOCK_CALLER: z.string().default("+919900000000"),
  MOCK_CALLEE: z.string().default("Awaylable Reception")
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid environment: ${result.error.message}`);
  }
  return result.data;
}
