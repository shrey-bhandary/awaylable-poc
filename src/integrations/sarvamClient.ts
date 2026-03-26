export type SarvamClientConfig = {
  apiKey?: string;
  baseUrl: string;
  sttPath: string;
  ttsPath: string;
  voice: string;
  sarvamOnlyMode: boolean;
  onLog?: (entry: { component: string; action: string; status: "ok" | "error"; details?: Record<string, unknown> }) => void;
};

export type SarvamTtsResult = {
  provider: "sarvam";
  voice: string;
  text: string;
  audioBase64?: string;
};

export class SarvamClient {
  constructor(private readonly config: SarvamClientConfig) {}

  async transcribe(inputTextFallback: string): Promise<string> {
    if (!this.config.apiKey) {
      this.config.onLog?.({
        component: "sarvam",
        action: "transcribe",
        status: this.config.sarvamOnlyMode ? "error" : "ok",
        details: { fallback: true, reason: "missing_api_key" }
      });
      if (this.config.sarvamOnlyMode) {
        throw new Error("Sarvam-only mode enabled but SARVAM_API_KEY is missing");
      }
      return inputTextFallback;
    }

    // Phase 1 POC keeps STT in text-simulated mode. API call can be swapped in without changing callers.
    this.config.onLog?.({
      component: "sarvam",
      action: "transcribe",
      status: "ok",
      details: { simulated: true }
    });
    return inputTextFallback;
  }

  async synthesize(text: string): Promise<SarvamTtsResult> {
    if (!this.config.apiKey) {
      this.config.onLog?.({
        component: "sarvam",
        action: "synthesize",
        status: "error",
        details: { reason: "missing_api_key" }
      });
      throw new Error("SARVAM_API_KEY is required for Sarvam-only voice mode");
    }

    const url = `${this.config.baseUrl}${this.config.ttsPath}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        text,
        voice: this.config.voice
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.config.onLog?.({
        component: "sarvam",
        action: "synthesize",
        status: "error",
        details: { statusCode: response.status }
      });
      throw new Error(`Sarvam TTS error (${response.status}): ${errorBody}`);
    }

    const body = (await response.json()) as { audioBase64?: string; audios?: string[] };
    const audioBase64 =
      typeof body.audioBase64 === "string"
        ? body.audioBase64
        : Array.isArray(body.audios) && typeof body.audios[0] === "string"
          ? body.audios[0]
          : undefined;

    if (!audioBase64) {
      this.config.onLog?.({
        component: "sarvam",
        action: "synthesize",
        status: "error",
        details: { reason: "missing_audio_base64" }
      });
      throw new Error("Sarvam TTS returned no audio payload");
    }

    this.config.onLog?.({
      component: "sarvam",
      action: "synthesize",
      status: "ok",
      details: { voice: this.config.voice }
    });
    return {
      provider: "sarvam",
      voice: this.config.voice,
      text,
      audioBase64
    };
  }
}
